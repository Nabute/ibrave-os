// Shared helpers for Edge Functions. The service_role key lives ONLY here
// (function secrets) — never in the frontend.
import { createClient } from "npm:@supabase/supabase-js@2";

export function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );
}

export interface EmailMessage {
  to: string[];
  subject: string;
  html: string;
  cc?: string[];
  /** Full From header ("Name <addr>"). Defaults to EMAIL_FROM (system mail). */
  from?: string;
  replyTo?: string;
  attachments?: { filename: string; content: string }[]; // base64
}

/**
 * Send via Resend. Without RESEND_API_KEY configured (local dev) the send is
 * logged and skipped, so jobs stay runnable locally.
 */
export async function sendEmailRaw(msg: EmailMessage): Promise<{ ok: boolean; detail: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = msg.from ?? Deno.env.get("EMAIL_FROM") ?? "iBrave OS <noreply@ibrave.dev>";
  if (!apiKey) {
    console.log(`[email skipped — no RESEND_API_KEY] to=${msg.to.join(",")} subject=${msg.subject}`);
    return { ok: true, detail: "skipped (no RESEND_API_KEY)" };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: msg.to,
      cc: msg.cc,
      reply_to: msg.replyTo,
      subject: msg.subject,
      html: msg.html,
      attachments: msg.attachments,
    }),
  });
  const detail = await res.text();
  if (!res.ok) console.error(`Resend error ${res.status}: ${detail}`);
  return { ok: res.ok, detail };
}

export const sendEmail = sendEmailRaw;

/** Require the cron secret so jobs can't be triggered by the public. */
export function authorize(req: Request): Response | null {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret) return null; // local dev
  if (req.headers.get("Authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}
