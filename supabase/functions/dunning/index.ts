// Dunning emails (D-3): courtesy at due-3, escalating at due+7 / +14 / +30.
// The queue comes from the dunning_queue() DB function — the same source the
// in-app SQL job reads — so the pause rules (manual pause, open escalation
// beyond courtesy, G-6) can never diverge between email and in-app legs.
// Idempotent per (invoice, stage, day) via automation_runs.
import { adminClient, authorize, sendEmail } from "../_shared/admin.ts";

const TONE: Record<string, string> = {
  courtesy: "friendly reminder that the invoice below is due soon",
  "overdue-7": "gentle reminder that the invoice below is now past due",
  "overdue-14": "second notice: the invoice below remains unpaid",
  "overdue-30": "final notice before escalation: the invoice below is seriously overdue",
};

interface QueueRow {
  invoice_id: string;
  invoice_number: string;
  client_name: string;
  billing_email: string | null;
  total_minor: number;
  currency: string;
  due_date: string;
  days_overdue: number;
  stage: string;
}

Deno.serve(async (req) => {
  const denied = authorize(req);
  if (denied) return denied;

  const db = adminClient();

  // Flip issued → overdue + in-app notifications first.
  await db.rpc("job_dunning_scan");

  const { data: queue, error } = await db.rpc("dunning_queue");
  if (error) return json({ error: error.message }, 500);

  const today = new Date().toISOString().slice(0, 10);
  const results: Record<string, number> = {};

  for (const inv of (queue ?? []) as QueueRow[]) {
    results[inv.stage] ??= 0;
    if (!inv.billing_email) continue;

    const runKey = `${inv.invoice_id}:${inv.stage}:${today}`;
    const { error: dup } = await db
      .from("automation_runs")
      .insert({ job: "dunning_email", run_key: runKey });
    if (dup) continue; // already sent this stage today

    const amount = (inv.total_minor / 100).toFixed(2);
    const { ok } = await sendEmail({
      to: [inv.billing_email],
      subject: `${inv.days_overdue < 0 ? "Upcoming" : "Overdue"} invoice ${inv.invoice_number}`,
      html: `<p>Dear ${inv.client_name},</p>
             <p>This is a ${TONE[inv.stage] ?? "reminder"}.</p>
             <p><strong>${inv.invoice_number}</strong> — ${amount} ${inv.currency}, due ${inv.due_date}.</p>
             <p>If payment has already been made, please disregard this message.</p>`,
    });
    if (ok) results[inv.stage]++;
  }

  return json(results);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
