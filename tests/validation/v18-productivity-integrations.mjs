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

const migration = read("supabase/migrations/20260806000043_productivity_integrations.sql");
const integrationsFunction = read("supabase/functions/integrations/index.ts");
const adminScreen = read("src/features/admin/AdminScreen.tsx");
const projectScreen = read("src/features/projects/ProjectDetailScreen.tsx");
const projectRepo = read("src/lib/api/modules/projects.ts");
const productizationRepo = read("src/lib/api/modules/productization.ts");
const apiTypes = read("src/lib/api/types.ts");
const envExample = read(".env.example");
const packageJson = read("package.json");

const productivityProviders = [
  "jira",
  "linear",
  "github",
  "google_calendar",
  "microsoft_calendar",
  "slack",
  "teams",
];

check("productivity: normalized table exists", migration.includes("create table public.productivity_external_items"));
check("productivity: normalized table RLS", migration.includes("alter table public.productivity_external_items enable row level security"));
check("productivity: project and client indexes", migration.includes("productivity_external_items_project_idx") && migration.includes("productivity_external_items_client_idx"));
check("productivity: external item uniqueness", migration.includes("workspace_id, provider, connection_id, external_type, external_id"));
check("productivity: setup checklist seeded", migration.includes("delivery_integration"));
check(
  "productivity: server provider coverage",
  productivityProviders.every((provider) => integrationsFunction.includes(`"${provider}"`))
);
check(
  "productivity: provider endpoints",
  [
    "/rest/api/3/search",
    "api.linear.app/graphql",
    "api.github.com/repos",
    "googleapis.com/calendar/v3/calendars",
    "graph.microsoft.com/v1.0/me",
    "slack.com/api/conversations.history",
    "graph.microsoft.com/v1.0/teams",
  ].every((needle) => integrationsFunction.includes(needle))
);
check("productivity: server normalizes and upserts", integrationsFunction.includes("normalizeProductivityItems") && integrationsFunction.includes("upsertProductivityItems") && integrationsFunction.includes('from("productivity_external_items")'));
check("productivity: raw payload not returned to browser", integrationsFunction.includes("safeResult") && integrationsFunction.includes("const { data: _data"));
check("productivity: upsert count in sync run", integrationsFunction.includes("upserted") && integrationsFunction.includes("integration_sync_runs"));
check("productivity: project mapping in admin", adminScreen.includes("Project mapping") && adminScreen.includes("project_id"));
check("productivity: project view wired", projectScreen.includes("Productivity integrations") && projectRepo.includes("productivityItems"));
check("productivity: typed item model", apiTypes.includes("ProductivityExternalItem"));
check("productivity: default sync mode", productizationRepo.includes('objectType = "productivity"'));
check(
  "productivity: deployment env names documented",
  [
    "GITHUB_OWNER=",
    "GITHUB_REPO=",
    "JIRA_PROJECT_KEY=",
    "LINEAR_TEAM_ID=",
    "GOOGLE_CALENDAR_ID=",
    "MICROSOFT_CALENDAR_ID=",
    "SLACK_CHANNEL_ID=",
    "TEAMS_TEAM_ID=",
  ].every((needle) => envExample.includes(needle))
);
check("productivity: static suite includes this validation", packageJson.includes("v18-productivity-integrations.mjs"));

console.log(`\nProductivity integration checks: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
