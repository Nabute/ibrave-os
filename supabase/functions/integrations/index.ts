// Server-side integration gateway. Provider credentials are read from Edge
// Function environment variables only; the browser receives status and sync
// summaries, never tokens.
import { createClient } from "npm:@supabase/supabase-js@2";
import { adminClient, jsonResponse as json, logSecurityEvent, serveJson } from "../_shared/admin.ts";

type Provider =
  | "quickbooks"
  | "xero"
  | "netsuite"
  | "stripe"
  | "wise"
  | "bank_csv"
  | "jira"
  | "linear"
  | "github"
  | "google_calendar"
  | "microsoft_calendar"
  | "slack"
  | "teams";

type Action =
  | { action: "provider_status" }
  | { action: "sync"; connection_id: string; object_type?: string; direction?: "pull" | "push" | "bidirectional" };

interface Connection {
  id: string;
  workspace_id: string;
  provider: Provider;
  display_name: string;
  external_tenant_id: string | null;
  token_secret_name: string | null;
  config: Record<string, unknown>;
}

interface ProbeResult {
  ok: boolean;
  status: number;
  object_type: string;
  counts: Record<string, unknown>;
  error?: string;
  data?: unknown;
}

interface ProductivityItem {
  workspace_id: string;
  connection_id: string;
  provider: Provider;
  project_id: string | null;
  client_id: string | null;
  external_type: "issue" | "pull_request" | "event" | "message" | "channel" | "team";
  external_id: string;
  external_key?: string | null;
  title: string;
  status?: string | null;
  priority?: string | null;
  assignee?: string | null;
  external_url?: string | null;
  occurred_at?: string | null;
  due_at?: string | null;
  last_seen_at: string;
  metadata: Record<string, unknown>;
}

const DEFAULT_WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";

const PROVIDER_ENVS: Record<Provider, string[]> = {
  quickbooks: ["QUICKBOOKS_ACCESS_TOKEN", "QUICKBOOKS_REALM_ID"],
  xero: ["XERO_ACCESS_TOKEN", "XERO_TENANT_ID"],
  netsuite: ["NETSUITE_ACCOUNT_ID", "NETSUITE_ACCESS_TOKEN"],
  stripe: ["STRIPE_SECRET_KEY"],
  wise: ["WISE_API_TOKEN"],
  bank_csv: [],
  jira: ["JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN"],
  linear: ["LINEAR_API_KEY"],
  github: ["GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO"],
  google_calendar: ["GOOGLE_ACCESS_TOKEN"],
  microsoft_calendar: ["MICROSOFT_GRAPH_TOKEN"],
  slack: ["SLACK_BOT_TOKEN", "SLACK_CHANNEL_ID"],
  teams: ["MICROSOFT_GRAPH_TOKEN", "TEAMS_TEAM_ID"],
};

const PRODUCTIVITY_PROVIDERS = new Set<Provider>([
  "jira",
  "linear",
  "github",
  "google_calendar",
  "microsoft_calendar",
  "slack",
  "teams",
]);

function env(name: string): string {
  return Deno.env.get(name)?.trim() ?? "";
}

function providerStatus() {
  return (Object.keys(PROVIDER_ENVS) as Provider[]).map((provider) => {
    const required = PROVIDER_ENVS[provider];
    const missing = required.filter((name) => !env(name));
    return { provider, required_env: required, configured: missing.length === 0, missing_env: missing };
  });
}

async function requireUser(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } }
  );
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

async function hasIntegrationRole(
  db: ReturnType<typeof createClient>,
  userId: string,
  workspaceId: string
): Promise<boolean> {
  const { data, error } = await db
    .from("workspace_memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .eq("status", "active");
  const { data: legacy } = error
    ? await db.from("user_roles").select("role").eq("user_id", userId)
    : { data: [] };
  const roles = error ? legacy : data;
  return (roles ?? []).some((r) =>
    ["admin", "owner", "finance", "account_owner", "pm"].includes(String(r.role))
  );
}

async function requestJson(
  url: string,
  init: RequestInit,
  objectType: string,
  countKey = "remote_seen"
): Promise<ProbeResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text.slice(0, 500);
    }
    const count = Array.isArray(parsed)
      ? parsed.length
      : parsed && typeof parsed === "object" && "data" in parsed && Array.isArray((parsed as { data: unknown }).data)
        ? (parsed as { data: unknown[] }).data.length
        : parsed && typeof parsed === "object" && "items" in parsed && Array.isArray((parsed as { items: unknown }).items)
          ? (parsed as { items: unknown[] }).items.length
          : res.ok
            ? 1
            : 0;
    return {
      ok: res.ok,
      status: res.status,
      object_type: objectType,
      counts: { [countKey]: count, endpoint: new URL(url).host },
      error: res.ok ? undefined : String(text).slice(0, 500),
      data: parsed,
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      object_type: objectType,
      counts: { [countKey]: 0, endpoint: new URL(url).host },
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function bearer(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, Accept: "application/json" };
}

function connectionToken(connection: Connection, fallbackEnv: string): string {
  const override = connection.token_secret_name ? env(connection.token_secret_name) : "";
  return override || env(fallbackEnv);
}

async function probe(connection: Connection, requestedObjectType?: string): Promise<ProbeResult> {
  switch (connection.provider) {
    case "quickbooks": {
      const realm = String(connection.external_tenant_id || env("QUICKBOOKS_REALM_ID"));
      const host = env("QUICKBOOKS_ENVIRONMENT") === "production"
        ? "quickbooks.api.intuit.com"
        : "sandbox-quickbooks.api.intuit.com";
      if (!realm || !connectionToken(connection, "QUICKBOOKS_ACCESS_TOKEN")) {
        return missing(connection.provider, requestedObjectType ?? "company_info");
      }
      return requestJson(
        `https://${host}/v3/company/${realm}/companyinfo/${realm}?minorversion=75`,
        { headers: bearer(connectionToken(connection, "QUICKBOOKS_ACCESS_TOKEN")) },
        requestedObjectType ?? "company_info"
      );
    }
    case "xero": {
      if (!connectionToken(connection, "XERO_ACCESS_TOKEN")) {
        return missing(connection.provider, requestedObjectType ?? "connections");
      }
      return requestJson(
        "https://api.xero.com/connections",
        { headers: bearer(connectionToken(connection, "XERO_ACCESS_TOKEN")) },
        requestedObjectType ?? "connections"
      );
    }
    case "netsuite": {
      const account = env("NETSUITE_ACCOUNT_ID").toLowerCase().replace("_", "-");
      if (!account || !connectionToken(connection, "NETSUITE_ACCESS_TOKEN")) {
        return missing(connection.provider, requestedObjectType ?? "metadata");
      }
      return requestJson(
        `https://${account}.suitetalk.api.netsuite.com/services/rest/record/v1/metadata-catalog`,
        { headers: bearer(connectionToken(connection, "NETSUITE_ACCESS_TOKEN")) },
        requestedObjectType ?? "metadata"
      );
    }
    case "stripe":
      if (!connectionToken(connection, "STRIPE_SECRET_KEY")) {
        return missing(connection.provider, requestedObjectType ?? "account");
      }
      return requestJson(
        "https://api.stripe.com/v1/account",
        { headers: bearer(connectionToken(connection, "STRIPE_SECRET_KEY")) },
        requestedObjectType ?? "account"
      );
    case "wise":
      if (!connectionToken(connection, "WISE_API_TOKEN")) {
        return missing(connection.provider, requestedObjectType ?? "profiles");
      }
      return requestJson(
        "https://api.transferwise.com/v1/profiles",
        { headers: bearer(connectionToken(connection, "WISE_API_TOKEN")) },
        requestedObjectType ?? "profiles"
      );
    case "jira": {
      const base = env("JIRA_BASE_URL").replace(/\/$/, "");
      if (!base || !env("JIRA_EMAIL") || !env("JIRA_API_TOKEN")) {
        return missing(connection.provider, requestedObjectType ?? "issues");
      }
      const auth = btoa(`${env("JIRA_EMAIL")}:${env("JIRA_API_TOKEN")}`);
      const jql = String(
        connection.config?.jql ||
          env("JIRA_JQL") ||
          (env("JIRA_PROJECT_KEY") ? `project = ${env("JIRA_PROJECT_KEY")} order by updated DESC` : "order by updated DESC")
      );
      return requestJson(
        `${base}/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=25&fields=summary,status,assignee,priority,duedate,updated,project`,
        { headers: { Authorization: `Basic ${auth}`, Accept: "application/json" } },
        requestedObjectType ?? "issues"
      );
    }
    case "linear":
      if (!connectionToken(connection, "LINEAR_API_KEY")) {
        return missing(connection.provider, requestedObjectType ?? "issues");
      }
      return requestJson(
        "https://api.linear.app/graphql",
        {
          method: "POST",
          headers: { ...bearer(connectionToken(connection, "LINEAR_API_KEY")), "Content-Type": "application/json" },
          body: JSON.stringify({
            query: env("LINEAR_TEAM_ID")
              ? `query ProductivityIssues($teamId: String!) {
                  issues(first: 25, filter: { team: { id: { eq: $teamId } } }) {
                    nodes { id identifier title url priorityLabel updatedAt dueDate state { name } assignee { name email } project { name } }
                  }
                }`
              : `query ProductivityIssues {
                  issues(first: 25) {
                    nodes { id identifier title url priorityLabel updatedAt dueDate state { name } assignee { name email } project { name } }
                  }
                }`,
            variables: env("LINEAR_TEAM_ID") ? { teamId: env("LINEAR_TEAM_ID") } : {},
          }),
        },
        requestedObjectType ?? "issues"
      );
    case "github":
      if (!connectionToken(connection, "GITHUB_TOKEN")) {
        return missing(connection.provider, requestedObjectType ?? "issues");
      }
      if (!env("GITHUB_OWNER") || !env("GITHUB_REPO")) return missing(connection.provider, requestedObjectType ?? "issues");
      return requestJson(
        `https://api.github.com/repos/${env("GITHUB_OWNER")}/${env("GITHUB_REPO")}/issues?state=all&per_page=25&sort=updated&direction=desc`,
        { headers: { ...bearer(connectionToken(connection, "GITHUB_TOKEN")), "X-GitHub-Api-Version": "2022-11-28" } },
        requestedObjectType ?? "issues"
      );
    case "google_calendar":
      if (!connectionToken(connection, "GOOGLE_ACCESS_TOKEN")) {
        return missing(connection.provider, requestedObjectType ?? "events");
      }
      return requestJson(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(env("GOOGLE_CALENDAR_ID") || "primary")}/events?maxResults=25&singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(new Date().toISOString())}`,
        { headers: bearer(connectionToken(connection, "GOOGLE_ACCESS_TOKEN")) },
        requestedObjectType ?? "events"
      );
    case "microsoft_calendar":
      if (!connectionToken(connection, "MICROSOFT_GRAPH_TOKEN")) {
        return missing(connection.provider, requestedObjectType ?? "events");
      }
      return requestJson(
        env("MICROSOFT_CALENDAR_ID")
          ? `https://graph.microsoft.com/v1.0/me/calendars/${env("MICROSOFT_CALENDAR_ID")}/events?$top=25&$orderby=start/dateTime`
          : "https://graph.microsoft.com/v1.0/me/events?$top=25&$orderby=start/dateTime",
        { headers: bearer(connectionToken(connection, "MICROSOFT_GRAPH_TOKEN")) },
        requestedObjectType ?? "events"
      );
    case "teams":
      if (!connectionToken(connection, "MICROSOFT_GRAPH_TOKEN")) {
        return missing(connection.provider, requestedObjectType ?? "channels");
      }
      if (!env("TEAMS_TEAM_ID")) return missing(connection.provider, requestedObjectType ?? "channels");
      return requestJson(
        `https://graph.microsoft.com/v1.0/teams/${env("TEAMS_TEAM_ID")}/channels`,
        { headers: bearer(connectionToken(connection, "MICROSOFT_GRAPH_TOKEN")) },
        requestedObjectType ?? "channels",
        "teams_seen"
      );
    case "slack":
      if (!connectionToken(connection, "SLACK_BOT_TOKEN")) {
        return missing(connection.provider, requestedObjectType ?? "messages");
      }
      if (!env("SLACK_CHANNEL_ID")) return missing(connection.provider, requestedObjectType ?? "messages");
      return requestJson(
        `https://slack.com/api/conversations.history?channel=${encodeURIComponent(env("SLACK_CHANNEL_ID"))}&limit=25`,
        { headers: bearer(connectionToken(connection, "SLACK_BOT_TOKEN")) },
        requestedObjectType ?? "messages"
      );
    case "bank_csv":
      return { ok: true, status: 200, object_type: requestedObjectType ?? "bank_csv", counts: { remote_seen: 0, local_only: true } };
  }
}

function missing(provider: Provider, objectType: string): ProbeResult {
  const missingEnv = PROVIDER_ENVS[provider].filter((name) => !env(name));
  return {
    ok: false,
    status: 422,
    object_type: objectType,
    counts: { remote_seen: 0 },
    error: `Missing required environment variables: ${missingEnv.join(", ")}`,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function nested(value: unknown, key: string): Record<string, unknown> {
  return asRecord(asRecord(value)[key]);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function itemBase(connection: Connection): Pick<ProductivityItem, "workspace_id" | "connection_id" | "provider" | "project_id" | "client_id" | "last_seen_at"> {
  return {
    workspace_id: connection.workspace_id,
    connection_id: connection.id,
    provider: connection.provider,
    project_id: text(connection.config?.project_id),
    client_id: text(connection.config?.client_id),
    last_seen_at: new Date().toISOString(),
  };
}

function normalizeProductivityItems(connection: Connection, result: ProbeResult): ProductivityItem[] {
  if (!result.ok) return [];
  const base = itemBase(connection);
  const data = asRecord(result.data);

  if (connection.provider === "jira") {
    const issues = Array.isArray(data.issues) ? data.issues : [];
    return issues.map((issue) => {
      const row = asRecord(issue);
      const fields = nested(issue, "fields");
      return {
        ...base,
        external_type: "issue",
        external_id: String(row.id ?? row.key),
        external_key: text(row.key),
        title: text(fields.summary) ?? String(row.key ?? "Jira issue"),
        status: text(nested(fields, "status").name),
        priority: text(nested(fields, "priority").name),
        assignee: text(nested(fields, "assignee").displayName),
        external_url: env("JIRA_BASE_URL") && row.key ? `${env("JIRA_BASE_URL").replace(/\/$/, "")}/browse/${row.key}` : null,
        occurred_at: text(fields.updated),
        due_at: text(fields.duedate),
        metadata: row,
      };
    });
  }

  if (connection.provider === "linear") {
    const issueRows = nested(nested(data, "data"), "issues").nodes;
    const issues = Array.isArray(issueRows) ? issueRows : [];
    return issues.map((issue) => {
      const row = asRecord(issue);
      return {
        ...base,
        external_type: "issue",
        external_id: String(row.id),
        external_key: text(row.identifier),
        title: text(row.title) ?? "Linear issue",
        status: text(nested(row, "state").name),
        priority: text(row.priorityLabel),
        assignee: text(nested(row, "assignee").name) ?? text(nested(row, "assignee").email),
        external_url: text(row.url),
        occurred_at: text(row.updatedAt),
        due_at: text(row.dueDate),
        metadata: row,
      };
    });
  }

  if (connection.provider === "github") {
    const issues = Array.isArray(result.data) ? result.data : [];
    return issues.map((issue) => {
      const row = asRecord(issue);
      return {
        ...base,
        external_type: row.pull_request ? "pull_request" : "issue",
        external_id: String(row.id ?? row.number),
        external_key: row.number != null ? `#${row.number}` : null,
        title: text(row.title) ?? "GitHub issue",
        status: text(row.state),
        priority: Array.isArray(row.labels)
          ? row.labels.map((l) => text(asRecord(l).name)).filter(Boolean).join(", ") || null
          : null,
        assignee: text(nested(row, "assignee").login),
        external_url: text(row.html_url),
        occurred_at: text(row.updated_at),
        due_at: null,
        metadata: row,
      };
    });
  }

  if (connection.provider === "google_calendar") {
    const events = Array.isArray(data.items) ? data.items : [];
    return events.map((event) => {
      const row = asRecord(event);
      return {
        ...base,
        external_type: "event",
        external_id: String(row.id),
        external_key: text(row.iCalUID),
        title: text(row.summary) ?? "Google Calendar event",
        status: text(row.status),
        priority: null,
        assignee: text(nested(row, "organizer").email),
        external_url: text(row.htmlLink),
        occurred_at: text(nested(row, "start").dateTime) ?? text(nested(row, "start").date),
        due_at: text(nested(row, "end").dateTime) ?? text(nested(row, "end").date),
        metadata: row,
      };
    });
  }

  if (connection.provider === "microsoft_calendar") {
    const events = Array.isArray(data.value) ? data.value : [];
    return events.map((event) => {
      const row = asRecord(event);
      return {
        ...base,
        external_type: "event",
        external_id: String(row.id),
        external_key: text(row.iCalUId),
        title: text(row.subject) ?? "Microsoft Calendar event",
        status: text(row.showAs),
        priority: text(row.importance),
        assignee: text(nested(nested(row, "organizer"), "emailAddress").address),
        external_url: text(row.webLink),
        occurred_at: text(nested(row, "start").dateTime),
        due_at: text(nested(row, "end").dateTime),
        metadata: row,
      };
    });
  }

  if (connection.provider === "slack") {
    const messages = Array.isArray(data.messages) ? data.messages : [];
    return messages.map((message) => {
      const row = asRecord(message);
      const ts = text(row.ts);
      return {
        ...base,
        external_type: "message",
        external_id: String(ts ?? crypto.randomUUID()),
        external_key: ts,
        title: (text(row.text) ?? "Slack message").slice(0, 180),
        status: null,
        priority: null,
        assignee: text(row.user) ?? text(row.username),
        external_url: null,
        occurred_at: ts ? new Date(Number(ts.split(".")[0]) * 1000).toISOString() : null,
        due_at: null,
        metadata: row,
      };
    });
  }

  if (connection.provider === "teams") {
    const channels = Array.isArray(data.value) ? data.value : [];
    return channels.map((channel) => {
      const row = asRecord(channel);
      return {
        ...base,
        external_type: "channel",
        external_id: String(row.id),
        external_key: text(row.membershipType),
        title: text(row.displayName) ?? "Teams channel",
        status: text(row.membershipType),
        priority: null,
        assignee: null,
        external_url: text(row.webUrl),
        occurred_at: text(row.createdDateTime),
        due_at: null,
        metadata: row,
      };
    });
  }

  return [];
}

async function upsertProductivityItems(
  db: ReturnType<typeof createClient>,
  connection: Connection,
  result: ProbeResult
): Promise<number> {
  if (!PRODUCTIVITY_PROVIDERS.has(connection.provider)) return 0;
  const rows = normalizeProductivityItems(connection, result);
  if (rows.length === 0) return 0;
  const { error } = await db
    .from("productivity_external_items")
    .upsert(rows, {
      onConflict: "workspace_id,provider,connection_id,external_type,external_id",
    });
  if (error) throw new Error(error.message);
  return rows.length;
}

serveJson(async (req) => {
  const db = adminClient();
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const caller = await requireUser(req);
  if (!caller) {
    await logSecurityEvent(db, req, {
      eventType: "integrations.unauthenticated",
      severity: "medium",
    });
    return json({ error: "Not authenticated" }, 401);
  }

  const payload = (await req.json()) as Action;
  if (payload.action === "provider_status") {
    const allowed = await hasIntegrationRole(db, caller.id, DEFAULT_WORKSPACE_ID);
    if (!allowed) return json({ error: "Integration role required" }, 403);
    return json({ providers: providerStatus() });
  }

  if (payload.action !== "sync" || !payload.connection_id) {
    return json({ error: "Unknown action" }, 422);
  }

  const { data: connection, error: connectionErr } = await db
    .from("integration_connections")
    .select("*")
    .eq("id", payload.connection_id)
    .single();
  if (connectionErr || !connection) return json({ error: "Integration not found" }, 404);

  const allowed = await hasIntegrationRole(db, caller.id, connection.workspace_id);
  if (!allowed) {
    await logSecurityEvent(db, req, {
      actorId: caller.id,
      eventType: "integrations.role_denied",
      severity: "high",
      entityType: "integration_connection",
      entityId: connection.id,
      detail: { provider: connection.provider },
    });
    return json({ error: "Integration role required" }, 403);
  }

  const direction = payload.direction ?? "pull";
  const objectType = payload.object_type ?? "health_check";
  const { data: run, error: runErr } = await db
    .from("integration_sync_runs")
    .insert({
      workspace_id: connection.workspace_id,
      connection_id: connection.id,
      direction,
      object_type: objectType,
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (runErr || !run) return json({ error: runErr?.message ?? "Could not create sync run" }, 400);

  const result = await probe(connection as Connection, objectType);
  let upserted = 0;
  try {
    upserted = await upsertProductivityItems(db, connection as Connection, result);
  } catch (e) {
    result.ok = false;
    result.error = e instanceof Error ? e.message : String(e);
  }
  const finishedAt = new Date().toISOString();
  await db
    .from("integration_sync_runs")
    .update({
      status: result.ok ? "succeeded" : "failed",
      finished_at: finishedAt,
      counts: { ...result.counts, upserted, http_status: result.status },
      error_message: result.error ?? null,
    })
    .eq("id", run.id);
  await db
    .from("integration_connections")
    .update({
      status: result.ok ? "connected" : "error",
      last_sync_at: result.ok ? finishedAt : connection.last_sync_at,
      error_message: result.error ?? null,
    })
    .eq("id", connection.id);

  await logSecurityEvent(db, req, {
    actorId: caller.id,
    eventType: result.ok ? "integrations.sync_succeeded" : "integrations.sync_failed",
    severity: result.ok ? "low" : "medium",
    entityType: "integration_connection",
    entityId: connection.id,
    detail: {
      provider: connection.provider,
      run_id: run.id,
      object_type: result.object_type,
      http_status: result.status,
      upserted,
      error: result.error,
    },
  });

  const { data: _data, ...safeResult } = result;
  return json({ ok: result.ok, run_id: run.id, result: { ...safeResult, counts: { ...safeResult.counts, upserted } } });
});
