import fs from "node:fs";

let passed = 0;
let failed = 0;

function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  }
}

function read(path) {
  return fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

const migration = read("supabase/migrations/20260806000041_tenant_foundation.sql");

const tenantTables = [
  "audit_log",
  "notifications",
  "activity_feed",
  "automation_runs",
  "workflow_history",
  "clients",
  "contacts",
  "projects",
  "tasks",
  "assignments",
  "time_off",
  "time_entries",
  "rate_cards",
  "rate_card_lines",
  "milestones",
  "invoices",
  "invoice_lines",
  "invoice_line_entries",
  "payments",
  "invoice_counters",
  "cost_rates",
  "payout_statements",
  "payout_lines",
  "payout_line_entries",
  "skills",
  "person_skills",
  "staffing_requests",
  "leads",
  "lead_activities",
  "quotes",
  "quote_lines",
  "contracts",
  "account_activities",
  "opportunities",
  "escalations",
  "feedback_pulses",
  "account_health",
  "prospects",
  "prospect_activities",
  "cadences",
  "cadence_runs",
  "sales_tasks",
  "requisitions",
  "candidates",
  "candidate_activities",
  "interview_rounds",
  "offers",
  "onboarding_tasks",
  "engagements",
  "email_log",
  "calendar_events",
  "calendar_attendees",
  "email_identities",
  "owner_alert_rules",
  "email_templates",
  "privacy_requests",
  "privacy_retention_policies",
  "security_events",
];

check("saas tenancy: workspaces table", migration.includes("create table if not exists public.workspaces"));
check(
  "saas tenancy: workspace memberships",
  migration.includes("create table if not exists public.workspace_memberships")
);
check("saas tenancy: workspace invites", migration.includes("create table if not exists public.workspace_invites"));
check("saas tenancy: invite token hash only", migration.includes("token_hash") && !migration.includes(" invite_token"));
check("saas tenancy: workspace settings", migration.includes("create table if not exists public.workspace_settings"));
check("saas tenancy: default workspace backfill", migration.includes("00000000-0000-4000-8000-000000000001"));
check("saas tenancy: current workspace helper", migration.includes("public.current_workspace_id()"));
check("saas tenancy: membership helper", migration.includes("public.is_workspace_member"));
check("saas tenancy: scoped role helper", migration.includes("public.has_workspace_role"));
check("saas tenancy: legacy role compatibility", migration.includes("create or replace function public.has_role"));
check("saas tenancy: RLS enabled for workspaces", migration.includes("alter table public.workspaces enable row level security"));
check(
  "saas tenancy: RLS enabled for memberships",
  migration.includes("alter table public.workspace_memberships enable row level security")
);
check(
  "saas tenancy: RLS enabled for settings",
  migration.includes("alter table public.workspace_settings enable row level security")
);

const missing = tenantTables.filter((table) => !migration.includes(`'${table}'`));
check("saas tenancy: workspace_id target table list", missing.length === 0, missing.join(", "));
check("saas tenancy: workspace_id column add", migration.includes("add column if not exists workspace_id uuid"));
check("saas tenancy: workspace_id backfill", migration.includes("set workspace_id ="));
check("saas tenancy: workspace_id default", migration.includes("alter column workspace_id set default public.current_workspace_id()"));
check("saas tenancy: workspace_id not null", migration.includes("alter column workspace_id set not null"));
check("saas tenancy: workspace_id indexes", migration.includes("_workspace_idx"));
check("saas tenancy: complete workspace settings clone", migration.includes("invoice_intro") && migration.includes("acct_revenue"));

console.log(`\nSaaS tenancy checks: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
