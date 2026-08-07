// Timesheet + approval reminders (Module F) and the notification email leg.
// Runs the idempotent SQL jobs (which write in-app notifications +
// automation_runs), then emails every not-yet-emailed unread notification as
// ONE digest per user. `emailed_at` makes the email leg idempotent — a
// notification is emailed exactly once, however often the job runs.
import { adminClient, authorize, jsonResponse as json, sendEmail, serveJson } from "../_shared/admin.ts";
import { esc, renderEmail } from "../_shared/email.ts";

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

serveJson(async (req) => {
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
          <td style="padding:10px 14px 10px 0;white-space:nowrap;vertical-align:top;
                     color:#6f695f;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;">
            ${esc(n.kind.replace(/_/g, " "))}</td>
          <td style="padding:10px 0;border-bottom:1px solid #efebe2;">
            <a href="${appUrl}${n.link ?? ""}" style="color:#211d18;font-weight:600;
               font-size:14px;text-decoration:none;">${esc(n.title)}</a>
            ${n.body ? `<div style="color:#6f695f;font-size:13px;line-height:1.5;margin-top:2px;">${esc(n.body)}</div>` : ""}
          </td></tr>`
      )
      .join("");

    const { ok } = await sendEmail({
      to: [profile.email],
      subject:
        items.length === 1
          ? items[0].title
          : `${items.length} updates in ibrave OS`,
      html: renderEmail({
        preheader: items.map((n) => n.title).join(" · ").slice(0, 140),
        heading: items.length === 1 ? items[0].title : "While you were away",
        bodyHtml: `<p style="margin:0 0 8px;">Hi ${esc(profile.full_name)},</p>
          <table role="presentation" cellpadding="0" cellspacing="0"
                 style="border-collapse:collapse;width:100%;">${rows}</table>`,
        cta: { label: "Open ibrave OS", url: appUrl },
        footerNote: "You can turn these emails off under Preferences → Notifications.",
      }),
    });
    // Stamp regardless of provider outcome so a hard bounce can't loop forever;
    // provider failures are visible in the function logs.
    await db.from("notifications").update({ emailed_at: new Date().toISOString() }).in("id", ids);
    if (ok) emailed++;
  }

  return json({ reminded, nudged, emailed, skipped });
});


