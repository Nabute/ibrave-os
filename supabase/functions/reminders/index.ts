// Timesheet + approval reminders (Module F) and the notification email leg.
// Runs the idempotent SQL jobs (which write in-app notifications +
// automation_runs), then emails every not-yet-emailed unread notification as
// ONE digest per user. `emailed_at` makes the email leg idempotent — a
// notification is emailed exactly once, however often the job runs.
import { adminClient, authorize, sendEmail } from "../_shared/admin.ts";

interface PendingRow {
  id: number;
  user_id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  profiles: {
    email: string;
    full_name: string;
    active: boolean;
    preferences?: { email_notifications?: boolean };
  } | null;
}

Deno.serve(async (req) => {
  const denied = authorize(req);
  if (denied) return denied;

  const db = adminClient();

  const { data: reminded, error: e1 } = await db.rpc("job_timesheet_reminders");
  if (e1) return json({ error: e1.message }, 500);
  const { data: nudged, error: e2 } = await db.rpc("job_approval_nudges");
  if (e2) return json({ error: e2.message }, 500);

  // Email leg: everything unread that has never been emailed, one digest per
  // user. In-app notifications always land; the email respects the user's
  // master switch (Preferences → Notifications) and skips deactivated people.
  const { data: pending, error: e3 } = await db
    .from("notifications")
    .select(
      "id, user_id, kind, title, body, link, profiles:user_id ( email, full_name, active, preferences )"
    )
    .is("read_at", null)
    .is("emailed_at", null)
    .order("created_at", { ascending: true })
    .limit(500);
  if (e3) return json({ error: e3.message }, 500);

  const appUrl = Deno.env.get("APP_URL") ?? "http://localhost:5199";
  const byUser = new Map<string, PendingRow[]>();
  for (const n of (pending ?? []) as unknown as PendingRow[]) {
    byUser.set(n.user_id, [...(byUser.get(n.user_id) ?? []), n]);
  }

  let emailed = 0;
  let skipped = 0;
  for (const [, items] of byUser) {
    const profile = items[0].profiles;
    const ids = items.map((n) => n.id);
    if (!profile?.email || profile.active === false) {
      // Never emailable — stamp so they don't pile up in the query forever.
      await db.from("notifications").update({ emailed_at: new Date().toISOString() }).in("id", ids);
      skipped++;
      continue;
    }
    if (profile.preferences?.email_notifications === false) {
      await db.from("notifications").update({ emailed_at: new Date().toISOString() }).in("id", ids);
      skipped++;
      continue;
    }

    const rows = items
      .map(
        (n) => `<tr>
          <td style="padding:6px 12px 6px 0;white-space:nowrap;color:#8a8478;font-size:12px">${escapeHtml(n.kind.replace(/_/g, " "))}</td>
          <td style="padding:6px 0">
            <a href="${appUrl}${n.link ?? ""}" style="color:#1c1915;font-weight:600;text-decoration:none">${escapeHtml(n.title)}</a>
            ${n.body ? `<div style="color:#5c564c;font-size:13px">${escapeHtml(n.body)}</div>` : ""}
          </td></tr>`
      )
      .join("");

    const { ok } = await sendEmail({
      to: [profile.email],
      subject:
        items.length === 1
          ? items[0].title
          : `${items.length} updates in ibrave OS`,
      html: `<p>Hi ${escapeHtml(profile.full_name)},</p>
             <p>While you were away:</p>
             <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows}</table>
             <p style="margin-top:16px"><a href="${appUrl}">Open ibrave OS</a> ·
               <span style="color:#8a8478;font-size:12px">manage email in Preferences → Notifications</span></p>`,
    });
    // Stamp regardless of provider outcome so a hard bounce can't loop forever;
    // provider failures are visible in the function logs.
    await db.from("notifications").update({ emailed_at: new Date().toISOString() }).in("id", ids);
    if (ok) emailed++;
  }

  return json({ reminded, nudged, emailed, skipped });
});

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
