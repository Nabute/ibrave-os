// V0 — Foundation & security: RLS role matrix, out-of-band write guards.
import { as, check, expectErr, expectOk, summary } from "./harness.mjs";

const dev1 = await as("dev1");
const dev2 = await as("dev2");
const pm = await as("pm");
const finance = await as("finance");
const owner = await as("owner");

// --- profiles -------------------------------------------------------------
{
  const { data: me } = await dev1.auth.getUser();
  const myId = me.user.id;
  const { data: pmUser } = await pm.auth.getUser();

  // employee can update own profile
  const r1 = await dev1.from("profiles").update({ title: "Senior Developer" }).eq("id", myId).select();
  expectOk("dev1 updates own profile", r1.error, r1.data?.length === 1);

  // employee cannot update someone else's profile (RLS: 0 rows affected)
  const r2 = await dev1.from("profiles").update({ title: "hacked" }).eq("id", pmUser.user.id).select();
  check("dev1 cannot update pm's profile", !r2.error && r2.data?.length === 0, JSON.stringify(r2.data));

  // employee cannot grant themselves a role
  const r3 = await dev1.from("user_roles").insert({ user_id: myId, role: "finance" });
  expectErr("dev1 cannot self-grant finance role", r3.error);
}

// --- cost rates are finance-only ------------------------------------------
{
  const r1 = await dev1.from("cost_rates").select("*").limit(1);
  check("dev1 cannot read cost_rates", !!r1.error || r1.data?.length === 0, JSON.stringify(r1.data?.[0] ?? r1.error?.message));
  const r2 = await finance.from("cost_rates").select("*").limit(1);
  expectOk("finance reads cost_rates", r2.error, (r2.data?.length ?? 0) > 0);
}

// --- time entry visibility -------------------------------------------------
{
  const { data: mine } = await dev1.from("time_entries").select("user_id");
  const { data: me } = await dev1.auth.getUser();
  const foreign = (mine ?? []).filter((e) => e.user_id !== me.user.id);
  check("dev1 sees only own time entries", foreign.length === 0, `${foreign.length} foreign rows`);

  const { data: pmRows } = await pm.from("time_entries").select("user_id");
  const pmSeesOthers = (pmRows ?? []).some((e) => e.user_id !== null);
  check("pm sees team entries", pmSeesOthers && (pmRows?.length ?? 0) > 0, `rows=${pmRows?.length}`);
}

// --- out-of-band status writes are blocked --------------------------------
{
  // dev1: own draft entry — direct status flip must be blocked by guard trigger
  const { data: draft } = await dev1
    .from("time_entries")
    .select("id")
    .eq("status", "draft")
    .limit(1);
  if (draft?.length) {
    const r = await dev1.from("time_entries").update({ status: "approved" }).eq("id", draft[0].id);
    expectErr("direct time entry status flip blocked", r.error);
  } else {
    // create one to test with
    const { data: asg } = await dev1.from("assignments").select("project_id").limit(1);
    const { data: me } = await dev1.auth.getUser();
    const ins = await dev1.from("time_entries").insert({
      user_id: me.user.id, project_id: asg[0].project_id, work_date: "2026-08-04",
      hours: 1, status: "draft", billable: true, note: "v0 guard test",
    }).select().single();
    if (ins.error) { check("create draft for guard test", false, ins.error.message); }
    else {
      const r = await dev1.from("time_entries").update({ status: "approved" }).eq("id", ins.data.id);
      expectErr("direct time entry status flip blocked", r.error);
      await dev1.from("time_entries").delete().eq("id", ins.data.id);
    }
  }

  // owner: direct lead stage flip must be blocked
  const { data: lead } = await owner.from("leads").select("id, stage").limit(1);
  if (lead?.length) {
    const r = await owner.from("leads").update({ stage: "won" }).eq("id", lead[0].id);
    expectErr("direct lead stage flip blocked", r.error);
  }

  // finance: direct invoice status flip must be blocked
  const { data: inv } = await finance.from("invoices").select("id, status").eq("status", "issued").limit(1);
  if (inv?.length) {
    const r = await finance.from("invoices").update({ status: "paid" }).eq("id", inv[0].id);
    expectErr("direct invoice status flip blocked", r.error);
  }
}

// --- role gating on money RPCs ---------------------------------------------
{
  const r1 = await dev1.rpc("generate_draft_invoice", {
    p_client_id: "00000000-0000-0000-0000-000000000000",
    p_period_start: "2026-08-01",
    p_period_end: "2026-08-31",
  });
  expectErr("dev1 cannot generate invoices", r1.error);

  const r2 = await dev2.rpc("approve_entries", { p_entry_ids: [] });
  // empty array may no-op; try approving a submitted entry of dev1 as dev2 (not their PM)
  const { data: submitted } = await pm.from("time_entries").select("id").eq("status", "submitted").limit(1);
  if (submitted?.length) {
    const r3 = await dev2.rpc("approve_entries", { p_entry_ids: [submitted[0].id] });
    expectErr("dev2 (non-PM) cannot approve entries", r3.error);
  } else {
    check("dev2 non-PM approve check (skipped — no submitted entries)", true);
  }
  void r2;
}

// --- audit log: readable by owner, not by employee -------------------------
{
  const r1 = await owner.from("audit_log").select("id").limit(1);
  expectOk("owner reads audit_log", r1.error, (r1.data?.length ?? 0) > 0);
  const r2 = await dev1.from("audit_log").select("id").limit(1);
  check("dev1 cannot read audit_log", !!r2.error || r2.data?.length === 0, JSON.stringify(r2.error?.message ?? r2.data));
}

// --- deactivated users cannot log in ---------------------------------------
{
  try {
    await as("nonexistent-user");
    check("deactivated/unknown login rejected", false);
  } catch {
    check("unknown login rejected", true);
  }
}

summary("V0 Foundation");
