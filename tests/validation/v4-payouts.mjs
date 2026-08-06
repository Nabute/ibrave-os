// V4 — Payouts & margin: statement generation (no double-pay), FSM
// confirm/paid, employee visibility, reconciliation view, margin math,
// balanced double-entry accounting export.
import { as, check, expectErr, expectOk, summary } from "./harness.mjs";

const dev1 = await as("dev1");
const finance = await as("finance");

const { data: meD } = await dev1.auth.getUser();
const dev1Id = meD.user.id;

// May 2026: only the v3 test entries exist for dev1 (4 × 0.25h @ $60/h cost).
const P_START = "2026-05-01";
const P_END = "2026-05-31";

// expected: sum of approved May hours for dev1 × 6000 minor
const { data: mayEntries } = await finance
  .from("time_entries").select("hours").eq("user_id", dev1Id).eq("status", "approved")
  .gte("work_date", P_START).lte("work_date", P_END);
const expectedHours = (mayEntries ?? []).reduce((s, e) => s + Number(e.hours), 0);
const expectedTotal = Math.round(expectedHours * 6000);
check("fixture: dev1 has approved May hours", expectedHours > 0, `hours=${expectedHours}`);

// --- generation --------------------------------------------------------------
let stmt;
{
  const notFinance = await dev1.rpc("generate_payout_statements", { p_period_start: P_START, p_period_end: P_END });
  expectErr("employee cannot generate payout statements", notFinance.error);

  const gen = await finance.rpc("generate_payout_statements", { p_period_start: P_START, p_period_end: P_END });
  expectOk("finance generates May statements", gen.error);
  stmt = (gen.data ?? []).find((s) => s.user_id === dev1Id);
  check("dev1 May statement total = hours × $60 cost", Number(stmt?.total_minor) === expectedTotal,
    `total=${stmt?.total_minor} expected=${expectedTotal}`);

  const gen2 = await finance.rpc("generate_payout_statements", { p_period_start: P_START, p_period_end: P_END });
  const dup = (gen2.data ?? []).find((s) => s.user_id === dev1Id && s.id !== stmt.id && Number(s.total_minor) > 0);
  check("regenerate does not double-pay (entries already on a statement)", !dup, JSON.stringify(dup ?? null));
}

// --- visibility --------------------------------------------------------------
{
  const { data: mine } = await dev1.from("payout_statements").select("id, user_id").eq("id", stmt.id);
  check("dev1 sees own statement", mine?.length === 1, JSON.stringify(mine));
  const { data: all } = await dev1.from("payout_statements").select("user_id");
  check("dev1 sees ONLY own statements", (all ?? []).every((s) => s.user_id === dev1Id), `rows=${all?.length}`);
}

// --- FSM ---------------------------------------------------------------------
{
  const paid = await finance.rpc("mark_payout_paid", { p_statement_id: stmt.id });
  expectErr("mark_paid from draft blocked (must confirm first)", paid.error);

  const selfConfirm = await dev1.rpc("confirm_payout_statement", { p_statement_id: stmt.id });
  expectErr("employee cannot confirm own statement", selfConfirm.error);

  const conf = await finance.rpc("confirm_payout_statement", { p_statement_id: stmt.id });
  expectOk("finance confirms statement", conf.error);
  check("status → confirmed", conf.data?.status === "confirmed", `status=${conf.data?.status}`);

  const { data: notif } = await dev1.from("notifications").select("kind").eq("kind", "payout_confirmed").limit(1);
  check("dev1 notified of confirmation", (notif?.length ?? 0) > 0);

  const reconf = await finance.rpc("confirm_payout_statement", { p_statement_id: stmt.id });
  expectErr("double-confirm blocked", reconf.error);

  const paid2 = await finance.rpc("mark_payout_paid", { p_statement_id: stmt.id });
  expectOk("mark paid after confirm", paid2.error);
  check("status → paid", paid2.data?.status === "paid", `status=${paid2.data?.status}`);
}

// --- reconciliation view -----------------------------------------------------
{
  const { data: rec } = await finance.from("v_payout_reconciliation").select("*").eq("user_id", dev1Id);
  const may = (rec ?? []).find((r) => r.month === "2026-05-01");
  check("reconciliation: May approved hours match", Number(may?.approved_hours) === expectedHours, JSON.stringify(may));
  check("reconciliation: May fully paid out (unpaid = 0)", Number(may?.unpaid_hours) === 0, `unpaid=${may?.unpaid_hours}`);
  check("reconciliation: cost rate present", may?.missing_cost_rate === false);
}

// --- margin math -------------------------------------------------------------
{
  const { data: m } = await finance.from("v_margin_by_project").select("*");
  const vtstJune = (m ?? []).find((r) => r.project_name === "VTST Delivery" && r.month === "2026-06-01");
  // June: 4h@100 + 2h@120 invoiced = 64000 revenue; cost 6h × 6000 = 36000
  check("margin: VTST June revenue = 64000", Number(vtstJune?.revenue_minor) === 64000, `rev=${vtstJune?.revenue_minor}`);
  check("margin: VTST June cost = 36000", Number(vtstJune?.cost_minor) === 36000, `cost=${vtstJune?.cost_minor}`);
  check("margin: VTST June margin = 28000 (43.8%)",
    Number(vtstJune?.margin_minor) === 28000 && Math.abs(Number(vtstJune?.margin_pct) - 43.8) < 0.2,
    `margin=${vtstJune?.margin_minor} pct=${vtstJune?.margin_pct}`);
}

// --- accounting export balances ----------------------------------------------
{
  const { data: rows, error } = await finance.from("v_accounting_export").select("*")
    .gte("entry_date", "2026-01-01").lte("entry_date", "2026-12-31");
  expectOk("accounting export readable", error);
  const debit = (rows ?? []).reduce((s, r) => s + Number(r.debit_minor), 0);
  const credit = (rows ?? []).reduce((s, r) => s + Number(r.credit_minor), 0);
  check("double-entry export balances (debits = credits)", debit === credit, `D=${debit} C=${credit}`);
  const dev1Peek = await dev1.from("v_accounting_export").select("*").limit(1);
  check("employee cannot read accounting export", !!dev1Peek.error || (dev1Peek.data?.length ?? 0) === 0,
    dev1Peek.error?.message ?? JSON.stringify(dev1Peek.data));
}

summary("V4 Payouts & margin");
