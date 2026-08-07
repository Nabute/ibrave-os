// Dunning emails (D-3): courtesy at due-3, escalating at due+7 / +14 / +30.
// The queue comes from the dunning_queue() DB function, the same source the
// in-app SQL job reads, so the pause rules (manual pause, open escalation
// beyond courtesy, G-6) can never diverge between email and in-app legs.
// Idempotent per (invoice, stage, day) via automation_runs. The letter text
// comes from the email_templates table (editable in-app by finance/admin);
// the built-in copy below is the fallback when a template is missing.
import { adminClient, authorize, jsonResponse as json, sendEmail, serveJson } from "../_shared/admin.ts";
import { detailTable, esc, fillTemplate, renderEmail, textToHtml } from "../_shared/email.ts";

const FALLBACK: Record<string, { subject: string; body: string }> = {
  courtesy: {
    subject: "Upcoming invoice {{invoice_number}}",
    body: "Dear {{client_name}},\n\nThis is a friendly reminder that the invoice below is due soon.\n\nIf payment has already been made, please disregard this message.",
  },
  "overdue-7": {
    subject: "Overdue invoice {{invoice_number}}",
    body: "Dear {{client_name}},\n\nA gentle reminder that the invoice below is now past due.\n\nIf payment has already been made, please disregard this message.",
  },
  "overdue-14": {
    subject: "Second notice: invoice {{invoice_number}}",
    body: "Dear {{client_name}},\n\nSecond notice: the invoice below remains unpaid.\n\nPlease arrange payment at your earliest convenience, or let us know if something is blocking it.",
  },
  "overdue-30": {
    subject: "Final notice: invoice {{invoice_number}}",
    body: "Dear {{client_name}},\n\nFinal notice before escalation: the invoice below is seriously overdue.\n\nPlease treat this as urgent.",
  },
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

serveJson(async (req) => {
  const denied = authorize(req);
  if (denied) return denied;

  const db = adminClient();

  // Flip issued → overdue + in-app notifications first.
  await db.rpc("job_dunning_scan");

  const { data: queue, error } = await db.rpc("dunning_queue");
  if (error) return json({ error: error.message }, 500);

  const { data: company } = await db
    .from("company_settings")
    .select("company_name, legal_name, payment_instructions, bank_details")
    .single();
  const { data: templates } = await db
    .from("email_templates")
    .select("key, subject, body")
    .like("key", "dunning-%");
  const tpl = new Map((templates ?? []).map((t) => [t.key, t]));

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
    const vars = {
      client_name: inv.client_name,
      invoice_number: inv.invoice_number,
      amount,
      currency: inv.currency,
      due_date: inv.due_date,
      days_overdue: String(Math.max(inv.days_overdue, 0)),
    };
    const t = tpl.get(`dunning-${inv.stage}`) ?? FALLBACK[inv.stage] ?? FALLBACK["overdue-7"];
    const subject = fillTemplate(t.subject, vars);

    const { ok } = await sendEmail({
      to: [inv.billing_email],
      subject,
      html: renderEmail({
        preheader: `${inv.invoice_number} · ${amount} ${inv.currency}, due ${inv.due_date}`,
        heading: subject,
        bodyHtml: `${textToHtml(fillTemplate(t.body, vars))}
          ${detailTable([
            ["Invoice", inv.invoice_number],
            ["Amount", `${amount} ${inv.currency}`],
            ["Due date", inv.due_date],
            ...(inv.days_overdue > 0
              ? [["Days overdue", String(inv.days_overdue)] as [string, string]]
              : []),
          ])}
          ${
            company?.payment_instructions || company?.bank_details
              ? `<p style="margin:16px 0 0;color:#6f695f;font-size:13px;line-height:1.6;">
                   ${company.payment_instructions ? esc(company.payment_instructions) : ""}
                   ${company.bank_details ? `<br/>${esc(company.bank_details)}` : ""}</p>`
              : ""
          }`,
        companyLine: company?.legal_name ?? company?.company_name ?? "ibrave",
      }),
    });
    if (ok) results[inv.stage]++;
  }

  return json(results);
});
