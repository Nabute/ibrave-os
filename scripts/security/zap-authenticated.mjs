import { spawn, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import http from "node:http";
import { chromium } from "playwright";

const target = process.env.TARGET_URL ?? "https://os.ibrave.co";
const email = process.env.ZAP_EMAIL;
const password = process.env.ZAP_PASSWORD;
const label = process.env.ZAP_LABEL ?? email?.split("@")[0] ?? "authenticated";
const port = Number(process.env.ZAP_PORT ?? 18090);
const zapInternalPort = Number(process.env.ZAP_INTERNAL_PORT ?? 8080);
const failOn = process.env.ZAP_AUTH_FAIL_ON ?? "Medium";
const containerName = `ibrave-zap-${label.replace(/[^a-z0-9_.-]/gi, "-")}-${Date.now()}`;
const zapDebug = process.env.ZAP_DEBUG === "1";
let zapExited = false;
let zapExitCode = null;
let zapLogTail = "";

const commonRoutes = ["/", "/timesheet", "/calendar", "/settings", "/privacy"];
const privilegedRoutes = [
  "/approvals",
  "/projects",
  "/clients",
  "/invoices",
  "/staffing",
  "/sales",
  "/prospecting",
  "/command-center",
  "/recruiting",
  "/people",
  "/payouts",
  "/reports",
  "/admin",
  "/templates",
];
const routes = (process.env.ZAP_ROUTES ?? [...commonRoutes, ...privilegedRoutes].join(","))
  .split(",")
  .map((r) => r.trim())
  .filter(Boolean);

if (!email || !password) {
  console.error("ZAP_EMAIL and ZAP_PASSWORD are required.");
  process.exit(2);
}

const docker = spawnSync("docker", ["--version"], { encoding: "utf8" });
if (docker.status !== 0) {
  console.error("Docker is required to run authenticated ZAP.");
  process.exit(2);
}

function zapUrl(path) {
  return `http://127.0.0.1:${port}${path}`;
}

async function getJson(path) {
  return JSON.parse(await zapRequest(path));
}

async function zapRequest(path) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      zapUrl(path),
      {
        headers: { Host: "zap" },
        timeout: 10_000,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(body);
          } else {
            reject(new Error(`ZAP API ${path}: ${res.statusCode} ${body}`));
          }
        });
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error(`ZAP API ${path}: timeout`));
    });
    req.on("error", reject);
    req.end();
  });
}

async function waitForZap() {
  const started = Date.now();
  while (Date.now() - started < 180_000) {
    if (zapExited) {
      throw new Error(`ZAP exited before startup completed with code ${zapExitCode}.\n${zapLogTail}`);
    }
    try {
      await getJson("/JSON/core/view/version/");
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error(`ZAP did not start within 180 seconds.\n${zapLogTail}`);
}

async function waitForPassiveScan() {
  const started = Date.now();
  while (Date.now() - started < 180_000) {
    const data = await getJson("/JSON/pscan/view/recordsToScan/");
    if (Number(data.recordsToScan ?? 0) === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

function riskRank(risk) {
  return { Informational: 0, Low: 1, Medium: 2, High: 3 }[risk] ?? 0;
}

async function saveReports() {
  const html = await zapRequest("/OTHER/core/other/htmlreport/");
  const alerts = await getJson(`/JSON/core/view/alerts/?baseurl=${encodeURIComponent(target)}`);
  writeFileSync(`zap-auth-${label}.html`, html);
  writeFileSync(`zap-auth-${label}.json`, JSON.stringify(alerts, null, 2));
  return alerts.alerts ?? [];
}

function appendZapLog(data) {
  const text = String(data);
  zapLogTail = `${zapLogTail}${text}`.slice(-6000);
  if (zapDebug || /ERROR|WARN/i.test(text)) process.stderr.write(text);
}

function stopZap(child) {
  try {
    spawnSync("docker", ["stop", containerName], { stdio: "ignore" });
    spawnSync("docker", ["container", "rm", containerName], { stdio: "ignore" });
  } finally {
    child.kill("SIGTERM");
  }
}

const child = spawn(
  "docker",
  [
    "run",
    "--rm",
    "--name",
    containerName,
    "-p",
    `127.0.0.1:${port}:${zapInternalPort}`,
    "ghcr.io/zaproxy/zaproxy:stable",
    "zap.sh",
    "-daemon",
    "-host",
    "0.0.0.0",
    "-port",
    String(zapInternalPort),
    "-config",
    "api.disablekey=true",
    "-config",
    "api.addrs.addr.name=.*",
    "-config",
    "api.addrs.addr.regex=true",
    "-config",
    "start.checkForUpdates=false",
    "-config",
    "start.checkAddonUpdates=false",
  ],
  { stdio: ["ignore", "pipe", "pipe"] }
);

child.stdout.on("data", appendZapLog);
child.stderr.on("data", appendZapLog);
child.once("exit", (code) => {
  zapExited = true;
  zapExitCode = code;
});

try {
  await waitForZap();

  const browser = await chromium.launch({
    headless: true,
    proxy: { server: `http://127.0.0.1:${port}` },
    args: ["--ignore-certificate-errors"],
  });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 960 },
  });
  const page = await context.newPage();

  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.fill("input#email", email);
  await page.fill("input#password", password);
  await page.click('button[type="submit"]');
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await page.waitForTimeout(3500);

  const bodyText = await page.locator("body").innerText({ timeout: 10_000 }).catch(() => "");
  if (/two-factor|authenticator|verification code/i.test(bodyText)) {
    throw new Error(`${label} reached an MFA challenge; use a scanner account without MFA.`);
  }
  if (!(await page.locator("aside").count())) {
    throw new Error(`${label} did not reach the authenticated workspace.`);
  }

  for (const route of routes) {
    const url = new URL(route, target).toString();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(1200);
  }

  await browser.close();
  await waitForPassiveScan();
  const alerts = await saveReports();

  const threshold = riskRank(failOn);
  const actionable = alerts.filter((a) => riskRank(a.risk) >= threshold);
  const counts = alerts.reduce((acc, a) => {
    acc[a.risk] = (acc[a.risk] ?? 0) + 1;
    return acc;
  }, {});

  console.log(
    JSON.stringify(
      {
        label,
        target,
        routes: routes.length,
        alerts: counts,
        report: `zap-auth-${label}.html`,
      },
      null,
      2
    )
  );

  if (actionable.length) {
    for (const alert of actionable) {
      console.error(`${alert.risk}: ${alert.alert} ${alert.url ?? ""}`);
    }
    process.exitCode = 1;
  }
} finally {
  stopZap(child);
}
