// V9 — Command center (owner-only pulse + drill-down consistency), My Day,
// in-app calendar (attendee notifications, cancel), email identity gating,
// client digest, admin-users Edge Function gate.
import { as, check, expectErr, expectOk, summary } from "./harness.mjs";
import { readFileSync } from "fs";

const dev1 = await as("dev1");
const pm = await as("pm");
const finance = await as("finance");
const owner = await as("owner");
const { data: meD1 } = await dev1.auth.getUser();
const dev1Id = meD1.user.id;
const { data: mePm } = await pm.auth.getUser();
const pmId = mePm.user.id;

// --- command center ----------------------------------------------------------
{
  const denied = await dev1.rpc("command_center");
  expectErr("employee cannot open command center", denied.error);

  const cc = await owner.rpc("command_center");
  expectOk("owner opens command center", cc.error);
  const d = cc.data ?? {};
  check("pulse has money + delivery + growth sections",
    ["overdue_ar_minor", "unbilled_minor", "margin_mtd_minor", "utilization_pct",
     "open_requisitions", "unsubmitted_people", "collected_mtd_minor"]
      .every((k) => k in d),
    Object.keys(d).join(",").slice(0, 200));

  // drill-down guarantee: overdue AR tile equals the sum of overdue invoices
  const { data: overdue } = await finance.from("invoices")
    .select("total_minor, id").eq("status", "overdue").eq("kind", "invoice");
  let sum = 0;
  for (const inv of overdue ?? []) {
    const { data: pays } = await finance.from("payments").select("amount_minor").eq("invoice_id", inv.id);
    sum += Number(inv.total_minor) - (pays ?? []).reduce((s, p) => s + Number(p.amount_minor), 0);
  }
  check("overdue AR tile matches source invoices", Number(d.overdue_ar_minor) === sum,
    `tile=${d.overdue_ar_minor} source=${sum}`);

  const tsp = await owner.rpc("two_sided_pipeline", { p_months: 4 });
  expectOk("two-sided pipeline runs", tsp.error, Array.isArray(tsp.data) && tsp.data.length > 0);
}

// --- my day ------------------------------------------------------------------
{
  const md = await dev1.rpc("my_day");
  expectOk("employee my_day", md.error);
  const d = md.data ?? {};
  check("employee my_day has week summary", d.week_hours != null || d.timesheet != null || d.week != null,
    Object.keys(d).join(",").slice(0, 160));
  const mdPm = await pm.rpc("my_day");
  expectOk("pm my_day", mdPm.error);
  check("pm my_day includes approval queue count",
    JSON.stringify(mdPm.data ?? {}).includes("approval"), Object.keys(mdPm.data ?? {}).join(","));
}

// --- calendar ----------------------------------------------------------------
{
  const starts = new Date(); starts.setDate(starts.getDate() + 1); starts.setHours(10, 0, 0, 0);
  const ends = new Date(starts); ends.setHours(11);
  const ev = await pm.rpc("schedule_event", {
    p: {
      title: "V9 sync", description: "validation event", location: "meet",
      starts_at: starts.toISOString(), ends_at: ends.toISOString(),
      attendee_user_ids: [dev1Id],
    },
  });
  expectOk("pm schedules event with dev1", ev.error);
  const evId = ev.data?.id;

  const { data: mine } = await dev1.from("calendar_events").select("id, title").eq("id", evId);
  check("attendee sees the event", mine?.length === 1, JSON.stringify(mine));
  const { data: notif } = await dev1.from("notifications").select("kind, title").eq("kind", "calendar_invite").order("created_at", { ascending: false }).limit(1);
  check("attendee notified of invite", (notif?.length ?? 0) > 0 && notif[0].title.includes("V9") || (notif?.length ?? 0) > 0,
    JSON.stringify(notif));

  const cancelByStranger = await finance.rpc("cancel_event", { p_event_id: evId });
  expectErr("non-organizer cannot cancel", cancelByStranger.error);
  const cancel = await pm.rpc("cancel_event", { p_event_id: evId });
  expectOk("organizer cancels event", cancel.error);
  const { data: after } = await pm.from("calendar_events").select("status").eq("id", evId).maybeSingle();
  check("event cancelled/removed", !after || after.status === "cancelled", JSON.stringify(after));
}

// --- email identity gating ---------------------------------------------------
{
  // ensure a talent@ department identity restricted to recruiters exists
  let { data: ident } = await owner.from("email_identities").select("*").eq("email", "talent@ibrave.co").maybeSingle();
  if (!ident) {
    const ins = await owner.from("email_identities").insert({
      email: "talent@ibrave.co", display_name: "iBrave Talent", kind: "department",
      allowed_roles: ["recruiter"], active: true,
    }).select().single();
    expectOk("create talent@ department identity", ins.error);
    ident = ins.data;
  }

  const { data: d1Ids } = await dev1.rpc("my_email_identities");
  check("dev1 sees only own email", d1Ids?.length === 1 && d1Ids[0].email === "dev1@ibrave.dev",
    JSON.stringify(d1Ids));

  const { data: ownIds } = await owner.rpc("my_email_identities");
  check("owner sees own + department identities",
    (ownIds ?? []).some((i) => i.kind === "personal") && (ownIds ?? []).some((i) => i.email === "talent@ibrave.co"),
    JSON.stringify(ownIds?.map((i) => i.email)));

  const c1 = await owner.rpc("can_use_email_identity", { p_user_id: dev1Id, p_email: "talent@ibrave.co" });
  check("server denies dev1 sending as talent@", c1.data === false, `got=${c1.data}`);
  const c2 = await owner.rpc("can_use_email_identity", { p_user_id: dev1Id, p_email: "dev1@ibrave.dev" });
  check("server allows dev1 sending as self", c2.data === true, `got=${c2.data}`);
  const c3 = await owner.rpc("can_use_email_identity", { p_user_id: dev1Id, p_email: "noreply@evil.test" });
  check("server denies arbitrary From", c3.data === false, `got=${c3.data}`);
}

// --- client digest -----------------------------------------------------------
{
  const { data: cl } = await finance.from("clients").select("id").eq("code", "VTST").single();
  const dig = await finance.rpc("client_digest", { p_client_id: cl.id, p_month: "2026-06-01" });
  expectOk("client digest builds", dig.error);
  const j = JSON.stringify(dig.data ?? {});
  check("digest is the monthly hours appendix (rows + total)",
    (dig.data?.rows ?? []).length > 0 && Number(dig.data?.total_hours) > 0 && dig.data?.month === "June 2026",
    j.slice(0, 160));
}

// --- admin-users Edge Function gate -----------------------------------------
{
  const env = readFileSync("/Users/infratech/Documents/nabute/ibrave/products/ibrave_os/apps/outsourcing-platform/.env.local", "utf8");
  const URL = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim();
  const KEY = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim();
  const { data: sess } = await dev1.auth.getSession();
  const res = await fetch(`${URL}/functions/v1/admin-users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: KEY, Authorization: `Bearer ${sess.session.access_token}` },
    body: JSON.stringify({ action: "reset_password", user_id: pmId }),
  });
  check("edge fn: employee blocked from admin actions (403)", res.status === 403, `status=${res.status}`);

  const resNoAuth = await fetch(`${URL}/functions/v1/admin-users`, {
    method: "POST", headers: { "Content-Type": "application/json", apikey: KEY },
    body: JSON.stringify({ action: "reset_password", user_id: pmId }),
  });
  check("edge fn: anonymous blocked (401)", resNoAuth.status === 401, `status=${resNoAuth.status}`);
}

summary("V9 Command center & comms");
