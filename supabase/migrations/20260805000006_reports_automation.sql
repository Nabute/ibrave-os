-- ============================================================================
-- 0006 REPORTS, MY DAY, AUTOMATION JOBS, REALTIME
-- Views are security_invoker so table RLS keeps applying per caller.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Approvals queue: submitted entries with display context. PM scoping comes
-- from time_entries RLS (security_invoker).
-- ----------------------------------------------------------------------------
create view public.v_approval_queue
with (security_invoker = true) as
select
  te.id,
  te.user_id,
  pf.full_name,
  te.project_id,
  pr.name  as project_name,
  pr.pm_id,
  te.task_id,
  t.name   as task_name,
  te.work_date,
  date_trunc('week', te.work_date)::date as week_start,
  te.hours,
  te.note,
  te.billable,
  te.status,
  te.created_at
from public.time_entries te
join public.profiles pf on pf.id = te.user_id
join public.projects pr on pr.id = te.project_id
left join public.tasks t on t.id = te.task_id
where te.status = 'submitted';

-- ----------------------------------------------------------------------------
-- Unbilled work (FR-22): approved, billable, un-invoiced T&M hours with value.
-- ----------------------------------------------------------------------------
create view public.v_unbilled_work
with (security_invoker = true) as
select
  cl.id   as client_id,
  cl.name as client_name,
  cl.currency,
  pr.id   as project_id,
  pr.name as project_name,
  min(te.work_date) as oldest_entry,
  sum(te.hours)     as hours,
  sum(round(te.hours * coalesce(public.resolve_rate(te.user_id, te.project_id, te.work_date), 0)))::bigint
    as value_minor
from public.time_entries te
join public.projects pr on pr.id = te.project_id
join public.clients cl on cl.id = pr.client_id
where te.status = 'approved'
  and te.billable
  and te.invoice_id is null
  and pr.billing_model = 'tm'
group by cl.id, cl.name, cl.currency, pr.id, pr.name;

-- ----------------------------------------------------------------------------
-- Invoice aging (FR-23)
-- ----------------------------------------------------------------------------
create view public.v_invoice_aging
with (security_invoker = true) as
select
  i.id, i.number, i.client_id, cl.name as client_name, i.currency,
  i.total_minor,
  i.total_minor - coalesce(p.paid_minor, 0) as outstanding_minor,
  i.issued_at, i.due_date, i.status,
  greatest(0, current_date - i.due_date) as days_overdue,
  case
    when current_date - i.due_date <= 0  then 'current'
    when current_date - i.due_date <= 30 then '0-30'
    when current_date - i.due_date <= 60 then '31-60'
    when current_date - i.due_date <= 90 then '61-90'
    else '90+'
  end as bucket
from public.invoices i
join public.clients cl on cl.id = i.client_id
left join lateral (
  select sum(amount_minor) as paid_minor
  from public.payments where invoice_id = i.id
) p on true
where i.kind = 'invoice'
  and i.status in ('issued', 'partially_paid', 'overdue');

-- ----------------------------------------------------------------------------
-- Utilization (FR-20): billable vs total hours per person per month
-- ----------------------------------------------------------------------------
create view public.v_utilization
with (security_invoker = true) as
select
  te.user_id,
  pf.full_name,
  date_trunc('month', te.work_date)::date as month,
  sum(te.hours) filter (where te.billable) as billable_hours,
  sum(te.hours) as total_hours,
  round(100.0 * sum(te.hours) filter (where te.billable) / nullif(sum(te.hours), 0), 1)
    as billable_pct
from public.time_entries te
join public.profiles pf on pf.id = te.user_id
where te.status = 'approved'
group by te.user_id, pf.full_name, 3;

-- ----------------------------------------------------------------------------
-- Project burn (FR-21, C-2)
-- ----------------------------------------------------------------------------
create view public.v_project_burn
with (security_invoker = true) as
select
  pr.id as project_id,
  pr.name as project_name,
  pr.client_id,
  cl.name as client_name,
  pr.budget_hours,
  pr.retainer_included_hours,
  coalesce(sum(te.hours) filter (where te.status = 'approved'), 0) as approved_hours,
  coalesce(sum(te.hours), 0) as logged_hours,
  case
    when pr.budget_hours is not null and pr.budget_hours > 0
    then round(100.0 * coalesce(sum(te.hours), 0) / pr.budget_hours, 1)
  end as burn_pct
from public.projects pr
join public.clients cl on cl.id = pr.client_id
left join public.time_entries te on te.project_id = pr.id
group by pr.id, pr.name, pr.client_id, cl.name, pr.budget_hours, pr.retainer_included_hours;

-- ----------------------------------------------------------------------------
-- My Day (Module I): one RPC returning the caller's action cards per role.
-- Every card is an action or a decision; empty = done for the day.
-- ----------------------------------------------------------------------------
create or replace function public.my_day()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  week_start date := date_trunc('week', current_date)::date;
  result jsonb := '{}'::jsonb;
begin
  -- Employee card: this week's timesheet status
  result := result || jsonb_build_object('timesheet', (
    select jsonb_build_object(
      'week_start', week_start,
      'draft_hours',     coalesce(sum(hours) filter (where status = 'draft'), 0),
      'submitted_hours', coalesce(sum(hours) filter (where status = 'submitted'), 0),
      'approved_hours',  coalesce(sum(hours) filter (where status = 'approved'), 0),
      'rejected_count',  count(*) filter (where status = 'draft' and rejection_comment is not null)
    )
    from public.time_entries
    where user_id = uid and work_date between week_start and week_start + 6
  ));

  -- PM card: pending approvals on my projects
  if public.has_role('pm') then
    result := result || jsonb_build_object('approvals', (
      select jsonb_build_object(
        'pending_count', count(*),
        'people', count(distinct te.user_id),
        'oldest_submission', min(te.created_at)
      )
      from public.time_entries te
      join public.projects pr on pr.id = te.project_id
      where te.status = 'submitted'
        and (pr.pm_id = uid or public.has_exact_role('admin') or public.has_exact_role('owner'))
    ));
  end if;

  -- Finance card: drafts to issue, overdue AR, unbilled value
  if public.has_role('finance') then
    result := result || jsonb_build_object('finance', jsonb_build_object(
      'draft_invoices', (select count(*) from public.invoices
                         where status = 'draft' and kind = 'invoice'),
      'overdue_invoices', (select count(*) from public.invoices
                           where status = 'overdue'),
      'overdue_minor', (select coalesce(sum(outstanding_minor), 0)
                        from public.v_invoice_aging where bucket <> 'current'),
      'unbilled_minor', (select coalesce(sum(value_minor), 0) from public.v_unbilled_work)
    ));
  end if;

  -- Owner pulse tiles (grows per phase)
  if public.has_role('owner') then
    result := result || jsonb_build_object('pulse', jsonb_build_object(
      'unsubmitted_people', (
        select count(distinct p.id)
        from public.profiles p
        where p.active
          and exists (select 1 from public.assignments a
                      where a.user_id = p.id
                        and a.start_date <= current_date
                        and (a.end_date is null or a.end_date >= current_date))
          and not exists (
            select 1 from public.time_entries te
            where te.user_id = p.id
              and te.status in ('submitted', 'approved')
              and te.work_date between week_start - 7 and week_start - 1)
      ),
      'issued_this_month_minor', (
        select coalesce(sum(total_minor), 0) from public.invoices
        where kind = 'invoice'
          and status in ('issued', 'paid', 'partially_paid', 'overdue')
          and issued_at >= date_trunc('month', now())),
      'collected_this_month_minor', (
        select coalesce(sum(amount_minor), 0) from public.payments
        where paid_at >= date_trunc('month', now())::date)
    ));
  end if;

  return result;
end;
$$;

-- ----------------------------------------------------------------------------
-- Automation jobs (Module F): SQL-side jobs write in-app notifications and log
-- to automation_runs; the email leg is handled by Edge Functions. Idempotent
-- via the (job, run_key) unique constraint.
-- ----------------------------------------------------------------------------

-- Remind people with unsubmitted hours for last week (runs Monday morning).
create or replace function public.job_timesheet_reminders()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  last_week date := date_trunc('week', current_date)::date - 7;
  run_key text := 'week:' || last_week;
  n int := 0;
  person record;
begin
  begin
    insert into public.automation_runs (job, run_key) values ('timesheet_reminders', run_key);
  exception when unique_violation then
    return 0;  -- already ran for this week
  end;

  for person in
    select p.id, p.full_name
    from public.profiles p
    where p.active
      and exists (select 1 from public.assignments a
                  where a.user_id = p.id
                    and a.start_date <= last_week + 6
                    and (a.end_date is null or a.end_date >= last_week))
      and exists (select 1 from public.time_entries te
                  where te.user_id = p.id and te.status = 'draft'
                    and te.work_date between last_week and last_week + 6)
  loop
    perform public.notify_user(person.id, 'timesheet_reminder',
      'Unsubmitted timesheet',
      'You have draft hours for the week of ' || last_week || ' — submit them for approval.',
      '/timesheet');
    n := n + 1;
  end loop;

  update public.automation_runs
  set detail = jsonb_build_object('reminded', n)
  where job = 'timesheet_reminders' and run_key = job_timesheet_reminders.run_key;
  return n;
end;
$$;

-- Nudge PMs with submissions older than N days.
create or replace function public.job_approval_nudges()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  nudge_days int;
  run_key text := 'day:' || current_date;
  n int := 0;
  pm record;
begin
  select approval_nudge_days into nudge_days from public.company_settings;

  begin
    insert into public.automation_runs (job, run_key) values ('approval_nudges', run_key);
  exception when unique_violation then
    return 0;
  end;

  for pm in
    select pr.pm_id, count(*) as pending
    from public.time_entries te
    join public.projects pr on pr.id = te.project_id
    where te.status = 'submitted'
      and te.updated_at < now() - make_interval(days => nudge_days)
      and pr.pm_id is not null
    group by pr.pm_id
  loop
    perform public.notify_user(pm.pm_id, 'approval_nudge',
      'Approvals waiting',
      pm.pending || ' submitted entries have been waiting more than '
        || nudge_days || ' days.',
      '/approvals');
    n := n + 1;
  end loop;

  update public.automation_runs
  set detail = jsonb_build_object('nudged', n)
  where job = 'approval_nudges' and run_key = job_approval_nudges.run_key;
  return n;
end;
$$;

-- Dunning scan (D-3): flip overdue, notify finance per bucket threshold.
-- Email escalation itself is the dunning Edge Function's job.
create or replace function public.job_dunning_scan()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  run_key text := 'day:' || current_date;
  flipped int;
  fin record;
  inv record;
begin
  begin
    insert into public.automation_runs (job, run_key) values ('dunning_scan', run_key);
  exception when unique_violation then
    return 0;
  end;

  flipped := public.mark_overdue_invoices();

  for inv in
    select i.id, i.number, i.due_date, cl.name as client_name
    from public.invoices i
    join public.clients cl on cl.id = i.client_id
    where i.status = 'overdue' and not i.dunning_paused
      and (current_date - i.due_date) in (7, 14, 30)
  loop
    for fin in
      select distinct user_id from public.user_roles where role in ('finance', 'owner')
    loop
      perform public.notify_user(fin.user_id, 'invoice_overdue',
        'Invoice ' || inv.number || ' overdue',
        inv.client_name || ' — ' || (current_date - inv.due_date) || ' days past due.',
        '/invoices/' || inv.id);
    end loop;
  end loop;

  update public.automation_runs
  set detail = jsonb_build_object('flipped_overdue', flipped)
  where job = 'dunning_scan' and run_key = job_dunning_scan.run_key;
  return flipped;
end;
$$;

-- Schedules (company-timezone mornings are approximated in UTC).
select cron.schedule('timesheet-reminders', '0 6 * * 1', $$select public.job_timesheet_reminders()$$);
select cron.schedule('approval-nudges',     '0 6 * * *', $$select public.job_approval_nudges()$$);
select cron.schedule('dunning-scan',        '0 5 * * *', $$select public.job_dunning_scan()$$);

-- ----------------------------------------------------------------------------
-- Realtime: live notifications + activity feed
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.activity_feed;
