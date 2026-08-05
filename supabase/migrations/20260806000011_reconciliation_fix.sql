-- ============================================================================
-- 0011 FIX v_payout_reconciliation: paid-out hours were multiplied by the
-- number of entries in each payout line (line total summed per joined entry).
-- Sum the entries' own hours instead.
-- ============================================================================

create or replace view public.v_payout_reconciliation
with (security_invoker = true) as
with approved as (
  select
    te.user_id,
    date_trunc('month', te.work_date)::date as month,
    sum(te.hours) as approved_hours,
    sum(te.hours) filter (where te.invoice_id is not null) as billed_hours
  from public.time_entries te
  where te.status = 'approved'
  group by te.user_id, 2
),
paid as (
  select
    te.user_id,
    date_trunc('month', te.work_date)::date as month,
    sum(te.hours) as paid_hours
  from public.payout_line_entries ple
  join public.time_entries te on te.id = ple.time_entry_id
  group by te.user_id, 2
)
select
  pf.id as user_id,
  pf.full_name,
  a.month,
  a.approved_hours,
  a.billed_hours,
  coalesce(p.paid_hours, 0) as paid_out_hours,
  a.approved_hours - coalesce(p.paid_hours, 0) as unpaid_hours,
  (public.resolve_cost_rate(pf.id, current_date) is null) as missing_cost_rate
from approved a
join public.profiles pf on pf.id = a.user_id
left join paid p on p.user_id = a.user_id and p.month = a.month;
