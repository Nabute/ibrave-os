// Shared harness: logs in as seeded users against the HOSTED project and
// exposes assert helpers. Every check prints PASS/FAIL and the run exits
// non-zero if anything failed.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = readFileSync(
  ".env.local",
  "utf8"
);
const URL = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim();
const KEY = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim();

const clients = new Map();
export async function as(who) {
  if (clients.has(who)) return clients.get(who);
  const c = await asLogin(`${who}@ibrave.co`, "password123", who);
  clients.set(who, c);
  return c;
}

export async function asLogin(email, password, label = email) {
  const c = createClient(URL, KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login ${label}: ${error.message}`);
  return c;
}

let pass = 0;
let fail = 0;
const failures = [];

export function check(name, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    failures.push({ name, detail });
    console.log(`  FAIL  ${name}${detail ? "  — " + detail : ""}`);
  }
}

/** expect an error (RLS/guard/validation); ok when error is truthy */
export function expectErr(name, error, msgPart) {
  const ok =
    !!error && (msgPart ? String(error.message ?? error).includes(msgPart) : true);
  check(name, ok, error ? `got: ${error.message ?? error}` : "no error raised");
}

export function expectOk(name, error, extraOk = true) {
  check(name, !error && extraOk, error ? String(error.message ?? error) : "");
}

export function summary(module) {
  console.log(`\n${module}: ${pass} passed, ${fail} failed`);
  if (failures.length) {
    console.log("FAILURES:");
    for (const f of failures) console.log(`  - ${f.name}: ${f.detail}`);
  }
  process.exit(fail ? 1 : 0);
}

/** ISO Monday of the current week + offset weeks */
export function weekStart(offsetWeeks = 0) {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow + offsetWeeks * 7);
  return d.toISOString().slice(0, 10);
}

export function iso(d) {
  return d.toISOString().slice(0, 10);
}
