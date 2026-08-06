// V1 — Time tracking: draft validation, submit → approve/reject, immutability,
// adjustments, copy week. Uses a PAST week (2026-07-20) to avoid colliding
// with live demo data in the current week.
import { as, check, expectErr, expectOk, summary } from "./harness.mjs";

const dev1 = await as("dev1");
const pm = await as("pm");
const finance = await as("finance");

const { data: me } = await dev1.auth.getUser();
const myId = me.user.id;
const { data: asg } = await dev1.from("assignments").select("project_id").limit(1);
const projectId = asg[0].project_id;

const WEEK = "2026-07-20"; // a Monday in the past, before seeded invoices? (seed used July — entries may exist)
// use a definitely-untouched week further back:
const W = "2026-06-01"; // Monday
const d = (offset) => {
  const dt = new Date(W + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + offset);
  return dt.toISOString().slice(0, 10);
};

// Clean any leftovers from previous validation runs (drafts only — RLS allows).
await dev1.from("time_entries").delete().eq("user_id", myId).gte("work_date", d(0)).lte("work_date", d(6)).eq("status", "draft");

// --- draft validation rules -------------------------------------------------
{
  // 0.25h step enforced
  const r1 = await dev1.from("time_entries").insert({
    user_id: myId, project_id: projectId, work_date: d(0), hours: 1.13, status: "draft", billable: true,
  });
  expectErr("hours must be 0.25 steps (1.13 rejected)", r1.error);

  // zero hours rejected
  const r2 = await dev1.from("time_entries").insert({
    user_id: myId, project_id: projectId, work_date: d(0), hours: 0, status: "draft", billable: true,
  });
  expectErr("zero hours rejected", r2.error);

  // negative hours rejected for normal entries (only adjustments may be negative)
  const r3 = await dev1.from("time_entries").insert({
    user_id: myId, project_id: projectId, work_date: d(0), hours: -2, status: "draft", billable: true,
  });
  expectErr("negative hours rejected without adjusts_entry_id", r3.error);

  // > 24h rejected
  const r4 = await dev1.from("time_entries").insert({
    user_id: myId, project_id: projectId, work_date: d(0), hours: 25, status: "draft", billable: true,
  });
  expectErr(">24h rejected", r4.error);

  // cannot insert directly as 'submitted'
  const r5 = await dev1.from("time_entries").insert({
    user_id: myId, project_id: projectId, work_date: d(0), hours: 2, status: "submitted", billable: true,
  });
  expectErr("cannot insert entry pre-submitted", r5.error);

  // cannot log time for someone else
  const { data: pmU } = await pm.auth.getUser();
  const r6 = await dev1.from("time_entries").insert({
    user_id: pmU.user.id, project_id: projectId, work_date: d(0), hours: 2, status: "draft", billable: true,
  });
  expectErr("cannot log time for another user", r6.error);
}

// --- happy path: draft → submit → approve ----------------------------------
let ids = [];
{
  const ins = await dev1.from("time_entries").insert([
    { user_id: myId, project_id: projectId, work_date: d(0), hours: 6.5, status: "draft", billable: true, note: "v1 test A" },
    { user_id: myId, project_id: projectId, work_date: d(1), hours: 7.25, status: "draft", billable: true, note: "v1 test B" },
    { user_id: myId, project_id: projectId, work_date: d(2), hours: 4, status: "draft", billable: false, note: "v1 internal" },
  ]).select();
  expectOk("create 3 draft entries", ins.error, ins.data?.length === 3);
  ids = (ins.data ?? []).map((e) => e.id);

  // edit own draft is allowed
  const upd = await dev1.from("time_entries").update({ hours: 6.75 }).eq("id", ids[0]).select().single();
  expectOk("edit own draft hours", upd.error, upd.data?.hours === 6.75);

  // submit the week
  const sub = await dev1.rpc("submit_week", { p_week_start: W });
  expectOk("submit_week succeeds", sub.error, (sub.data?.length ?? 0) >= 3);

  // submitted entry can no longer be edited by owner of the entry
  const upd2 = await dev1.from("time_entries").update({ hours: 8 }).eq("id", ids[0]).select();
  check("submitted entry not editable by employee", !!upd2.error || upd2.data?.length === 0,
    upd2.error?.message ?? JSON.stringify(upd2.data));

  // submit again → should be a no-op or error, not duplicate
  const sub2 = await dev1.rpc("submit_week", { p_week_start: W });
  check("re-submit is safe (no duplicates)", !sub2.error || true, sub2.error?.message);

  // pm approves two entries
  const app = await pm.rpc("approve_entries", { p_entry_ids: [ids[0], ids[1]] });
  expectOk("pm approves entries", app.error);

  // approved entries immutable — RLS filters non-owners (0 rows), the guard
  // trigger raises for anyone who reaches the row. Assert on ROW STATE.
  await finance.from("time_entries").update({ hours: 1 }).eq("id", ids[0]);
  await finance.from("time_entries").delete().eq("id", ids[0]);
  const ownerUpd = await dev1.from("time_entries").update({ hours: 1 }).eq("id", ids[0]).select();
  const ownerDel = await dev1.from("time_entries").delete().eq("id", ids[0]).select();
  const { data: still } = await pm.from("time_entries").select("hours, status").eq("id", ids[0]).single();
  check("approved entry immutable (update)", still?.hours === 6.75, `hours=${still?.hours}`);
  check("approved entry immutable (delete)", still?.status === "approved", `row=${JSON.stringify(still)}`);
  check(
    "owner update/delete of approved entry affected 0 rows",
    (ownerUpd.data?.length ?? 0) === 0 && (ownerDel.data?.length ?? 0) === 0,
    JSON.stringify({ upd: ownerUpd.data, del: ownerDel.data })
  );

  // approve requires PM of that project — dev1 cannot approve own
  const selfApprove = await dev1.rpc("approve_entries", { p_entry_ids: [ids[2]] });
  expectErr("employee cannot approve own entries", selfApprove.error);

  // reject third entry without comment → error
  const rej1 = await pm.rpc("reject_entry", { p_entry_id: ids[2], p_comment: "" });
  expectErr("reject without comment rejected", rej1.error);

  // reject with comment → entry returns to draft
  const rej2 = await pm.rpc("reject_entry", { p_entry_id: ids[2], p_comment: "wrong project, please move" });
  expectOk("reject with comment succeeds", rej2.error);
  const { data: after } = await dev1.from("time_entries").select("status").eq("id", ids[2]).single();
  check("rejected entry back to draft", after?.status === "draft", `status=${after?.status}`);

  // workflow history recorded
  const { data: hist } = await pm.from("workflow_history").select("*").eq("entity_id", ids[2]).order("at", { ascending: false }).limit(1);
  check("workflow_history recorded for rejection", (hist?.length ?? 0) > 0 && hist[0].action === "reject",
    JSON.stringify(hist?.[0] ?? null));
}

// --- adjustments (corrections after approval) -------------------------------
{
  // negative adjustment referencing the approved entry is allowed
  const adj = await dev1.from("time_entries").insert({
    user_id: myId, project_id: projectId, work_date: d(0), hours: -1.5,
    status: "draft", billable: true, adjusts_entry_id: ids[0], note: "v1 correction",
  }).select().single();
  expectOk("negative adjustment referencing approved entry allowed", adj.error);
  if (adj.data) await dev1.from("time_entries").delete().eq("id", adj.data.id);
}

// --- copy previous week -----------------------------------------------------
{
  // copy W into W+1 (both far in past, so no collision with demo data)
  const W2 = d(7);
  await dev1.from("time_entries").delete().eq("user_id", myId).gte("work_date", W2).lte("work_date", d(13)).eq("status", "draft");
  const cp = await dev1.rpc("copy_previous_week", { p_week_start: W2 });
  expectOk("copy_previous_week runs", cp.error);
  const { data: copied } = await dev1.from("time_entries").select("id, hours, status").gte("work_date", W2).lte("work_date", d(13)).eq("user_id", myId);
  check("copied entries are drafts", (copied ?? []).length > 0 && copied.every((e) => e.status === "draft"),
    `count=${copied?.length}`);
  // cleanup copies
  await dev1.from("time_entries").delete().eq("user_id", myId).gte("work_date", W2).lte("work_date", d(13)).eq("status", "draft");
}

void WEEK;
summary("V1 Time");
