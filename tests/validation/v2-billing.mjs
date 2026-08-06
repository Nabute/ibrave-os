// V2 — Billing: rate resolution (effective-dated), draft generation, per-client
// numbering, freeze-on-issue, payments, credit note, void, delete-draft release.
// Runs against a dedicated test client (VTST) so demo data stays clean.
import { as, check, expectErr, expectOk, summary } from "./harness.mjs";

const dev1 = await as("dev1");
const pm = await as("pm");
const finance = await as("finance");

const { data: meD } = await dev1.auth.getUser();
const dev1Id = meD.user.id;
const { data: mePm } = await pm.auth.getUser();
const pmId = mePm.user.id;

// ---------- setup: client, project, rates, assignment ----------------------
let client;
{
  const existing = await finance.from("clients").select("*").eq("code", "VTST").maybeSingle();
  if (existing.data) client = existing.data;
  else {
    const ins = await finance.from("clients").insert({
      name: "Validation Test Client", code: "VTST", currency: "USD",
      payment_terms_days: 14, tier: "c", contact_email: "billing@vtst.test",
    }).select().single();
    expectOk("finance creates test client", ins.error);
    client = ins.data;
  }
}

let project;
{
  const existing = await finance.from("projects").select("*").eq("code", "VTST-1").maybeSingle();
  if (existing.data) project = existing.data;
  else {
    const ins = await finance.from("projects").insert({
      client_id: client.id, name: "VTST Delivery", code: "VTST-1",
      billing_model: "tm", status: "active", pm_id: pmId,
    }).select().single();
    expectOk("finance creates test project", ins.error);
    project = ins.data;
  }
}

{
  const { data: asg } = await finance.from("assignments").select("id").eq("project_id", project.id).eq("user_id", dev1Id);
  if (!asg?.length) {
    const ins = await finance.from("assignments").insert({
      user_id: dev1Id, project_id: project.id, start_date: "2026-01-01", allocation_pct: 50,
    });
    expectOk("assign dev1 to test project", ins.error);
  }
}

{
  const { data: cards } = await finance.from("rate_cards").select("id, effective_from").eq("project_id", project.id);
  if (!cards?.length) {
    const c1 = await finance.from("rate_cards").insert({ project_id: project.id, effective_from: "2026-01-01", note: "base" }).select().single();
    const c2 = await finance.from("rate_cards").insert({ project_id: project.id, effective_from: "2026-06-18", note: "raise" }).select().single();
    expectOk("create two effective-dated rate cards", c1.error ?? c2.error);
    const l1 = await finance.from("rate_card_lines").insert({ rate_card_id: c1.data.id, user_id: dev1Id, hourly_rate_minor: 10000 });
    const l2 = await finance.from("rate_card_lines").insert({ rate_card_id: c2.data.id, user_id: dev1Id, hourly_rate_minor: 12000 });
    expectOk("create rate lines ($100 → $120)", l1.error ?? l2.error);
  }
}

// ---------- rate resolution -------------------------------------------------
{
  const r1 = await finance.rpc("resolve_rate", { p_user_id: dev1Id, p_project_id: project.id, p_work_date: "2026-06-15" });
  check("rate on 2026-06-15 = $100 (first card)", Number(r1.data) === 10000, `got ${r1.data} ${r1.error?.message ?? ""}`);
  const r2 = await finance.rpc("resolve_rate", { p_user_id: dev1Id, p_project_id: project.id, p_work_date: "2026-06-22" });
  check("rate on 2026-06-22 = $120 (effective-dated raise)", Number(r2.data) === 12000, `got ${r2.data}`);
}

// ---------- approved billable hours ----------------------------------------
async function logApproved(date, hours, weekStart) {
  const del = await dev1.from("time_entries").delete().eq("user_id", dev1Id).eq("work_date", date).eq("status", "draft");
  void del;
  const ins = await dev1.from("time_entries").insert({
    user_id: dev1Id, project_id: project.id, work_date: date, hours, status: "draft", billable: true, note: "v2 billing test",
  }).select().single();
  if (ins.error) return { error: ins.error };
  const sub = await dev1.rpc("submit_week", { p_week_start: weekStart });
  if (sub.error) return { error: sub.error };
  const app = await pm.rpc("approve_entries", { p_entry_ids: [ins.data.id] });
  return { error: app.error, id: ins.data.id };
}

// Only create if VTST has no unbilled June entries yet (idempotent reruns)
const { data: existingUnbilled } = await finance
  .from("time_entries").select("id").eq("project_id", project.id).is("invoice_id", null).eq("status", "approved");
if (!existingUnbilled?.length) {
  const a = await logApproved("2026-06-15", 4, "2026-06-15");
  const b = await logApproved("2026-06-22", 2, "2026-06-22");
  expectOk("log + approve 4h @100 and 2h @120", a.error ?? b.error);
}

// ---------- unbilled report shows the work ---------------------------------
{
  const { data: unbilled, error } = await finance.rpc("unbilled_report").then(
    (r) => r, () => ({ data: null, error: { message: "rpc missing" } })
  );
  if (error) {
    // unbilled may be a view instead
    const v = await finance.from("v_unbilled_work").select("*");
    const row = (v.data ?? []).find((r) => r.client_name?.includes("Validation"));
    check("unbilled report shows VTST work", !!row && Number(row.value_minor) === 64000,
      JSON.stringify(row ?? v.error?.message));
  } else {
    const row = (unbilled ?? []).find((r) => r.client_name?.includes("Validation"));
    check("unbilled report shows VTST work", !!row && Number(row.value_minor) === 64000, JSON.stringify(row));
  }
}

// ---------- draft generation ------------------------------------------------
let inv1;
{
  const gen = await finance.rpc("generate_draft_invoice", {
    p_client_id: client.id, p_period_start: "2026-06-01", p_period_end: "2026-06-30",
  });
  expectOk("generate June draft", gen.error);
  inv1 = gen.data;
  check("draft total = 4×$100 + 2×$120 = $640.00", Number(inv1?.total_minor) === 64000, `total=${inv1?.total_minor}`);
  check("draft has no number yet", inv1?.number == null, `number=${inv1?.number}`);

  // generating again for same period must not double-bill
  const gen2 = await finance.rpc("generate_draft_invoice", {
    p_client_id: client.id, p_period_start: "2026-06-01", p_period_end: "2026-06-30",
  });
  const dup = gen2.data;
  check("regenerate for same period yields empty/zero draft (no double-billing)",
    !!gen2.error || Number(dup?.total_minor ?? 0) === 0, `total=${dup?.total_minor} err=${gen2.error?.message}`);
  if (dup?.id) await finance.rpc("delete_draft_invoice", { p_invoice_id: dup.id });

  // employees cannot see invoices at all
  const peek = await dev1.from("invoices").select("id").eq("id", inv1.id);
  check("dev1 cannot see invoices", (peek.data?.length ?? 0) === 0, JSON.stringify(peek.data));
}

// ---------- issue: numbering, stamping, freeze ------------------------------
let issued1;
{
  const iss = await finance.rpc("issue_invoice", { p_invoice_id: inv1.id });
  expectOk("issue June invoice", iss.error);
  issued1 = iss.data;
  check("number format INV-VTST-2026-NNNN", /^INV-VTST-2026-\d{4}$/.test(issued1?.number ?? ""), `number=${issued1?.number}`);

  const due = new Date(); due.setDate(due.getDate() + 14);
  check("due date = issue + client terms (14d)", issued1?.due_date === due.toISOString().slice(0, 10),
    `due=${issued1?.due_date}`);

  const { data: stamped } = await finance.from("time_entries")
    .select("id").eq("project_id", project.id).eq("invoice_id", inv1.id);
  check("entries stamped with invoice id at issue", (stamped?.length ?? 0) >= 2, `stamped=${stamped?.length}`);

  // frozen: no new lines, no line edits, no delete, no re-issue
  const addLine = await finance.from("invoice_lines").insert({
    invoice_id: inv1.id, kind: "manual", description: "sneaky", quantity: 1,
    unit_price_minor: 100, amount_minor: 100, position: 99,
  });
  expectErr("issued invoice: adding line blocked", addLine.error);
  const { data: lines } = await finance.from("invoice_lines").select("id, amount_minor").eq("invoice_id", inv1.id).limit(1);
  const editLine = await finance.from("invoice_lines").update({ amount_minor: 1 }).eq("id", lines[0].id).select();
  check("issued invoice: editing line blocked", !!editLine.error || editLine.data?.length === 0, editLine.error?.message ?? "edited!");
  const reIssue = await finance.rpc("issue_invoice", { p_invoice_id: inv1.id });
  expectErr("re-issue blocked by FSM", reIssue.error);
  const delIssued = await finance.rpc("delete_draft_invoice", { p_invoice_id: inv1.id });
  expectErr("delete issued invoice blocked", delIssued.error);
}

// ---------- payments --------------------------------------------------------
{
  const p1 = await finance.rpc("record_payment", { p_invoice_id: inv1.id, p_amount_minor: 30000, p_paid_at: "2026-08-06", p_method: "wire", p_note: "v2 partial" });
  expectOk("partial payment accepted", p1.error);
  check("status → partially_paid", p1.data?.status === "partially_paid", `status=${p1.data?.status}`);

  const pNeg = await finance.rpc("record_payment", { p_invoice_id: inv1.id, p_amount_minor: -5000, p_paid_at: "2026-08-06" });
  expectErr("negative payment rejected", pNeg.error);

  const pOver = await finance.rpc("record_payment", { p_invoice_id: inv1.id, p_amount_minor: 99000, p_paid_at: "2026-08-06" });
  expectErr("overpayment beyond outstanding rejected", pOver.error);

  const p2 = await finance.rpc("record_payment", { p_invoice_id: inv1.id, p_amount_minor: 34000, p_paid_at: "2026-08-06", p_method: "wire", p_note: "v2 final" });
  expectOk("final payment accepted", p2.error);
  check("status → paid", p2.data?.status === "paid", `status=${p2.data?.status}`);

  const p3 = await finance.rpc("record_payment", { p_invoice_id: inv1.id, p_amount_minor: 100, p_paid_at: "2026-08-06" });
  expectErr("payment on fully paid invoice blocked", p3.error);
}

// ---------- second invoice: numbering sequence + void -----------------------
{
  const c = await logApproved("2026-07-01", 1, "2026-06-29");
  expectOk("log 1h in July for second invoice", c.error);
  const gen = await finance.rpc("generate_draft_invoice", {
    p_client_id: client.id, p_period_start: "2026-07-01", p_period_end: "2026-07-31",
  });
  expectOk("generate July draft", gen.error);
  const iss = await finance.rpc("issue_invoice", { p_invoice_id: gen.data.id });
  expectOk("issue July invoice", iss.error);
  const n1 = Number((issued1.number ?? "").slice(-4));
  const n2 = Number((iss.data.number ?? "").slice(-4));
  check("per-client sequence increments (n+1)", n2 === n1 + 1, `${issued1.number} → ${iss.data.number}`);

  // void with reason; entries stay stamped (corrections via credit note)
  const noReason = await finance.rpc("void_invoice", { p_invoice_id: gen.data.id, p_reason: "" });
  expectErr("void without reason rejected", noReason.error);
  const v = await finance.rpc("void_invoice", { p_invoice_id: gen.data.id, p_reason: "v2 validation void" });
  expectOk("void with reason succeeds", v.error);
  check("voided status", v.data?.status === "void", `status=${v.data?.status}`);
  const pv = await finance.rpc("record_payment", { p_invoice_id: gen.data.id, p_amount_minor: 100 });
  expectErr("payment on void invoice blocked", pv.error);
}

// ---------- credit note -----------------------------------------------------
{
  const cn = await finance.rpc("create_credit_note", { p_invoice_id: inv1.id, p_amount_minor: 5000, p_description: "v2 goodwill credit" });
  expectOk("credit note created", cn.error);
  check("credit note number CN-VTST-2026-NNNN", /^CN-VTST-2026-\d{4}$/.test(cn.data?.number ?? ""), `number=${cn.data?.number}`);
  check("credit note total is negative", Number(cn.data?.total_minor) === -5000, `total=${cn.data?.total_minor}`);
  const cnBad = await finance.rpc("create_credit_note", { p_invoice_id: inv1.id, p_amount_minor: -100, p_description: "bad" });
  expectErr("negative credit amount rejected", cnBad.error);
}

// ---------- delete draft releases entries -----------------------------------
{
  const c = await logApproved("2026-07-02", 1, "2026-06-29");
  expectOk("log 1h for delete-draft test", c.error);
  const gen = await finance.rpc("generate_draft_invoice", {
    p_client_id: client.id, p_period_start: "2026-07-01", p_period_end: "2026-07-31",
  });
  expectOk("generate draft to delete", gen.error);
  check("draft picked up the 1h", Number(gen.data?.total_minor) === 12000, `total=${gen.data?.total_minor}`);
  const del = await finance.rpc("delete_draft_invoice", { p_invoice_id: gen.data.id });
  expectOk("delete draft succeeds", del.error);
  const gen2 = await finance.rpc("generate_draft_invoice", {
    p_client_id: client.id, p_period_start: "2026-07-01", p_period_end: "2026-07-31",
  });
  check("entries released after draft delete (regenerate finds them)", Number(gen2.data?.total_minor) === 12000, `total=${gen2.data?.total_minor}`);
  if (gen2.data?.id) await finance.rpc("delete_draft_invoice", { p_invoice_id: gen2.data.id });
}

summary("V2 Billing");
