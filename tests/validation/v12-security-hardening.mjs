// V12 — Security hardening regression checks:
// role exactness for owner-only RPCs and backend MFA enforcement.
import { asLogin, check, expectErr, expectOk, summary } from "./harness.mjs";

const admin = await asLogin("test.admin@ibrave.co", "Passw0rd!Test", "test.admin");
const mfa = await asLogin("test.mfa@ibrave.co", "Passw0rd!Test", "test.mfa");

{
  const denied = await admin.rpc("command_center");
  expectErr("admin without owner cannot call command_center", denied.error);
}

{
  const requirement = await mfa.rpc("my_mfa_requirement");
  expectOk("mandated user can query MFA requirement", requirement.error, requirement.data === true);

  const day = await mfa.rpc("my_day");
  expectErr("mandated AAL1 user cannot call app RPCs", day.error, "MFA");

  const rows = await mfa.from("time_entries").select("id").limit(1);
  expectErr("mandated AAL1 user cannot read app tables", rows.error, "MFA");
}

summary("V12 Security hardening");
