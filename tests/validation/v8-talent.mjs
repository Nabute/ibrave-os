// V8 — Talent: requisition → candidate FSM ladder, privacy tiers (recruiter /
// interviewer / everyone-else), scorecard-gated hire, offer flow, onboarding
// checklist, requisition auto-fill, talent pool park + reactivate.
import { as, check, expectErr, expectOk, summary } from "./harness.mjs";

const dev1 = await as("dev1");
const dev2 = await as("dev2");
const owner = await as("owner"); // recruiter via role expansion
const { data: meO } = await owner.auth.getUser();
const ownerId = meO.user.id;
const { data: meD2 } = await dev2.auth.getUser();
const dev2Id = meD2.user.id;

// cleanup stray artifacts from earlier runs
await owner.from("candidates").delete().like("full_name", "V8 %");
await owner.from("requisitions").delete().like("role_title", "V8 %");

// --- requisition -------------------------------------------------------------
let req;
{
  const r = await owner.from("requisitions").insert({
    role_title: "V8 Backend Engineer", skills: ["node", "postgres"], seniority: "senior",
    headcount: 1, reason: "growth",
  }).select().single();
  expectOk("recruiter opens requisition", r.error);
  req = r.data;
  const devTry = await dev1.from("requisitions").select("id").limit(1);
  check("employee cannot read requisitions", !!devTry.error || devTry.data?.length === 0,
    devTry.error?.message ?? JSON.stringify(devTry.data));
}

// --- candidate + privacy tiers ----------------------------------------------
let cand;
{
  const c = await owner.from("candidates").insert({
    full_name: "V8 Casey Candidate", email: "casey@v8.test", skills: ["node"],
    seniority: "senior", source: "referral", requisition_id: req.id, owner_id: ownerId,
    expected_rate_minor: 9000,
  }).select().single();
  expectOk("recruiter creates candidate", c.error);
  cand = c.data;

  const d1 = await dev1.from("candidates").select("id").eq("id", cand.id);
  check("employee cannot see candidate", (d1.data?.length ?? 0) === 0, JSON.stringify(d1.data));

  const d2Before = await dev2.from("candidates").select("id").eq("id", cand.id);
  check("future interviewer cannot see candidate yet", (d2Before.data?.length ?? 0) === 0, JSON.stringify(d2Before.data));
}

// --- FSM ladder + skip guard -------------------------------------------------
{
  const skip = await owner.rpc("candidate_action", { p_candidate_id: cand.id, p_action: "assess" });
  expectErr("cannot skip sourced → assess", skip.error);

  const devMove = await dev1.rpc("candidate_action", { p_candidate_id: cand.id, p_action: "screen" });
  expectErr("employee cannot move candidates", devMove.error);

  const s = await owner.rpc("candidate_action", { p_candidate_id: cand.id, p_action: "screen" });
  expectOk("sourced → screening", s.error);
  const i = await owner.rpc("candidate_action", { p_candidate_id: cand.id, p_action: "interview" });
  expectOk("screening → interview", i.error);

  // HATEOAS from interview: assess, offer, pool, reject — not hire
  const acts = await owner.rpc("candidate_actions", { p_candidate_id: cand.id });
  const names = Object.keys(acts.data ?? {});
  check("actions at interview: assess/offer/pool/reject, no hire",
    ["assess", "offer", "pool", "reject"].every((a) => names.includes(a)) && !names.includes("hire"),
    JSON.stringify(names));
}

// --- interviewer visibility + scorecard --------------------------------------
let round;
{
  const r = await owner.from("interview_rounds").insert({
    candidate_id: cand.id, round_no: 1, interviewer_id: dev2Id,
    scheduled_at: new Date().toISOString(),
  }).select().single();
  expectOk("schedule interview round (dev2)", r.error);
  round = r.data;

  const d2Now = await dev2.from("candidates").select("id").eq("id", cand.id);
  check("interviewer can now see candidate (privacy tier)", d2Now.data?.length === 1, JSON.stringify(d2Now.data));
  const d1Still = await dev1.from("candidates").select("id").eq("id", cand.id);
  check("other employees still cannot", (d1Still.data?.length ?? 0) === 0, JSON.stringify(d1Still.data));

  // hire before any submitted scorecard must fail (even from wrong stage it
  // should hit the scorecard guard first per H-3)
  const early = await owner.rpc("hire_candidate", { p_candidate_id: cand.id });
  expectErr("hire without completed scorecard blocked", early.error, "scorecard");

  // interviewer submits the scorecard
  const sc = await dev2.from("interview_rounds").update({
    scorecard: [{ criterion: "coding", score_1_5: 5, notes: "excellent" }],
    recommendation: "strong_yes", submitted_at: new Date().toISOString(),
  }).eq("id", round.id).select();
  expectOk("interviewer submits scorecard", sc.error, (sc.data?.length ?? 0) === 1);
}

// --- offer → hire ------------------------------------------------------------
{
  const adv = await owner.rpc("candidate_action", { p_candidate_id: cand.id, p_action: "assess" });
  expectOk("interview → assessment", adv.error);

  const offer = await owner.rpc("record_offer", {
    p_candidate_id: cand.id, p_rate_minor: 8500, p_rate_period: "hourly", p_start_date: "2026-09-01",
  });
  expectOk("record offer (moves stage to offer)", offer.error);
  check("offer row sent", offer.data?.status === "sent" && Number(offer.data?.rate_minor) === 8500,
    JSON.stringify({ s: offer.data?.status, r: offer.data?.rate_minor }));

  const hired = await owner.rpc("hire_candidate", { p_candidate_id: cand.id });
  expectOk("hire candidate", hired.error);
  const tasks = hired.data ?? [];
  check("onboarding checklist created", tasks.length >= 3, `tasks=${tasks.length}`);

  const { data: cAfter } = await owner.from("candidates").select("stage").eq("id", cand.id).single();
  check("candidate → hired", cAfter?.stage === "hired", `stage=${cAfter?.stage}`);
  const { data: oAfter } = await owner.from("offers").select("status").eq("candidate_id", cand.id).single();
  check("offer auto-accepted", oAfter?.status === "accepted", `status=${oAfter?.status}`);
  const { data: reqAfter } = await owner.from("requisitions").select("status").eq("id", req.id).single();
  check("requisition auto-filled at headcount", reqAfter?.status === "filled", `status=${reqAfter?.status}`);

  const again = await owner.rpc("hire_candidate", { p_candidate_id: cand.id });
  expectErr("double-hire blocked", again.error);
}

// --- reject requires comment; talent pool park + reactivate ------------------
{
  const c2 = await owner.from("candidates").insert({
    full_name: "V8 Pat Pool", skills: ["react"], source: "linkedin", owner_id: ownerId,
  }).select().single();
  await owner.rpc("candidate_action", { p_candidate_id: c2.data.id, p_action: "screen" });

  const rejNo = await owner.rpc("candidate_action", { p_candidate_id: c2.data.id, p_action: "reject" });
  expectErr("reject without comment blocked", rejNo.error);

  const pool = await owner.rpc("candidate_action", { p_candidate_id: c2.data.id, p_action: "pool" });
  expectOk("park in talent pool", pool.error);
  check("stage → talent_pool", pool.data?.stage === "talent_pool", `stage=${pool.data?.stage}`);

  const re = await owner.rpc("candidate_action", { p_candidate_id: c2.data.id, p_action: "reactivate" });
  expectOk("reactivate from pool", re.error);
  check("reactivated to screening", re.data?.stage === "screening", `stage=${re.data?.stage}`);

  const rej = await owner.rpc("candidate_action", { p_candidate_id: c2.data.id, p_action: "reject", p_comment: "v8 validation cleanup" });
  expectOk("reject with comment", rej.error);
  check("rejection reason recorded", rej.data?.stage === "rejected", `stage=${rej.data?.stage}`);
}

summary("V8 Talent");
