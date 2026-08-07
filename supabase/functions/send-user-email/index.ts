// In-app email sending. Called by the FRONTEND with the user's JWT (the
// gateway verifies it), every message a user sends goes through here, is
// written to email_log, and mirrored into the related entity's timeline.
// When event_id is set, an ICS calendar invite is attached so external
// attendees get a real invite without anyone leaving the app.
import { createClient } from "npm:@supabase/supabase-js@2";
import { adminClient, jsonResponse as json, sendEmailRaw, serveJson } from "../_shared/admin.ts";
import { renderEmail } from "../_shared/email.ts";
import { buildInvoicePdf } from "../_shared/invoicePdf.ts";

interface SendPayload {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  /** The validated sender address, the user's own email or a department
   *  identity their role entitles them to. Defaults to the user's email. */
  from_email?: string;
  from_name?: string;
  client_id?: string;
  lead_id?: string;
  prospect_id?: string;
  candidate_id?: string;
  invoice_id?: string;
  /** When true (and invoice_id set), a server-generated PDF is attached. */
  attach_invoice_pdf?: boolean;
  event_id?: string;
}

serveJson(async (req) => {
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
  const { data: roleRows } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  const roles = new Set((roleRows ?? []).map((r) => String(r.role)));
  const hasRole = (role: string) =>
    roles.has(role) ||
    roles.has("owner") ||
    (role !== "owner" && roles.has("admin"));
  const hasAnyRole = (allowed: string[]) => allowed.some(hasRole);

  // Resolve + authorize the From address: never noreply for user-initiated
  // mail. Own login email is always allowed; department identities are
  // role-gated (validated server-side, the UI picker is not the boundary).
  const fromEmail = payload.from_email ?? profile?.email;
  if (!fromEmail) return json({ error: "No sender address available" }, 422);
  const { data: allowed, error: identErr } = await db.rpc("can_use_email_identity", {
    p_user_id: user.id,
    p_email: fromEmail,
  });
  if (identErr || !allowed) {
    return json({ error: `You are not allowed to send as ${fromEmail}` }, 403);
  }
  if (/[`\r\n]/.test(fromEmail) || /[\r\n]/.test(payload.subject) || /[\r\n]/.test(payload.from_name ?? "")) {
    return json({ error: "Invalid email headers" }, 422);
  }
  let fromName = payload.from_name ?? profile?.full_name ?? "ibrave";
  if (payload.from_email && payload.from_email !== profile?.email) {
    const { data: ident } = await db
      .from("email_identities")
      .select("display_name")
      .eq("email", fromEmail)
      .single();
    fromName = ident?.display_name ?? fromName;
  }

  const deny = (entity: string) =>
    json({ error: `You are not allowed to send against this ${entity}` }, 403);

  if (payload.invoice_id) {
    if (!hasAnyRole(["finance"])) return deny("invoice");
    const { error } = await userClient
      .from("invoices")
      .select("id")
      .eq("id", payload.invoice_id)
      .single();
    if (error) return deny("invoice");
  }
  if (payload.event_id) {
    const { data: event, error } = await db
      .from("calendar_events")
      .select("id, organizer_id")
      .eq("id", payload.event_id)
      .single();
    if (error || !event) return deny("calendar event");
    if (event.organizer_id !== user.id && !hasAnyRole(["admin"])) {
      return deny("calendar event");
    }
  }
  if (payload.client_id) {
    if (!hasAnyRole(["account_owner", "sales", "finance", "pm"])) return deny("client");
    const { error } = await userClient
      .from("clients")
      .select("id")
      .eq("id", payload.client_id)
      .single();
    if (error) return deny("client");
  }
  if (payload.lead_id) {
    if (!hasAnyRole(["sales", "finance", "pm"])) return deny("lead");
    const { error } = await userClient
      .from("leads")
      .select("id")
      .eq("id", payload.lead_id)
      .single();
    if (error) return deny("lead");
  }
  if (payload.prospect_id) {
    if (!hasAnyRole(["sales", "finance"])) return deny("prospect");
    const { error } = await userClient
      .from("prospects")
      .select("id")
      .eq("id", payload.prospect_id)
      .single();
    if (error) return deny("prospect");
  }
  if (payload.candidate_id) {
    if (!hasAnyRole(["recruiter"])) return deny("candidate");
    const { error } = await userClient
      .from("candidates")
      .select("id")
      .eq("id", payload.candidate_id)
      .single();
    if (error) return deny("candidate");
  }

  // Attachments: server-generated invoice PDF and/or calendar invite.
  let attachments: { filename: string; content: string }[] | undefined;
  if (payload.attach_invoice_pdf && payload.invoice_id) {
    const { data: inv } = await db
      .from("invoices")
      .select(
        "number, kind, issued_at, due_date, period_start, period_end, currency, subtotal_minor, tax_total_minor, total_minor, notes, clients ( name, legal_name, billing_address, org_no, vat_no, payment_terms_days ), invoice_lines ( description, quantity, unit_price_minor, amount_minor, position )"
      )
      .eq("id", payload.invoice_id)
      .single();
    const { data: company } = await db
      .from("company_settings")
      .select(
        "company_name, legal_name, tagline, address, tin, registration_no, bank_details, invoice_intro, payment_instructions, vat_note, contact_note, issuer_name, issuer_title"
      )
      .single();
    if (inv?.number && company) {
      const pdf = await buildInvoicePdf(inv as never, company);
      let bin = "";
      pdf.forEach((b) => (bin += String.fromCharCode(b)));
      attachments = [{ filename: `${inv.number}.pdf`, content: btoa(bin) }];
    }
  }
  if (payload.event_id) {
    const { data: event } = await db
      .from("calendar_events")
      .select("*, calendar_attendees ( email, name, user_id )")
      .eq("id", payload.event_id)
      .single();
    if (event) {
      const ics = buildIcs(event, profile?.email ?? "noreply@ibrave.co");
      attachments = [
        ...(attachments ?? []),
        { filename: "invite.ics", content: btoa(ics) },
      ];
    }
  }

  // Wrap the message in the branded template; the sender's signature block
  // replaces the old bare footer line.
  const bodyHtml = sanitizeUserHtml(payload.html);
  const signedHtml = renderEmail({
    preheader: payload.subject,
    bodyHtml: `${bodyHtml}
      <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e2ddd3;
                color:#6f695f;font-size:13px;line-height:1.5;">
        ${profile?.full_name ?? "ibrave"}${fromEmail !== profile?.email ? ` · ${fromName}` : ""} · ibrave<br/>
        <a href="mailto:${profile?.email ?? fromEmail}" style="color:#b0762a;">${profile?.email ?? fromEmail}</a>
      </p>`,
    companyLine: "ibrave, Software Engineering & Outsourcing Services",
  });

  const result = await sendEmailRaw({
    from: `${fromName} <${fromEmail}>`,
    to: payload.to,
    cc: payload.cc,
    subject: payload.subject,
    html: signedHtml,
    replyTo: fromEmail === profile?.email ? undefined : profile?.email,
    attachments,
  });

  const { data: logRow } = await db
    .from("email_log")
    .insert({
      sent_by: user.id,
      from_email: fromEmail,
      to_emails: payload.to,
      cc_emails: payload.cc ?? [],
      subject: payload.subject,
      body_html: bodyHtml,
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
    "PRODID:-//ibrave OS//EN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${event.id}@ibrave-os`,
    `DTSTAMP:${dt(new Date().toISOString())}`,
    `DTSTART:${dt(event.starts_at)}`,
    `DTEND:${dt(event.ends_at)}`,
    `SUMMARY:${esc(event.title)}`,
    event.description ? `DESCRIPTION:${esc(event.description)}` : "",
    event.location ? `LOCATION:${esc(event.location)}` : "",
    `ORGANIZER;CN=ibrave:mailto:${organizerEmail}`,
    attendees,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

function sanitizeUserHtml(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*\/?>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, "")
    .replace(/\s+(href|src)\s*=\s*javascript:[^\s>]*/gi, "");
}
