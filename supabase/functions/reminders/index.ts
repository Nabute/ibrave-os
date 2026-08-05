// Timesheet + approval reminders (Module F). Runs the idempotent SQL jobs
// (which write in-app notifications + automation_runs), then emails everyone
// who received an unread reminder notification today.
import { adminClient, authorize, sendEmail } from "../_shared/admin.ts";

Deno.serve(async (req) => {
  const denied = authorize(req);
  if (denied) return denied;

  const db = adminClient();

  const { data: reminded, error: e1 } = await db.rpc("job_timesheet_reminders");
  if (e1) return json({ error: e1.message }, 500);
  const { data: nudged, error: e2 } = await db.rpc("job_approval_nudges");
  if (e2) return json({ error: e2.message }, 500);

  // Email leg: today's unread reminder notifications.
  const { data: pending } = await db
    .from("notifications")
    .select("id, user_id, kind, title, body, profiles:user_id ( email, full_name )")
    .in("kind", ["timesheet_reminder", "approval_nudge"])
    .is("read_at", null)
    .gte("created_at", new Date(Date.now() - 86_400_000).toISOString());

  let emailed = 0;
  for (const n of pending ?? []) {
    const profile = n.profiles as unknown as { email: string; full_name: string } | null;
    if (!profile?.email) continue;
    const { ok } = await sendEmail({
      to: [profile.email],
      subject: n.title,
      html: `<p>Hi ${profile.full_name},</p><p>${n.body ?? n.title}</p>
             <p><a href="${Deno.env.get("APP_URL") ?? "http://localhost:5173"}">Open iBrave OS</a></p>`,
    });
    if (ok) emailed++;
  }

  return json({ reminded, nudged, emailed });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
