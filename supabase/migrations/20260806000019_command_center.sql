-- ============================================================================
-- 0019 PHASE 9 — OWNER COMMAND CENTER (Module I)
-- Company pulse (live tiles, every number drill-down-able), engagement board,
-- two-sided pipeline (demand vs supply), configurable owner alerts.
-- Transparency runs top-down: the owner sees everything, audit-logged like
-- everyone else (I-7 — has_role already grants owner/admin every check).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Company pulse (I-1). One RPC, computed live from the same tables every
-- number in the app comes from — the drill-down guarantee (I-5) holds because
-- each tile's screen shows exactly these records.
-- ----------------------------------------------------------------------------
create or replace function public.command_center()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  month_start date := date_trunc('month', current_date)::date;
begin
  if not public.has_role('owner') then
    raise exception 'Owner role required' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'issued_mtd_minor', (
      select coalesce(sum(total_minor), 0) from public.invoices
      where kind = 'invoice'
        and status in ('issued', 'paid', 'partially_paid', 'overdue')
        and issued_at >= month_start),
    'collected_mtd_minor', (
      select coalesce(sum(amount_minor), 0) from public.payments
      where paid_at >= month_start),
    'margin_mtd_minor', (
      select coalesce(sum(margin_minor), 0) from public.v_margin_by_project
      where month = month_start),
    'overdue_ar_minor', (
      select coalesce(sum(outstanding_minor), 0) from public.v_invoice_aging
      where bucket <> 'current'),
    'unbilled_minor', (
      select coalesce(sum(value_minor), 0) from public.v_unbilled_work),
    'utilization_pct', (
      select round(100.0 * coalesce(sum(hours) filter (where billable), 0)
             / nullif(sum(hours), 0), 1)
      from public.time_entries
      where status = 'approved' and work_date >= month_start),
    'bench_cost_weekly_minor', (
      select coalesce(sum(
        round((100 - least(coalesce(alloc.pct, 0), 100)) / 100.0
              * p.weekly_capacity_hours
              * coalesce(public.resolve_cost_rate(p.id, current_date), 0))), 0)::bigint
      from public.profiles p
      left join lateral (
        select sum(a.allocation_pct) as pct from public.assignments a
        where a.user_id = p.id
          and a.start_date <= current_date
          and (a.end_date is null or a.end_date >= current_date)
      ) alloc on true
      where p.active),
    'weighted_pipeline_minor', (
      select coalesce(sum(weighted_value_minor), 0) from public.v_pipeline_report),
    'upsell_pipeline_minor', (
      select coalesce(sum(value_minor), 0) from public.opportunities
      where stage in ('idea', 'proposed')),
    'open_requisitions', (
      select count(*) from public.requisitions where status = 'open'),
    'candidates_in_pipeline', (
      select count(*) from public.candidates
      where stage in ('sourced', 'screening', 'interview', 'assessment', 'offer')),
    'red_accounts', (
      select count(*) from public.account_health where light = 'red'),
    'yellow_accounts', (
      select count(*) from public.account_health where light = 'yellow'),
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
            and te.work_date between date_trunc('week', current_date)::date - 7
                                 and date_trunc('week', current_date)::date - 1)),
    'open_escalations', (
      select count(*) from public.escalations where resolved_at is null)
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- Engagement board (I-3): every active project as a card, sortable by risk.
-- ----------------------------------------------------------------------------
create view public.v_engagement_board
with (security_invoker = true) as
select
  pr.id as project_id,
  pr.name as project_name,
  pr.billing_model,
  cl.id as client_id,
  cl.name as client_name,
  h.light as health,
  h.score as health_score,
  (select count(distinct a.user_id) from public.assignments a
   where a.project_id = pr.id
     and a.start_date <= current_date
     and (a.end_date is null or a.end_date >= current_date)) as team_size,
  b.approved_hours,
  b.burn_pct,
  pr.budget_hours,
  (select coalesce(sum(ag.outstanding_minor), 0) from public.v_invoice_aging ag
   where ag.client_id = cl.id and ag.bucket <> 'current') as overdue_ar_minor,
  (select min(ct.end_date) from public.contracts ct
   where ct.client_id = cl.id and ct.status = 'active'
     and ct.end_date >= current_date) as renewal_date,
  -- risk: red health > overdue AR > burn over 90% > renewal < 45d
  (case when h.light = 'red' then 40 when h.light = 'yellow' then 15 else 0 end)
  + (case when exists (select 1 from public.v_invoice_aging ag
                       where ag.client_id = cl.id and ag.bucket <> 'current') then 25 else 0 end)
  + (case when b.burn_pct is not null and b.burn_pct >= 90 then 20 else 0 end)
  + (case when exists (select 1 from public.contracts ct
                       where ct.client_id = cl.id and ct.status = 'active'
                         and ct.end_date between current_date and current_date + 45)
          then 15 else 0 end) as risk_score
from public.projects pr
join public.clients cl on cl.id = pr.client_id
left join public.account_health h on h.client_id = cl.id
left join public.v_project_burn b on b.project_id = pr.id
where pr.status = 'active';

-- ----------------------------------------------------------------------------
-- Two-sided pipeline (I-4): demand (weighted sold work in hours from quote
-- lines + open leads) vs supply (free capacity + hiring pipeline), by month.
-- "Sell harder or hire faster," answered with live data.
-- ----------------------------------------------------------------------------
create or replace function public.two_sided_pipeline(p_months int default 6)
returns table (
  month date,
  demand_hours numeric,          -- weighted lead demand (quote hours × probability)
  supply_free_hours numeric,     -- capacity − committed − time off
  hiring_hours numeric,          -- candidates at offer/hired × 160 h/mo from start month
  net_position numeric           -- supply + hiring − demand
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_role('owner') then
    raise exception 'Owner role required' using errcode = '42501';
  end if;

  return query
  with months as (
    select generate_series(
      date_trunc('month', current_date)::date,
      (date_trunc('month', current_date) + make_interval(months => p_months - 1))::date,
      interval '1 month')::date as m
  ),
  cap as (
    select cf.month as m, cf.free_hours from public.capacity_forecast(p_months) cf
  ),
  demand as (
    select date_trunc('month', l.expected_start)::date as m,
           sum(coalesce(ql.qty_hours, 0) * l.probability_pct / 100.0) as hours
    from public.leads l
    join public.quotes q on q.lead_id = l.id and q.status in ('draft', 'sent', 'accepted')
    join public.quote_lines ql on ql.quote_id = q.id
    where l.stage in ('lead', 'qualified', 'proposal_sent', 'negotiation')
      and l.expected_start is not null
    group by 1
  ),
  hiring as (
    select date_trunc('month', coalesce(c.available_from, current_date + 30))::date as m,
           count(*) * 160.0 as hours
    from public.candidates c
    where c.stage in ('offer', 'hired')
      and coalesce(c.available_from, current_date + 30) >= date_trunc('month', current_date)
    group by 1
  )
  select
    months.m,
    round(coalesce(d.hours, 0), 0),
    round(coalesce(cap.free_hours, 0), 0),
    round(coalesce(h.hours, 0), 0),
    round(coalesce(cap.free_hours, 0) + coalesce(h.hours, 0) - coalesce(d.hours, 0), 0)
  from months
  left join cap on cap.m = months.m
  left join demand d on d.m = months.m
  left join hiring h on h.m = months.m
  order by months.m;
end;
$$;

-- ----------------------------------------------------------------------------
-- Owner alerts (I-6): configurable thresholds, evaluated daily. Deliberately
-- simple: metric → comparator → threshold → in-app notification to owners.
-- ----------------------------------------------------------------------------
create table public.owner_alert_rules (
  id         uuid primary key default gen_random_uuid(),
  metric     text not null check (metric in (
               'overdue_ar_minor', 'red_accounts', 'unsubmitted_people',
               'bench_cost_weekly_minor', 'weighted_pipeline_minor',
               'open_escalations')),
  comparator text not null check (comparator in ('gt', 'lt')),
  threshold  bigint not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.owner_alert_rules enable row level security;

create policy owner_alert_rules_owner on public.owner_alert_rules
  for all using (public.has_role('owner')) with check (public.has_role('owner'));

insert into public.owner_alert_rules (metric, comparator, threshold) values
  ('overdue_ar_minor', 'gt', 1000000),        -- overdue AR > $10,000
  ('red_accounts', 'gt', 0),                  -- any red account
  ('unsubmitted_people', 'gt', 2),            -- timesheet discipline slipping
  ('weighted_pipeline_minor', 'lt', 2000000); -- pipeline below $20,000

create or replace function public.job_owner_alerts()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_key text := 'day:' || current_date;
  n int := 0;
  rule record;
  metric_value bigint;
  crossed boolean;
  owner_rec record;
  pretty text;
begin
  begin
    insert into public.automation_runs (job, run_key) values ('owner_alerts', v_run_key);
  exception when unique_violation then
    return 0;
  end;

  for rule in select * from public.owner_alert_rules where active
  loop
    metric_value := case rule.metric
      when 'overdue_ar_minor' then
        (select coalesce(sum(outstanding_minor), 0) from public.v_invoice_aging
         where bucket <> 'current')
      when 'red_accounts' then
        (select count(*) from public.account_health where light = 'red')
      when 'unsubmitted_people' then
        (select count(distinct p.id) from public.profiles p
         where p.active
           and exists (select 1 from public.assignments a
                       where a.user_id = p.id and a.start_date <= current_date
                         and (a.end_date is null or a.end_date >= current_date))
           and not exists (
             select 1 from public.time_entries te
             where te.user_id = p.id and te.status in ('submitted', 'approved')
               and te.work_date between date_trunc('week', current_date)::date - 7
                                    and date_trunc('week', current_date)::date - 1))
      when 'bench_cost_weekly_minor' then
        (select coalesce(sum(
           round((100 - least(coalesce(al.pct, 0), 100)) / 100.0
                 * p.weekly_capacity_hours
                 * coalesce(public.resolve_cost_rate(p.id, current_date), 0))), 0)::bigint
         from public.profiles p
         left join lateral (
           select sum(a.allocation_pct) as pct from public.assignments a
           where a.user_id = p.id and a.start_date <= current_date
             and (a.end_date is null or a.end_date >= current_date)) al on true
         where p.active)
      when 'weighted_pipeline_minor' then
        (select coalesce(sum(weighted_value_minor), 0) from public.v_pipeline_report)
      when 'open_escalations' then
        (select count(*) from public.escalations where resolved_at is null)
    end;

    crossed := (rule.comparator = 'gt' and metric_value > rule.threshold)
            or (rule.comparator = 'lt' and metric_value < rule.threshold);

    if crossed then
      pretty := replace(rule.metric, '_', ' ');
      for owner_rec in
        select distinct user_id from public.user_roles where role = 'owner'
      loop
        perform public.notify_user(owner_rec.user_id, 'owner_alert',
          'Alert: ' || pretty,
          pretty || ' is ' || metric_value || ' ('
            || (case rule.comparator when 'gt' then 'above' else 'below' end)
            || ' your threshold of ' || rule.threshold || ')',
          '/command-center');
        n := n + 1;
      end loop;
    end if;
  end loop;

  update public.automation_runs ar
  set detail = jsonb_build_object('alerts_sent', n)
  where ar.job = 'owner_alerts' and ar.run_key = v_run_key;
  return n;
end;
$$;

select cron.schedule('owner-alerts', '0 7 * * *', $$select public.job_owner_alerts()$$);
