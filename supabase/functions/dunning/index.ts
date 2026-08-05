// Dunning emails (D-3): courtesy at due-3, escalating at due+7 / +14 / +30.
// Idempotent per (invoice, stage, day) via automation_runs. Respects
// invoices.dunning_paused. The SQL job job_dunning_scan handles the in-app
// side; this function emails the client's billing contact.
import { adminClient, authorize, sendEmail } from "../_shared/admin.ts";

const STAGES = [
  { offset: -3, key: "courtesy", tone: "friendly reminder that the invoice below is due soon" },
  { offset: 7, key: "overdue-7", tone: "gentle reminder that the invoice below is now past due" },
  { offset: 14, key: "overdue-14", tone: "second notice: the invoice below remains unpaid" },
  { offset: 30, key: "overdue-30", tone: "final notice before escalation: the invoice below is seriously overdue" },
];

Deno.serve(async (req) => {
  const denied = authorize(req);
  if (denied) return denied;

  const db = adminClient();

  // Flip issued → overdue + in-app notifications first.
  await db.rpc("job_dunning_scan");

  const today = new Date().toISOString().slice(0, 10);
  const results: Record<string, number> = {};

  for (const stage of STAGES) {
    const target = new Date(Date.now() - stage.offset * 86_400_000)
      .toISOString()
      .slice(0, 10);

    const { data: invoices, error } = await db
      .from("invoices")
      .select(
        `id, number, total_minor, currency, due_date, dunning_paused,
         clients ( name, contact_email, contacts ( email, contact_role, opted_out ) )`
      )
      .eq("kind", "invoice")
      .in("status", ["issued", "partially_paid", "overdue"])
      .eq("due_date", target)
      .eq("dunning_paused", false);
    if (error) return json({ error: error.message }, 500);

    let sent = 0;
    for (const inv of invoices ?? []) {
      const runKey = `${inv.id}:${stage.key}:${today}`;
      const { error: dup } = await db
        .from("automation_runs")
        .insert({ job: "dunning_email", run_key: runKey });
      if (dup) continue; // already sent this stage today

      const client = inv.clients as unknown as {
        name: string;
        contact_email: string | null;
        contacts: { email: string | null; contact_role: string; opted_out: boolean }[];
      };
      const billing = client.contacts?.find(
        (c) => c.contact_role === "billing" && c.email && !c.opted_out
      );
      const to = billing?.email ?? client.contact_email;
      if (!to) continue;

      const amount = (inv.total_minor / 100).toFixed(2);
      const { ok } = await sendEmail({
        to: [to],
        subject: `${stage.offset < 0 ? "Upcoming" : "Overdue"} invoice ${inv.number}`,
        html: `<p>Dear ${client.name},</p>
               <p>This is a ${stage.tone}.</p>
               <p><strong>${inv.number}</strong> — ${amount} ${inv.currency}, due ${inv.due_date}.</p>
               <p>If payment has already been made, please disregard this message.</p>`,
      });
      if (ok) sent++;
    }
    results[stage.key] = sent;
  }

  return json(results);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
