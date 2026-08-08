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

const migration = read("supabase/migrations/20260806000042_productization_foundation.sql");
const adminScreen = read("src/features/admin/AdminScreen.tsx");
const clientDetail = read("src/features/clients/ClientDetailScreen.tsx");
const apiIndex = read("src/lib/api/index.ts");
const productizationRepo = read("src/lib/api/modules/productization.ts");
const integrationsFunction = read("supabase/functions/integrations/index.ts");
const supabaseConfig = read("supabase/config.toml");
const envExample = read(".env.example");

const expectedTables = [
  "workspace_setup_steps",
  "onboarding_import_batches",
  "onboarding_import_rows",
  "integration_connections",
  "integration_sync_runs",
  "external_record_links",
  "tax_rates",
  "bank_statement_imports",
  "bank_statement_rows",
  "payment_reconciliation_matches",
  "client_portal_users",
  "client_documents",
  "client_approval_requests",
  "user_saved_views",
  "report_drilldown_snapshots",
  "trust_artifacts",
  "admin_audit_exports",
];

const expectedProviders = [
  "quickbooks",
  "xero",
  "netsuite",
  "stripe",
  "wise",
  "bank_csv",
  "jira",
  "linear",
  "github",
  "google_calendar",
  "microsoft_calendar",
  "slack",
  "teams",
];

const missingTables = expectedTables.filter((table) => !migration.includes(`public.${table}`));
const missingProviders = expectedProviders.filter((provider) => !migration.includes(`'${provider}'`));

check("productization: all foundation tables", missingTables.length === 0, missingTables.join(", "));
check("productization: provider enum coverage", missingProviders.length === 0, missingProviders.join(", "));
check("productization: onboarding import types", migration.includes("'opening_balances'") && migration.includes("'rate_cards'"));
check("productization: token secret reference only", migration.includes("token_secret_name") && !migration.includes("access_token"));
check("productization: tax and reverse charge support", migration.includes("tax_rates") && migration.includes("reverse_charge"));
check("productization: reconciliation model", migration.includes("payment_reconciliation_matches") && migration.includes("confidence_pct"));
check("productization: client portal approvals", migration.includes("client_approval_requests") && migration.includes("client_approval_status"));
check("productization: client documents visibility", migration.includes("client_documents") && migration.includes("visibility"));
check("productization: saved views", migration.includes("user_saved_views") && migration.includes("is_default"));
check("productization: report drilldown snapshots", migration.includes("report_drilldown_snapshots"));
check("productization: trust artifacts", migration.includes("trust_artifacts") && migration.includes("'soc2_evidence'"));
check("productization: admin audit exports", migration.includes("admin_audit_exports"));
check("productization: RLS loop", migration.includes("enable row level security") && migration.includes("public.is_workspace_member"));
check("productization: finance write policies", migration.includes("bank_imports_finance_write") && migration.includes("reconciliation_finance_write"));
check("productization: client portal write policy", migration.includes("client_portal_admin_write"));
check("productization: saved view own-write policy", migration.includes("user_saved_views_own_write"));
check("productization: default setup checklist", migration.includes("workspace_setup_steps") && migration.includes("people_import"));
check("productization: api repository exported", apiIndex.includes("productization: new ProductizationRepository"));
check(
  "productization: admin tabs wired",
  ["ProductizationSetupTab", "IntegrationsTab", "TrustCenterTab", 'TabsTrigger value="setup"', 'TabsTrigger value="integrations"', 'TabsTrigger value="trust"'].every((needle) =>
    adminScreen.includes(needle)
  )
);
check(
  "productization: admin registry avoids inline style",
  !adminScreen.includes("style={{") && adminScreen.includes("aria-label=\"Setup progress\"")
);
check(
  "productization: repository covers setup integrations portal trust",
  [
    "setupSteps",
    "createImportBatch",
    "upsertIntegration",
    "clientPortalUsers",
    "createClientPortalUser",
    "clientDocuments",
    "createClientDocument",
    "clientApprovalRequests",
    "createClientApprovalRequest",
    "trustArtifacts",
  ].every((needle) =>
    productizationRepo.includes(needle)
  )
);
check(
  "productization: client portal account view wired",
  [
    "function PortalTab",
    'TabsTrigger value="portal"',
    "createClientPortalUser",
    "createClientDocument",
    "createClientApprovalRequest",
  ].every((needle) => clientDetail.includes(needle))
);
check(
  "productization: integration edge function registered",
  supabaseConfig.includes("[functions.integrations]") && supabaseConfig.includes("verify_jwt = true")
);
check(
  "productization: integration gateway keeps provider secrets server-side",
  [
    'Deno.env.get(name)',
    "QUICKBOOKS_ACCESS_TOKEN",
    "STRIPE_SECRET_KEY",
    "MICROSOFT_GRAPH_TOKEN",
    "SLACK_BOT_TOKEN",
  ].every((needle) => integrationsFunction.includes(needle)) &&
    !adminScreen.includes("ACCESS_TOKEN") &&
    !adminScreen.includes("SECRET_KEY")
);
check(
  "productization: provider secrets documented as non-vite env",
  [
    "supabase secrets set",
    "QUICKBOOKS_ACCESS_TOKEN=",
    "STRIPE_SECRET_KEY=",
    "MICROSOFT_GRAPH_TOKEN=",
    "SLACK_BOT_TOKEN=",
  ].every((needle) => envExample.includes(needle)) &&
    !envExample.includes("VITE_STRIPE_SECRET_KEY") &&
    !envExample.includes("VITE_QUICKBOOKS_ACCESS_TOKEN")
);
check(
  "productization: integration sync audited",
  integrationsFunction.includes("integration_sync_runs") &&
    integrationsFunction.includes("integrations.sync_succeeded") &&
    integrationsFunction.includes("integrations.sync_failed") &&
    integrationsFunction.includes("logSecurityEvent")
);
check(
  "productization: provider env readiness and sync ui",
  ["integrationProviderStatus", "syncIntegration", "Provider readiness", "Test sync"].every((needle) =>
    adminScreen.includes(needle) || productizationRepo.includes(needle)
  )
);

console.log(`\nProductization foundation checks: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
