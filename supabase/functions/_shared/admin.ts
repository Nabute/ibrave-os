// Shared helpers for Edge Functions. The service_role key lives ONLY here
// (function secrets), never in the frontend.
import { createClient } from "npm:@supabase/supabase-js@2";

/** CORS headers for browser-called functions. Auth is the JWT (validated by
 *  the gateway and again in-function), so a permissive origin is safe. */
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
} as const;

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

/**
 * Standard server wrapper: answers preflight before any auth check and turns
 * uncaught errors (bad JSON body, invalid UUIDs, provider outages) into a
 * CORS-carrying 500, otherwise the browser reports them as CORS failures
 * and hides the real message.
 */
export function serveJson(handler: (req: Request) => Promise<Response> | Response): void {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    try {
      return await handler(req);
    } catch (e) {
      console.error("unhandled function error:", e);
      return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });
}

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
  const from = msg.from ?? Deno.env.get("EMAIL_FROM") ?? "ibrave OS <noreply@ibrave.co>";
  if (!apiKey) {
    console.log(`[email skipped, no RESEND_API_KEY] to=${msg.to.join(",")} subject=${msg.subject}`);
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
