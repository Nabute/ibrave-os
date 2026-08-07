import { spawnSync } from "node:child_process";

const target = process.env.TARGET_URL;
if (!target) {
  console.error("TARGET_URL is required, for example TARGET_URL=http://localhost:5173 npm run security:dast");
  process.exit(2);
}

const docker = spawnSync("docker", ["--version"], { encoding: "utf8" });
if (docker.status !== 0) {
  console.error("Docker is required to run the OWASP ZAP baseline scan.");
  process.exit(2);
}

const args = [
  "run",
  "--rm",
  "-t",
  "-v",
  `${process.cwd()}:/zap/wrk:rw`,
  "ghcr.io/zaproxy/zaproxy:stable",
  "zap-baseline.py",
  "-t",
  target,
  "-m",
  process.env.ZAP_SPIDER_MINS ?? "1",
  "-T",
  process.env.ZAP_MAX_MINS ?? "5",
  "-r",
  "zap-report.html",
  "--autooff",
];

const result = spawnSync("docker", args, { stdio: "inherit" });
process.exit(result.status ?? 1);
