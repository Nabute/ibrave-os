import { as, asLogin, check, expectOk, summary } from "./harness.mjs";

console.log("\nV15 - security events");

const dev1 = await as("dev1");
const admin = await asLogin("test.admin@ibrave.co", "Passw0rd!Test", "test.admin");

const { data: eventId, error: recordErr } = await dev1.rpc("record_security_event", {
  p_event_type: "validation.security_event",
  p_severity: "low",
  p_source: "frontend",
  p_entity_type: "validation",
  p_entity_id: "v15",
  p_detail: { reason: "validation" },
});
expectOk("employee can record own frontend security event", recordErr, typeof eventId === "number");

const { data: employeeVisible, error: employeeVisibleErr } = await dev1
  .from("security_events")
  .select("id")
  .eq("id", eventId);
expectOk(
  "employee cannot read security event table",
  employeeVisibleErr,
  Array.isArray(employeeVisible) && employeeVisible.length === 0
);

const { data: adminVisible, error: adminVisibleErr } = await admin
  .from("security_events")
  .select("id,event_type,severity,source,detail")
  .eq("id", eventId)
  .single();
expectOk(
  "admin can read security event",
  adminVisibleErr,
  adminVisible?.event_type === "validation.security_event" &&
    adminVisible?.severity === "low" &&
    adminVisible?.source === "frontend"
);

const denied = await dev1.functions.invoke("admin-users", {
  body: { action: "reset_password", user_id: "00000000-0000-0000-0000-000000000000" },
});
check("non-admin admin-users call is denied", !!denied.error, denied.error?.message ?? "");

const { data: edgeEvents, error: edgeEventsErr } = await admin
  .from("security_events")
  .select("event_type,severity,source")
  .eq("event_type", "admin_users.role_denied")
  .order("created_at", { ascending: false })
  .limit(1);
expectOk(
  "edge function denial is security-logged",
  edgeEventsErr,
  edgeEvents?.[0]?.severity === "high" && edgeEvents?.[0]?.source === "edge_function"
);

summary("V15 security events");
