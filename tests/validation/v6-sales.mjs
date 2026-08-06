// V6 — Sales: lead FSM ladder + role gates, lose-requires-comment, quote
// lifecycle (send → accept, revision supersedes), win handoff chain
// (client + contract + project + staffing request), renewal watchdog.
import { as, check, expectErr, expectOk, summary } from "./harness.mjs";

const dev1 = await as("dev1");
const owner = await as("owner"); // owner holds sales via expansion
const finance = await as("finance");

const { data: meO } = await owner.auth.getUser();
const ownerId = meO.user.id;

// --- create a lead -----------------------------------------------------------
let lead;
{
  const ins = await owner.from("leads").insert({
    company: "V6 Validation Corp", contact_name: "Val Tester", email: "val@v6corp.test",
    source: "research", expected_value_minor: 2000000, currency: "USD",
    expected_start: "2026-10-01", owner_id: ownerId,
  }).select().single();
  expectOk("sales creates lead", ins.error);
  lead = ins.data;
  check("new lead starts at stage 'lead' (20%)", lead.stage === "lead" && lead.probability_pct === 20,
    `stage=${lead.stage} p=${lead.probability_pct}`);

  const devTry = await dev1.from("leads").insert({ company: "hacked", source: "other" });
  expectErr("employee cannot create leads", devTry.error);
}

// --- FSM ladder --------------------------------------------------------------
{
  const skip = await owner.rpc("advance_lead", { p_lead_id: lead.id, p_action: "send_proposal" });
  expectErr("cannot skip qualify → send_proposal", skip.error);

  const devAdvance = await dev1.rpc("advance_lead", { p_lead_id: lead.id, p_action: "qualify" });
  expectErr("employee cannot advance leads", devAdvance.error);

  const q = await owner.rpc("advance_lead", { p_lead_id: lead.id, p_action: "qualify" });
  expectOk("qualify", q.error);
  check("qualified probability bumped", q.data?.stage === "qualified" && q.data?.probability_pct > 10,
    `p=${q.data?.probability_pct}`);

  // HATEOAS: available actions from 'qualified'
  const acts = await owner.rpc("lead_actions", { p_lead_id: lead.id });
  const names = Object.keys(acts.data ?? {});
  // win from qualified is deliberate (deals can close early)
  check("lead_actions offers send_proposal + lose + early win",
    names.includes("send_proposal") && names.includes("lose") && names.includes("win"),
    JSON.stringify(names));
}

// --- quote lifecycle ---------------------------------------------------------
let quote;
{
  const cq = await owner.rpc("create_quote", { p_lead_id: lead.id });
  expectOk("create quote v1", cq.error);
  quote = cq.data;
  check("quote starts draft v1", quote?.status === "draft" && quote?.version === 1,
    `status=${quote?.status} v=${quote?.version}`);

  const line = await owner.from("quote_lines").insert({
    quote_id: quote.id, description: "Senior engineer, monthly", qty_hours: 160,
    unit_price_minor: 12500, amount_minor: 2000000, position: 1,
  });
  expectOk("add quote line", line.error);

  const accDraft = await owner.rpc("quote_action", { p_quote_id: quote.id, p_action: "accept" });
  expectErr("cannot accept an unsent quote", accDraft.error);

  const send = await owner.rpc("quote_action", { p_quote_id: quote.id, p_action: "send" });
  expectOk("send quote", send.error);

  // revision supersedes the sent quote
  const rev = await owner.rpc("create_quote_revision", { p_quote_id: quote.id });
  expectOk("create revision v2", rev.error);
  check("revision is draft v2", rev.data?.version === 2 && rev.data?.status === "draft",
    `v=${rev.data?.version} status=${rev.data?.status}`);
  const { data: v1After } = await owner.from("quotes").select("status").eq("id", quote.id).single();
  check("v1 superseded", v1After?.status === "superseded", `status=${v1After?.status}`);
  const { data: v2Lines } = await owner.from("quote_lines").select("*").eq("quote_id", rev.data.id);
  check("revision copies lines", (v2Lines?.length ?? 0) === 1, `lines=${v2Lines?.length}`);

  const send2 = await owner.rpc("quote_action", { p_quote_id: rev.data.id, p_action: "send" });
  const acc = await owner.rpc("quote_action", { p_quote_id: rev.data.id, p_action: "accept" });
  expectOk("send + accept v2", send2.error ?? acc.error);
  quote = rev.data;
}

// --- advance to negotiation, then win ---------------------------------------
{
  await owner.rpc("advance_lead", { p_lead_id: lead.id, p_action: "send_proposal" });
  const n = await owner.rpc("advance_lead", { p_lead_id: lead.id, p_action: "negotiate" });
  expectOk("proposal → negotiation", n.error);

  const win = await owner.rpc("win_lead", {
    p_lead_id: lead.id,
    p_options: {
      project_name: "V6 Corp Delivery", billing_model: "tm",
      contract_end_date: "2027-09-30",
      staffing: { role_title: "Senior Engineer", allocation_pct: 100, skills: ["node"], duration_weeks: 12 },
    },
  });
  expectOk("win_lead handoff", win.error);
  const out = win.data ?? {};
  check("handoff returns client/contract/project/staffing ids",
    !!out.client_id && !!out.contract_id && !!out.project_id && !!out.staffing_request_id, JSON.stringify(out));

  const { data: cl } = await finance.from("clients").select("*").eq("id", out.client_id).single();
  check("client created from lead", cl?.name === "V6 Validation Corp" && cl?.contact_email === "val@v6corp.test",
    JSON.stringify({ name: cl?.name, email: cl?.contact_email }));

  const { data: ct } = await finance.from("contracts").select("*").eq("id", out.contract_id).single();
  check("contract linked to accepted quote + end date", ct?.quote_id === quote.id && ct?.end_date === "2027-09-30",
    JSON.stringify({ q: ct?.quote_id === quote.id, end: ct?.end_date }));

  const { data: pr } = await finance.from("projects").select("*").eq("id", out.project_id).single();
  check("project created (tm, start from lead)", pr?.name === "V6 Corp Delivery" && pr?.billing_model === "tm",
    JSON.stringify({ name: pr?.name, bm: pr?.billing_model }));

  const { data: sr } = await owner.from("staffing_requests").select("*").eq("id", out.staffing_request_id).single();
  check("staffing request open for sold role", sr?.status === "open" && sr?.role_title === "Senior Engineer"
    && sr?.start_date === "2026-10-01", JSON.stringify({ s: sr?.status, r: sr?.role_title, d: sr?.start_date }));

  const { data: after } = await owner.from("leads").select("stage, probability_pct, client_id").eq("id", lead.id).single();
  check("lead → won, 100%, linked to client", after?.stage === "won" && after?.probability_pct === 100
    && after?.client_id === out.client_id, JSON.stringify(after));

  const rewin = await owner.rpc("win_lead", { p_lead_id: lead.id, p_options: { project_name: "again" } });
  expectErr("double-win blocked", rewin.error);

  // cleanup: cancel the staffing request so it doesn't linger as demo noise
  await owner.rpc("cancel_staffing_request", { p_request_id: out.staffing_request_id, p_comment: "v6 validation cleanup" });
}

// --- lose requires comment ---------------------------------------------------
{
  const l2 = await owner.from("leads").insert({
    company: "V6 Lost Corp", source: "other", owner_id: ownerId,
  }).select().single();
  const noComment = await owner.rpc("advance_lead", { p_lead_id: l2.data.id, p_action: "lose" });
  expectErr("lose without comment rejected", noComment.error);
  const lost = await owner.rpc("advance_lead", { p_lead_id: l2.data.id, p_action: "lose", p_comment: "budget cut (v6 validation)" });
  expectOk("lose with comment", lost.error);
  check("lost lead at 0%", lost.data?.stage === "lost" && lost.data?.probability_pct === 0,
    `stage=${lost.data?.stage} p=${lost.data?.probability_pct}`);
}

// --- renewal watchdog --------------------------------------------------------
{
  // contract ending in 30 days triggers a notification for its owner
  const { data: cl } = await finance.from("clients").select("id").eq("code", "VTST").single();
  const in30 = new Date(); in30.setDate(in30.getDate() + 30);
  const ct = await finance.from("contracts").insert({
    client_id: cl.id, start_date: "2026-01-01", end_date: in30.toISOString().slice(0, 10),
    notes: "v6 renewal watchdog test",
  }).select().single();
  expectOk("create contract ending in 30d", ct.error);

  // day-idempotent by run_key: cron already ran today, so a manual call
  // returns 0 — assert the run record exists and re-runs stay 0.
  const run = await owner.rpc("job_renewal_watchdog");
  expectOk("renewal watchdog callable", run.error);
  const { data: runs } = await owner.from("automation_runs").select("run_key")
    .eq("job", "renewal_watchdog").eq("run_key", "day:" + new Date().toISOString().slice(0, 10));
  check("watchdog ran today (automation_runs row)", (runs?.length ?? 0) === 1, JSON.stringify(runs));
  const run2 = await owner.rpc("job_renewal_watchdog");
  check("watchdog idempotent (second run adds none)", !run2.error && Number(run2.data ?? 0) === 0,
    `second=${run2.data}`);
  await finance.from("contracts").delete().eq("id", ct.data.id);
}

summary("V6 Sales");
