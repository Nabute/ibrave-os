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

const vercel = JSON.parse(read("vercel.json"));
const pkg = JSON.parse(read("package.json"));
const headers = vercel.headers.flatMap((h) => h.headers ?? []);
const headerMap = new Map(headers.map((h) => [h.key.toLowerCase(), h.value]));

check("security headers: hsts", headerMap.has("strict-transport-security"));
check("security headers: csp", headerMap.has("content-security-policy"));
check(
  "security headers: csp denies framing",
  headerMap.get("content-security-policy")?.includes("frame-ancestors 'none'")
);
check("security headers: no sniff", headerMap.get("x-content-type-options") === "nosniff");
check("security headers: frame deny", headerMap.get("x-frame-options") === "DENY");
check("security headers: referrer policy", headerMap.has("referrer-policy"));
check("security headers: permissions policy", headerMap.has("permissions-policy"));
check("security headers: coep", headerMap.get("cross-origin-embedder-policy") === "require-corp");
check(
  "security headers: cors not wildcard",
  headerMap.get("access-control-allow-origin") === "https://os.ibrave.co"
);
check(
  "security headers: csp exact supabase origin",
  headerMap.get("content-security-policy")?.includes("https://zdhkcfjvywthesafbaov.supabase.co") &&
    !headerMap.get("content-security-policy")?.includes("*.supabase.co")
);
check(
  "security headers: csp no broad https image source",
  !headerMap.get("content-security-policy")?.includes("img-src 'self' data: blob: https:")
);
check(
  "security headers: csp disallows inline styles",
  !headerMap.get("content-security-policy")?.includes("'unsafe-inline'")
);
check("supply chain: audit script", pkg.scripts["security:audit"]?.includes("npm audit"));
check("supply chain: sbom script", pkg.scripts["security:sbom"]?.includes("npm sbom"));
check("supply chain: aggregate check", pkg.scripts["security:check"]?.includes("security:static"));
check("supply chain: ci workflow", read(".github/workflows/security.yml").includes("npm run security:check"));

const migration = read("supabase/migrations/20260806000039_privacy_governance.sql");
check("privacy migration: request table", migration.includes("create table public.privacy_requests"));
check(
  "privacy migration: rls enabled",
  migration.includes("alter table public.privacy_requests enable row level security")
);
check("privacy migration: self-service submit rpc", migration.includes("public.submit_privacy_request"));
check("privacy migration: self-service export rpc", migration.includes("public.my_privacy_export"));
check("privacy migration: retention due rpc", migration.includes("public.privacy_retention_due"));
check("privacy migration: no destructive retention automation", !/delete\s+from\s+public\./i.test(migration));

const securityEvents = read("supabase/migrations/20260806000040_security_events.sql");
const edgeShared = read("supabase/functions/_shared/admin.ts");
check("security events: table", securityEvents.includes("create table public.security_events"));
check("security events: rls enabled", securityEvents.includes("alter table public.security_events enable row level security"));
check("security events: record rpc", securityEvents.includes("public.record_security_event"));
check("security events: admin read policy", securityEvents.includes("security_events_admin_read"));
check("edge functions: cors is not wildcard", !edgeShared.includes('"Access-Control-Allow-Origin": "*"'));
check("edge functions: origin allowlist", edgeShared.includes("ALLOWED_ORIGINS"));

const router = read("src/routes/router.tsx");
check("privacy route: public notice", router.includes('path: "/privacy-notice"'));
check("privacy route: authenticated center", router.includes('path: "/privacy"'));

const notice = read("src/features/privacy/PrivacyNoticeScreen.tsx");
const center = read("src/features/privacy/PrivacyCenterScreen.tsx");
const threatModel = read("docs/security-threat-model.md");
const scorecard = read("docs/owasp-scorecard.md");
const indexHtml = read("index.html");
check("privacy notice: storage disclosure", notice.includes("browser storage"));
check("privacy center: export action", center.includes("Export my data"));
check("privacy center: request workflow", center.includes("Submit a request"));
check("html: no inline style block", !indexHtml.includes("<style>"));
check("html: external splash css", indexHtml.includes('href="/splash.css"'));
check("docs: threat model abuse cases", threatModel.includes("Abuse Cases"));
check("docs: owasp scorecard", scorecard.includes("OWASP Top 10:2025"));

console.log(`\nCompliance readiness checks: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
