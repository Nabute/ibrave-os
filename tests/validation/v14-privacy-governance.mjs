import { as, asLogin, check, expectErr, expectOk, summary } from "./harness.mjs";

console.log("\nV14 - privacy governance");

const employee = await as("dev1");
const { data: exported, error: exportErr } = await employee.rpc("my_privacy_export");
expectOk(
  "employee can export own privacy data",
  exportErr,
  exported?.profile?.email === "dev1@ibrave.co" && Array.isArray(exported?.time_entries)
);

const { data: req, error: reqErr } = await employee.rpc("submit_privacy_request", {
  p_request_type: "access",
  p_details: "Validation request for the privacy governance workflow.",
});
expectOk("employee can submit privacy request", reqErr, !!req?.id && req.status === "open");

await employee
  .from("privacy_requests")
  .update({ status: "fulfilled" })
  .eq("id", req?.id);
const { data: afterSelfClose, error: afterSelfCloseErr } = await employee
  .from("privacy_requests")
  .select("status")
  .eq("id", req?.id)
  .single();
expectOk(
  "employee cannot self-close privacy request",
  afterSelfCloseErr,
  afterSelfClose?.status === "open"
);

const admin = await asLogin("test.admin@ibrave.co", "Passw0rd!Test", "test.admin");
const { data: due, error: dueErr } = await admin.rpc("privacy_retention_due");
expectOk(
  "admin can read retention review counts",
  dueErr,
  typeof due?.candidates_review_due === "number" &&
    typeof due?.prospects_review_due === "number"
);

const { error: updateErr } = await admin
  .from("privacy_requests")
  .update({ status: "withdrawn", response_note: "Validation cleanup." })
  .eq("id", req?.id);
expectOk("admin can update privacy request", updateErr);

const { data: ownVisible, error: ownVisibleErr } = await employee
  .from("privacy_requests")
  .select("status,response_note")
  .eq("id", req?.id)
  .single();
expectOk(
  "employee can read admin response on own request",
  ownVisibleErr,
  ownVisible?.status === "withdrawn" && ownVisible?.response_note === "Validation cleanup."
);

const { data: policies, error: policiesErr } = await employee
  .from("privacy_retention_policies")
  .select("data_area,lawful_basis,default_retention_months");
expectOk(
  "employee can read retention policy",
  policiesErr,
  Array.isArray(policies) && policies.some((p) => p.data_area === "candidates")
);

summary("V14 privacy governance");
