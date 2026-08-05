// In-app email sending. Called by the FRONTEND with the user's JWT (the
// gateway verifies it) — every message a user sends goes through here, is
// written to email_log, and mirrored into the related entity's timeline.
// When event_id is set, an ICS calendar invite is attached so external
// attendees get a real invite without anyone leaving the app.
import { createClient } from "npm:@supabase/supabase-js@2";
import { adminClient, sendEmailRaw } from "../_shared/admin.ts";

interface SendPayload {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  client_id?: string;
  lead_id?: string;
  prospect_id?: string;
  candidate_id?: string;
  invoice_id?: string;
  event_id?: string;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // Identify the caller from their JWT.
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } }
  );
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Not authenticated" }, 401);
  const user = userData.user;

  const payload = (await req.json()) as SendPayload;
  if (!payload.to?.length || !payload.subject || !payload.html) {
    return json({ error: "to, subject and html are required" }, 422);
  }

  const db = adminClient();
  const { data: profile } = await db
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .single();

  // ICS attachment for calendar invites.
  let attachments: { filename: string; content: string }[] | undefined;
  if (payload.event_id) {
    const { data: event } = await db
      .from("calendar_events")
      .select("*, calendar_attendees ( email, name, user_id )")
      .eq("id", payload.event_id)
      .single();
    if (event) {
      const ics = buildIcs(event, profile?.email ?? "noreply@ibrave.dev");
      attachments = [{ filename: "invite.ics", content: btoa(ics) }];
    }
  }

  const signedHtml = `${payload.html}
    <p style="color:#6b7280;font-size:13px;margin-top:24px">
      ${profile?.full_name ?? "iBrave"} · iBrave<br/>
      Sent via iBrave OS — replies go to ${profile?.email ?? ""}</p>`;

  const result = await sendEmailRaw({
    to: payload.to,
    cc: payload.cc,
    subject: payload.subject,
    html: signedHtml,
    replyTo: profile?.email,
    attachments,
  });

  const { data: logRow } = await db
    .from("email_log")
    .insert({
      sent_by: user.id,
      to_emails: payload.to,
      cc_emails: payload.cc ?? [],
      subject: payload.subject,
      body_html: payload.html,
      status: result.ok ? "sent" : "failed",
      error: result.ok ? null : result.detail,
      client_id: payload.client_id ?? null,
      lead_id: payload.lead_id ?? null,
      prospect_id: payload.prospect_id ?? null,
      candidate_id: payload.candidate_id ?? null,
      invoice_id: payload.invoice_id ?? null,
      calendar_event_id: payload.event_id ?? null,
    })
    .select("id")
    .single();

  // Mirror into the related timeline so the record lives with the entity.
  const summary = `Email sent: “${payload.subject}” → ${payload.to.join(", ")}`;
  if (result.ok) {
    if (payload.client_id) {
      await db.from("account_activities").insert({
        client_id: payload.client_id, kind: "email", body: summary,
        actor_id: user.id, source: "manual",
      });
    }
    if (payload.lead_id) {
      await db.from("lead_activities").insert({
        lead_id: payload.lead_id, kind: "email", body: summary, actor_id: user.id,
      });
    }
    if (payload.prospect_id) {
      await db.from("prospect_activities").insert({
        prospect_id: payload.prospect_id, kind: "email", body: summary, actor_id: user.id,
      });
    }
    if (payload.candidate_id) {
      await db.from("candidate_activities").insert({
        candidate_id: payload.candidate_id, kind: "email", body: summary, actor_id: user.id,
      });
    }
  }

  return json(
    { ok: result.ok, log_id: logRow?.id, detail: result.ok ? undefined : result.detail },
    result.ok ? 200 : 502
  );
});

interface EventRow {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  calendar_attendees: { email: string | null; name: string | null }[];
}

function buildIcs(event: EventRow, organizerEmail: string): string {
  const dt = (iso: string) =>
    new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/([,;])/g, "\\$1").replace(/\n/g, "\\n");
  const attendees = event.calendar_attendees
    .filter((a) => a.email)
    .map(
      (a) =>
        `ATTENDEE;CN=${esc(a.name ?? a.email!)};RSVP=TRUE:mailto:${a.email}`
    )
    .join("\r\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//iBrave OS//EN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${event.id}@ibrave-os`,
    `DTSTAMP:${dt(new Date().toISOString())}`,
    `DTSTART:${dt(event.starts_at)}`,
    `DTEND:${dt(event.ends_at)}`,
    `SUMMARY:${esc(event.title)}`,
    event.description ? `DESCRIPTION:${esc(event.description)}` : "",
    event.location ? `LOCATION:${esc(event.location)}` : "",
    `ORGANIZER;CN=iBrave:mailto:${organizerEmail}`,
    attendees,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
