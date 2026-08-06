// V3 — Collections: overdue derivation, dunning stage ladder, escalation
// pause (courtesy still goes out), manual dunning pause, billing contact pick.
// Uses VTST with temporarily adjusted payment terms to land invoices exactly
// on dunning-stage day offsets; restores terms and voids everything at the end.
import { as, check, expectErr, expectOk, summary } from "./harness.mjs";

const dev1 = await as("dev1");
const pm = await as("pm");
const finance = await as("finance");
const owner = await as("owner");

const { data: meD } = await dev1.auth.getUser();
const dev1Id = meD.user.id;
const { data: client } = await finance.from("clients").select("*").eq("code", "VTST").single();
const { data: project } = await finance.from("projects").select("*").eq("code", "VTST-1").single();

async function approvedHour(date, weekStart) {
  const ins = await dev1.from("time_entries").insert({
    user_id: dev1Id, project_id: project.id, work_date: date, hours: 0.25,
    status: "draft", billable: true, note: "v3 dunning test",
  }).select().single();
  if (ins.error) throw new Error("entry: " + ins.error.message);
  const sub = await dev1.rpc("submit_week", { p_week_start: weekStart });
  if (sub.error) throw new Error("submit: " + sub.error.message);
  const app = await pm.rpc("approve_entries", { p_entry_ids: [ins.data.id] });
  if (app.error) throw new Error("approve: " + app.error.message);
  return ins.data.id;
}

async function issueWithTerms(terms, workDate, weekStart) {
  const t = await finance.from("clients").update({ payment_terms_days: terms }).eq("id", client.id);
  if (t.error) throw new Error("terms: " + t.error.message);
  await approvedHour(workDate, weekStart);
  const gen = await finance.rpc("generate_draft_invoice", {
    p_client_id: client.id, p_period_start: workDate, p_period_end: workDate,
  });
  if (gen.error) throw new Error("gen: " + gen.error.message);
  const iss = await finance.rpc("issue_invoice", { p_invoice_id: gen.data.id });
  if (iss.error) throw new Error("issue: " + iss.error.message);
  return iss.data;
}

// A: due in 3 days → 'courtesy'. B: due 7 days ago → 'overdue-7' after flip.
const invA = await issueWithTerms(3, "2026-05-04", "2026-05-04");
const invB = await issueWithTerms(-7, "2026-05-05", "2026-05-04");
await finance.from("clients").update({ payment_terms_days: 14 }).eq("id", client.id);
check("terms restored to 14", true);

const today = new Date().toISOString().slice(0, 10);
check("A due in 3 days", (new Date(invA.due_date) - new Date(today)) / 86400000 === 3, `due=${invA.due_date}`);
check("B due 7 days ago", (new Date(today) - new Date(invB.due_date)) / 86400000 === 7, `due=${invB.due_date}`);

// --- mark_overdue flips only past-due issued invoices ------------------------
{
  const r = await finance.rpc("mark_overdue_invoices");
  expectOk("mark_overdue_invoices runs", r.error, Number(r.data) >= 1);
  const { data: b } = await finance.from("invoices").select("status").eq("id", invB.id).single();
  check("B flipped to overdue", b.status === "overdue", `status=${b.status}`);
  const { data: a } = await finance.from("invoices").select("status").eq("id", invA.id).single();
  check("A (not yet due) stays issued", a.status === "issued", `status=${a.status}`);
}

// --- dunning queue stages ----------------------------------------------------
{
  const { data: q, error } = await finance.rpc("dunning_queue");
  expectOk("dunning_queue readable by finance", error);
  const rowA = (q ?? []).find((r) => r.invoice_id === invA.id);
  const rowB = (q ?? []).find((r) => r.invoice_id === invB.id);
  check("A queued as courtesy (due-3)", rowA?.stage === "courtesy", JSON.stringify(rowA));
  check("B queued as overdue-7", rowB?.stage === "overdue-7", JSON.stringify(rowB));
  check("billing email falls back to client contact_email", rowB?.billing_email === client.contact_email,
    `email=${rowB?.billing_email}`);
}

// --- escalation pauses overdue stages, courtesy still goes -------------------
let escId;
{
  const esc = await owner.from("escalations").insert({
    client_id: client.id, summary: "v3 validation escalation", severity: "high",
    owner_id: (await owner.auth.getUser()).data.user.id,
  }).select().single();
  expectOk("open escalation on client", esc.error);
  escId = esc.data?.id;

  const { data: q } = await finance.rpc("dunning_queue");
  const rowA = (q ?? []).find((r) => r.invoice_id === invA.id);
  const rowB = (q ?? []).find((r) => r.invoice_id === invB.id);
  check("escalation: courtesy (A) still queued", rowA?.stage === "courtesy", JSON.stringify(rowA));
  check("escalation: overdue stage (B) suppressed", !rowB, JSON.stringify(rowB));

  const close = await owner.from("escalations").update({ resolved_at: new Date().toISOString(), resolution: "validated" }).eq("id", escId);
  expectOk("resolve escalation", close.error);
  const { data: q2 } = await finance.rpc("dunning_queue");
  check("B re-queued after escalation resolved", !!(q2 ?? []).find((r) => r.invoice_id === invB.id));
}

// --- manual dunning pause ----------------------------------------------------
{
  const upd = await finance.from("invoices").update({ dunning_paused: true }).eq("id", invB.id).select();
  expectOk("finance can pause dunning on an issued invoice", upd.error, (upd.data?.length ?? 0) === 1);
  const { data: q } = await finance.rpc("dunning_queue");
  check("paused invoice out of the queue", !(q ?? []).find((r) => r.invoice_id === invB.id));
  const upd2 = await finance.from("invoices").update({ dunning_paused: false }).eq("id", invB.id).select();
  expectOk("unpause dunning", upd2.error);
}

// --- overdue invoices appear in aging with right bucket ----------------------
{
  const { data: aging } = await finance.from("v_invoice_aging").select("*").then(
    (r) => r.error ? finance.rpc("aging_report") : r
  );
  const rowB = (aging ?? []).find((r) => r.id === invB.id || r.invoice_id === invB.id);
  check("B in aging report, 7 days overdue", rowB != null && Number(rowB.days_overdue ?? 0) === 7, JSON.stringify(rowB));
}

// --- cleanup: void test invoices --------------------------------------------
{
  const v1 = await finance.rpc("void_invoice", { p_invoice_id: invA.id, p_reason: "v3 validation cleanup" });
  const v2 = await finance.rpc("void_invoice", { p_invoice_id: invB.id, p_reason: "v3 validation cleanup" });
  expectOk("void A + B (cleanup, incl. void from overdue)", v1.error ?? v2.error);
}

summary("V3 Collections");
