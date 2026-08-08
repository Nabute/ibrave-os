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

const summary = read("docs/SUMMARY.md");
const index = read("docs/index.md");
const accessModel = read("docs/access-model.md");
const workflows = read("docs/feature-workflows.md");
const clientPortal = read("docs/user-guide/client-portal.md");
const roleMatrix = read("docs/role-matrix.md");
const ownerAdmin = read("docs/user-guide/owner-admin.md");
const pm = read("docs/user-guide/project-manager.md");
const finance = read("docs/user-guide/finance.md");
const runbook = read("docs/operations-runbook.md");

check("docs: access model linked", summary.includes("access-model.md") && index.includes("access-model.md"));
check("docs: workflow guide linked", summary.includes("feature-workflows.md") && index.includes("feature-workflows.md"));
check("docs: client portal guide linked", summary.includes("user-guide/client-portal.md") && index.includes("Client Portal"));
check(
  "docs: access model separates internal and clients",
  accessModel.includes("Workspace users") &&
    accessModel.includes("Client portal contacts") &&
    accessModel.includes("Do not invite a client through") &&
    accessModel.includes("Productivity integrations")
);
check(
  "docs: client portal usage documented",
  clientPortal.includes("Add a client contact") &&
    clientPortal.includes("Share a document record") &&
    clientPortal.includes("Create an approval request") &&
    clientPortal.includes("Current client access boundary")
);
check(
  "docs: feature workflows cover core modules",
  [
    "Account access and onboarding",
    "Time tracking",
    "Approvals",
    "Client setup and Account 360",
    "Client portal administration",
    "Invoicing",
    "Payouts",
    "Sales, quotes and win handoff",
    "Productivity integrations",
    "Privacy Center",
  ].every((needle) => workflows.includes(needle))
);
check(
  "docs: feature workflows include concrete examples",
  workflows.includes("Example: Jira") &&
    workflows.includes("Example: GitHub") &&
    workflows.includes("End-to-end business example")
);
check("docs: role matrix includes client boundary", roleMatrix.includes("External client contacts") && roleMatrix.includes("Client portal records"));
check("docs: admin integrations documented", ownerAdmin.includes("Admin -> Integrations") && ownerAdmin.includes("Admin -> Trust"));
check("docs: pm productivity and client approvals documented", pm.includes("Productivity integrations on projects") && pm.includes("Client-facing approvals"));
check("docs: finance client approval flow documented", finance.includes("Client portal") && finance.includes("Accounting integrations"));
check(
  "docs: runbook integration operations documented",
  runbook.includes("integrations") &&
    runbook.includes("GitHub minimum setup") &&
    runbook.includes("Jira minimum setup") &&
    runbook.includes("Productivity integration operations")
);

console.log(`\nDocumentation access/workflow checks: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
