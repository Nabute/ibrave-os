// V11 — Entity-change notifications: approve → employee, invoice paid →
// account owner, escalation → finance, staffing request → resourcing,
// lead won → finance. Cleans up its artifacts.
import { as, check, expectOk, summary } from "./harness.mjs";

const dev1 = await as("dev1");
const pm = await as("pm");
const finance = await as("finance");
const owner = await as("owner");

const { data: meD1 } = await dev1.auth.getUser();
const dev1Id = meD1.user.id;
const { data: meO } = await owner.auth.getUser();
const ownerId = meO.user.id;
const { data: meF } = await finance.auth.getUser();
const financeId = meF.user.id;
const { data: mePm } = await pm.auth.getUser();
const pmId = mePm.user.id;

const { data: client } = await finance.from("clients").select("*").eq("code", "VTST").single();
const { data: project } = await finance.from("projects").select("*").eq("code", "VTST-1").single();

const since = new Date().toISOString();
const latest = async (who, kind) =>
  (await who.from("notifications").select("*").eq("kind", kind).gte("created_at", since)
    .order("created_at", { ascending: false }).limit(1)).data?.[0] ?? null;

// --- approve → employee ------------------------------------------------------
{
  const ins = await dev1.from("time_entries").insert({
    user_id: dev1Id, project_id: project.id, work_date: "2026-04-06", hours: 1.5,
    status: "draft", billable: true, note: "v11 notify test",
  }).select().single();
  expectOk("log draft entry", ins.error);
  await dev1.rpc("submit_week", { p_week_start: "2026-04-06" });
  const app = await pm.rpc("approve_entries", { p_entry_ids: [ins.data.id] });
  expectOk("pm approves", app.error);
  const n = await latest(dev1, "entries_approved");
  check("employee notified of approval (with hours + approver)",
    n != null && n.body.includes("1.5") && n.link === "/timesheet", JSON.stringify(n));
}

// --- invoice paid → account owner -------------------------------------------
{
  await finance.from("clients").update({ account_owner_id: ownerId }).eq("id", client.id);
  const gen = await finance.rpc("generate_draft_invoice", {
    p_client_id: client.id, p_period_start: "2026-04-01", p_period_end: "2026-04-30",
  });
  expectOk("generate April draft", gen.error);
  const iss = await finance.rpc("issue_invoice", { p_invoice_id: gen.data.id });
  expectOk("issue", iss.error);
  const pay = await finance.rpc("record_payment", {
    p_invoice_id: gen.data.id, p_amount_minor: iss.data.total_minor, p_paid_at: "2026-08-06",
    p_method: "wire", p_note: "v11 settle",
  });
  expectOk("pay in full", pay.error);
  const n = await latest(owner, "invoice_paid");
  check("account owner notified of payment",
    n != null && n.title.includes(iss.data.number) && n.link === `/invoices/${gen.data.id}`,
    JSON.stringify(n));
  await finance.from("clients").update({ account_owner_id: null }).eq("id", client.id);
}

// --- escalation → finance ----------------------------------------------------
{
  const esc = await owner.from("escalations").insert({
    client_id: client.id, summary: "v11 notify escalation", severity: "low", owner_id: ownerId,
  }).select().single();
  expectOk("open escalation", esc.error);
  const n = await latest(finance, "escalation_opened");
  check("finance notified of escalation (actor excluded)",
    n != null && n.user_id === financeId && n.body.includes("dunning"), JSON.stringify(n));
  const nOwner = await latest(owner, "escalation_opened");
  check("acting owner NOT self-notified", nOwner == null, JSON.stringify(nOwner));
  await owner.from("escalations").update({ resolved_at: new Date().toISOString(), resolution: "v11 cleanup" }).eq("id", esc.data.id);
}

// --- staffing request → resourcing ------------------------------------------
{
  const req = await owner.from("staffing_requests").insert({
    project_id: project.id, role_title: "V11 Notify Role", skills: ["node"],
    allocation_pct: 10, start_date: "2026-10-01", created_by: ownerId,
  }).select().single();
  expectOk("owner opens staffing request", req.error);
  const n = await latest(pm, "staffing_request_opened"); // pm holds resourcing
  check("resourcing notified of new request",
    n != null && n.user_id === pmId && n.title.includes("V11 Notify Role"), JSON.stringify(n));
  await owner.rpc("cancel_staffing_request", { p_request_id: req.data.id, p_comment: "v11 cleanup" });
}

// --- lead won → finance ------------------------------------------------------
{
  const lead = await owner.from("leads").insert({
    company: "V11 Win Notify Co", source: "other", owner_id: ownerId,
  }).select().single();
  await owner.rpc("advance_lead", { p_lead_id: lead.data.id, p_action: "qualify" });
  const win = await owner.rpc("win_lead", {
    p_lead_id: lead.data.id,
    p_options: { client_id: client.id, project_name: "V11 Win Project", billing_model: "tm" },
  });
  expectOk("win lead (onto existing client)", win.error);
  const n = await latest(finance, "deal_won");
  check("finance notified of won deal", n != null && n.title.includes("V11 Win Notify Co"),
    JSON.stringify(n));
  // cleanup: archive the created project so it doesn't clutter delivery
  if (win.data?.project_id) {
    await finance.from("projects").update({ status: "archived" }).eq("id", win.data.project_id);
  }
}

summary("V11 Notifications");
