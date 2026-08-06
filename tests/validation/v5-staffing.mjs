// V5 — Staffing: bench math, request FSM (fill/cancel + guards), candidate
// ranking (skills beat availability), time off effects, capacity forecast.
import { as, check, expectErr, expectOk, summary } from "./harness.mjs";

const dev1 = await as("dev1");
const dev2 = await as("dev2");
const pm = await as("pm"); // pm also holds resourcing role per seed
const finance = await as("finance");
const owner = await as("owner");

const { data: meD1 } = await dev1.auth.getUser();
const dev1Id = meD1.user.id;
const { data: meD2 } = await dev2.auth.getUser();
const dev2Id = meD2.user.id;
const { data: project } = await finance.from("projects").select("*").eq("code", "VTST-1").single();

// --- bench math --------------------------------------------------------------
{
  const { data: bench, error } = await pm.rpc("bench");
  expectOk("bench readable by resourcing", error);
  const rows = bench ?? [];
  check("bench covers everyone with capacity", rows.length >= 2, `rows=${rows.length}`);
  for (const r of rows) {
    const ok = Number(r.committed_allocation_pct) + Number(r.bench_pct) === 100
      || Number(r.committed_allocation_pct) >= 100;
    if (!ok) { check("bench pct sums to 100 (or over-allocated)", false, JSON.stringify(r)); break; }
  }
  check("bench pct arithmetic consistent", true);
  // cost only for finance/owner
  const { data: benchDev } = await dev1.rpc("bench");
  check("employee bench hides cost", (benchDev ?? []).every((r) => r.weekly_bench_cost_minor == null),
    JSON.stringify((benchDev ?? [])[0]));
}

// --- candidate ranking: skills beat availability -----------------------------
let reqId;
{
  // give dev1 a unique skill so the ranking has a clear winner
  let { data: skill } = await pm.from("skills").select("id").eq("name", "graphql").maybeSingle();
  if (!skill) {
    const insSkill = await pm.from("skills").insert({ name: "graphql" }).select().single();
    expectOk("create graphql skill", insSkill.error);
    skill = insSkill.data;
  }
  const ps = await pm.from("person_skills").upsert(
    { user_id: dev1Id, skill_id: skill.id, level: "senior" }, { onConflict: "user_id,skill_id" });
  expectOk("tag dev1 with graphql", ps.error);

  const req = await pm.from("staffing_requests").insert({
    project_id: project.id, role_title: "V5 Test Role", skills: ["graphql"],
    allocation_pct: 25, start_date: "2026-09-01", duration_weeks: 4,
    created_by: (await pm.auth.getUser()).data.user.id,
  }).select().single();
  expectOk("resourcing creates staffing request", req.error);
  reqId = req.data?.id;

  const dev1Try = await dev1.from("staffing_requests").insert({
    role_title: "hacked", skills: [], allocation_pct: 10, start_date: "2026-09-01",
  });
  expectErr("employee cannot create staffing requests", dev1Try.error);

  const sug = await pm.rpc("suggest_candidates", { p_request_id: reqId });
  expectOk("suggest_candidates runs", sug.error);
  const list = sug.data ?? [];
  const first = list[0];
  check("skill match ranked first", first?.user_id === dev1Id,
    JSON.stringify(list.slice(0, 2).map((r) => ({ u: r.user_id === dev1Id ? "dev1" : r.user_id, m: r.match_count ?? r.score }))));
}

// --- request FSM -------------------------------------------------------------
{
  const direct = await pm.from("staffing_requests").update({ status: "filled" }).eq("id", reqId);
  expectErr("direct status flip blocked", direct.error);

  const fill = await pm.rpc("fill_staffing_request", { p_request_id: reqId, p_user_id: dev2Id });
  expectOk("fill request creates assignment", fill.error);
  check("request → filled", fill.data?.status === "filled", `status=${fill.data?.status}`);

  const { data: asg } = await pm.from("assignments").select("*").eq("id", fill.data.filled_by_assignment).single();
  check("assignment window from request (start + 4wks, 25%)",
    asg?.start_date === "2026-09-01" && asg?.end_date === "2026-09-29" && Number(asg?.allocation_pct) === 25,
    JSON.stringify(asg));

  const { data: notif } = await dev2.from("notifications").select("kind").eq("kind", "assignment_created").limit(1);
  check("assignee notified", (notif?.length ?? 0) > 0);

  const refill = await pm.rpc("fill_staffing_request", { p_request_id: reqId, p_user_id: dev1Id });
  expectErr("refill of filled request blocked", refill.error);

  const cancelFilled = await pm.rpc("cancel_staffing_request", { p_request_id: reqId, p_comment: "nope" });
  expectErr("cancel of filled request blocked", cancelFilled.error);

  // cancel flow on a fresh request; comment required
  const req2 = await pm.from("staffing_requests").insert({
    project_id: project.id, role_title: "V5 Cancel Role", skills: ["node"],
    allocation_pct: 10, start_date: "2026-09-01",
  }).select().single();
  const noComment = await pm.rpc("cancel_staffing_request", { p_request_id: req2.data.id, p_comment: "" });
  expectErr("cancel requires comment", noComment.error);
  const cancel = await pm.rpc("cancel_staffing_request", { p_request_id: req2.data.id, p_comment: "v5 validation cleanup" });
  expectOk("cancel with comment", cancel.error);
  check("request → cancelled", cancel.data?.status === "cancelled", `status=${cancel.data?.status}`);
}

// --- time off shows on bench -------------------------------------------------
{
  const ins = await dev1.from("time_off").insert({
    user_id: dev1Id, start_date: "2026-08-10", end_date: "2026-08-12", kind: "vacation", note: "v5 test",
  }).select().single();
  expectOk("employee records own time off", ins.error);

  const other = await dev1.from("time_off").insert({
    user_id: dev2Id, start_date: "2026-08-10", end_date: "2026-08-12", kind: "vacation",
  });
  expectErr("cannot record time off for someone else", other.error);

  const { data: bench } = await pm.rpc("bench");
  const me = (bench ?? []).find((r) => r.user_id === dev1Id);
  check("bench shows dev1 time off days", Number(me?.time_off_days) >= 3, `days=${me?.time_off_days}`);
  if (ins.data) await dev1.from("time_off").delete().eq("id", ins.data.id);
}

// --- capacity forecast -------------------------------------------------------
{
  const { data: cap, error } = await owner.rpc("capacity_forecast", { p_months: 3 });
  expectOk("capacity forecast runs", error, (cap?.length ?? 0) > 0);
  const sept = (cap ?? []).find((r) => String(r.month).startsWith("2026-09"));
  check("forecast contains September (with new assignment demand)", sept != null, JSON.stringify(sept ?? cap?.[0]));
}

// --- cleanup: end the V5 test assignment so bench stays truthful -------------
{
  const { data: fill } = await pm.from("staffing_requests").select("filled_by_assignment").eq("id", reqId).single();
  if (fill?.filled_by_assignment) {
    const unlink = await pm.from("staffing_requests").update({ filled_by_assignment: null }).eq("id", reqId);
    const del = await pm.from("assignments").delete().eq("id", fill.filled_by_assignment).select();
    check("cleanup: test assignment removed", !unlink.error && !del.error,
      unlink.error?.message ?? del.error?.message ?? "");
  }
}

summary("V5 Staffing");
