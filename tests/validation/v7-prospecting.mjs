// V7 — Prospecting & accounts: cadence lifecycle + task queue, DNC stops
// everything, convert → lead, account health, opportunities, Account 360.
import { as, check, expectErr, expectOk, summary } from "./harness.mjs";

const dev1 = await as("dev1");
const owner = await as("owner");
const finance = await as("finance");
const { data: meO } = await owner.auth.getUser();
const ownerId = meO.user.id;

// --- prospect + cadence ------------------------------------------------------
let prospect, cadence, run;
{
  // clear artifacts from any previous (crashed) validation run
  await owner.from("prospects").delete().like("company", "V7 %");
  await owner.from("cadences").delete().eq("name", "V7 Test Cadence");
  const p = await owner.from("prospects").insert({
    company: "V7 Prospect GmbH", contact_name: "Pia Prospect", email: "pia@v7.test",
    source: "outbound", fit_score: 4, owner_id: ownerId,
  }).select().single();
  expectOk("sales creates prospect", p.error);
  prospect = p.data;

  const devTry = await dev1.from("prospects").select("id").limit(1);
  check("employee cannot read prospects", !!devTry.error || devTry.data?.length === 0,
    devTry.error?.message ?? JSON.stringify(devTry.data));

  let { data: cad } = await owner.from("cadences").select("*").eq("name", "V7 Test Cadence").maybeSingle();
  if (!cad) {
    const c = await owner.from("cadences").insert({
      name: "V7 Test Cadence",
      steps: [
        { kind: "email", note: "Intro email", day_offset: 0 },
        { kind: "call", note: "Follow-up call", day_offset: 2 },
      ],
    }).select().single();
    expectOk("create cadence", c.error);
    cad = c.data;
  }
  cadence = cad;

  const r = await owner.rpc("start_cadence", { p_prospect_id: prospect.id, p_cadence_id: cadence.id });
  expectOk("start cadence", r.error);
  run = r.data;

  const dup = await owner.rpc("start_cadence", { p_prospect_id: prospect.id, p_cadence_id: cadence.id });
  expectErr("second active cadence on same prospect blocked", dup.error, "already has an active cadence");

  const { data: task } = await owner.from("sales_tasks").select("*").eq("cadence_run_id", run.id).is("done_at", null);
  check("step-1 task created (due today)",
    task?.length === 1 && task[0].description.includes("Intro email") && task[0].due_date === new Date().toISOString().slice(0, 10),
    JSON.stringify(task?.map((t) => ({ d: t.description, due: t.due_date }))));

  // completing step 1 schedules step 2 at +2 days
  const done = await owner.rpc("complete_sales_task", { p_task_id: task[0].id, p_note: "sent intro" });
  expectOk("complete step-1 task", done.error);
  const { data: t2 } = await owner.from("sales_tasks").select("*").eq("cadence_run_id", run.id).is("done_at", null);
  const expDue = new Date(); expDue.setDate(expDue.getDate() + 2);
  check("step-2 task scheduled at +2 days", t2?.length === 1 && t2[0].due_date === expDue.toISOString().slice(0, 10),
    JSON.stringify(t2?.map((t) => ({ d: t.description, due: t.due_date }))));
}

// --- DNC stops everything ----------------------------------------------------
{
  const dnc = await owner.rpc("prospect_action", { p_prospect_id: prospect.id, p_action: "mark_dnc" });
  expectOk("mark do-not-contact", dnc.error);
  check("prospect status → dnc", dnc.data?.status === "dnc", `status=${dnc.data?.status}`);

  const { data: runAfter } = await owner.from("cadence_runs").select("status").eq("id", run.id).single();
  check("active cadence stopped on DNC", runAfter?.status === "stopped", `run=${runAfter?.status}`);
  const { data: openTasks } = await owner.from("sales_tasks").select("id").eq("cadence_run_id", run.id).is("done_at", null);
  check("open tasks cancelled on DNC", (openTasks?.length ?? 0) === 0, `open=${openTasks?.length}`);

  const restart = await owner.rpc("start_cadence", { p_prospect_id: prospect.id, p_cadence_id: cadence.id });
  expectErr("cannot start cadence on DNC prospect", restart.error);

  const convert = await owner.rpc("convert_prospect", { p_prospect_id: prospect.id });
  expectErr("cannot convert DNC prospect", convert.error);
}

// --- convert → lead ----------------------------------------------------------
let lead;
{
  const p2 = await owner.from("prospects").insert({
    company: "V7 Convert AG", contact_name: "Kim Convert", email: "kim@v7c.test",
    source: "event", fit_score: 5, owner_id: ownerId,
  }).select().single();
  const conv = await owner.rpc("convert_prospect", { p_prospect_id: p2.data.id });
  expectOk("convert prospect", conv.error);
  const { data: pAfter } = await owner.from("prospects").select("status, converted_lead_id").eq("id", p2.data.id).single();
  check("prospect → converted with lead link", pAfter?.status === "converted" && !!pAfter?.converted_lead_id,
    JSON.stringify(pAfter));
  const { data: l } = await owner.from("leads").select("*").eq("id", pAfter.converted_lead_id).single();
  check("lead carries company + contact", l?.company === "V7 Convert AG" && l?.email === "kim@v7c.test",
    JSON.stringify({ c: l?.company, e: l?.email }));
  lead = l;

  const reconv = await owner.rpc("convert_prospect", { p_prospect_id: p2.data.id });
  expectErr("double-convert blocked", reconv.error);

  // cleanup: lose the created lead so pipeline stays clean
  await owner.rpc("advance_lead", { p_lead_id: lead.id, p_action: "lose", p_comment: "v7 validation cleanup" });
}

// --- account health + opportunities + Account 360 ----------------------------
{
  const { data: cl } = await finance.from("clients").select("id").eq("code", "VTST").single();

  const h = await owner.rpc("compute_account_health", { p_client_id: cl.id });
  expectOk("compute account health", h.error);
  const health = h.data ?? {};
  check("health returns score + light + named factors",
    typeof health.score === "number" && ["green", "yellow", "red"].includes(health.light) && Array.isArray(health.factors),
    JSON.stringify(health).slice(0, 200));

  const opp = await owner.from("opportunities").insert({
    client_id: cl.id, description: "V7 upsell test", value_minor: 500000, currency: "USD",
    stage: "proposed", owner_id: ownerId,
  }).select().single();
  expectOk("create opportunity", opp.error);

  const acct = await owner.rpc("account_360", { p_client_id: cl.id });
  expectOk("account_360 runs", acct.error);
  const a = acct.data ?? {};
  check("account 360 aggregates: team, AR, renewal, opportunities, health",
    Array.isArray(a.team) && a.open_ar_minor != null && a.health != null
      && Number(a.open_opportunities_minor) === 500000 && "next_renewal" in a && "open_escalations" in a,
    Object.keys(a).join(",") + ` opp=${a.open_opportunities_minor}`);

  if (opp.data) await owner.from("opportunities").delete().eq("id", opp.data.id);
}

summary("V7 Prospecting & accounts");
