// Shared helpers for Edge Functions. The service_role key lives ONLY here
// (function secrets), never in the frontend.
import { createClient } from "npm:@supabase/supabase-js@2";

/** CORS headers for browser-called functions. Production should set
 *  ALLOWED_ORIGINS to a comma-separated list, e.g. https://os.ibrave.co. */
export const CORS = {
  "Access-Control-Allow-Origin": "https://os.ibrave.co",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
} as const;

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function allowedOrigin(req: Request): string {
  const origin = req.headers.get("Origin");
  const configured = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://os.ibrave.co,http://localhost:5173,http://localhost:5199")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (origin && configured.includes(origin)) return origin;
  return configured[0] ?? "https://os.ibrave.co";
}

function withCors(req: Request, res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set("Access-Control-Allow-Origin", allowedOrigin(req));
  headers.set("Access-Control-Allow-Headers", CORS["Access-Control-Allow-Headers"]);
  headers.set("Access-Control-Allow-Methods", CORS["Access-Control-Allow-Methods"]);
  headers.set("Vary", "Origin");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

/**
 * Standard server wrapper: answers preflight before any auth check and turns
 * uncaught errors (bad JSON body, invalid UUIDs, provider outages) into a
 * CORS-carrying 500, otherwise the browser reports them as CORS failures
 * and hides the real message.
 */
export function serveJson(handler: (req: Request) => Promise<Response> | Response): void {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: { ...CORS, "Access-Control-Allow-Origin": allowedOrigin(req) },
      });
    }
    try {
      return withCors(req, await handler(req));
    } catch (e) {
      console.error("unhandled function error:", e);
      return withCors(req, jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500));
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

export async function logSecurityEvent(
  db: ReturnType<typeof createClient>,
  req: Request,
  event: {
    actorId?: string | null;
    eventType: string;
    severity?: "info" | "low" | "medium" | "high" | "critical";
    entityType?: string | null;
    entityId?: string | null;
    detail?: Record<string, unknown>;
  }
): Promise<void> {
  const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const userAgent = req.headers.get("user-agent");
  const { error } = await db.from("security_events").insert({
    actor_id: event.actorId ?? null,
    event_type: event.eventType,
    severity: event.severity ?? "medium",
    source: "edge_function",
    entity_type: event.entityType ?? null,
    entity_id: event.entityId ?? null,
    ip: forwardedFor || null,
    user_agent: userAgent,
    detail: event.detail ?? {},
  });
  if (error) console.error("security event log failed:", error.message);
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
