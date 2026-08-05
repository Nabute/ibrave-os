-- ============================================================================
-- 0010 PHASE 3 — PAYOUTS & MARGIN (Module E)
-- Cost rates (versioned, privacy-tiered), contractor payout statements
-- (draft → confirmed → paid, FSM transitions seeded in 0002), reconciliation
-- guard, and margin reporting. Payouts are computed from the same approved
-- hours the invoices bill from — that's what makes margin exact.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Cost rates (E-1). Visible to finance/owner/admin only (H-11 privacy tier).
-- ----------------------------------------------------------------------------
create table public.cost_rates (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles (id),
  effective_from     date not null,
  hourly_cost_minor  bigint check (hourly_cost_minor >= 0),
  monthly_cost_minor bigint check (monthly_cost_minor >= 0),
  currency           char(3) not null default 'USD',
  note               text,
  created_at         timestamptz not null default now(),
  check (num_nonnulls(hourly_cost_minor, monthly_cost_minor) = 1),
  unique (user_id, effective_from)
);

create index cost_rates_user_idx on public.cost_rates (user_id, effective_from desc);

alter table public.cost_rates enable row level security;

create policy cost_rates_finance_all on public.cost_rates
  for all using (public.has_role('finance')) with check (public.has_role('finance'));

create trigger cost_rates_audit
  after insert or update or delete on public.cost_rates
  for each row execute function public.tg_rate_card_audit();

-- Hourly cost for (person, date): latest effective rate; monthly costs are
-- derived hourly (monthly ÷ (weekly capacity × 52 / 12)).
create or replace function public.resolve_cost_rate(p_user_id uuid, p_work_date date)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r public.cost_rates%rowtype;
  capacity numeric;
begin
  select * into r
  from public.cost_rates
  where user_id = p_user_id and effective_from <= p_work_date
  order by effective_from desc
  limit 1;

  if not found then
    return null;
  end if;
  if r.hourly_cost_minor is not null then
    return r.hourly_cost_minor;
  end if;

  select weekly_capacity_hours into capacity from public.profiles where id = p_user_id;
  if capacity is null or capacity = 0 then
    return null;
  end if;
  return round(r.monthly_cost_minor / (capacity * 52.0 / 12.0));
end;
$$;

-- ----------------------------------------------------------------------------
-- Payout statements (E-2): draft → confirmed → paid.
-- ----------------------------------------------------------------------------
create table public.payout_statements (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id),
  period_start date not null,
  period_end   date not null,
  currency     char(3) not null default 'USD',
  status       text not null default 'draft'
               check (status in ('draft', 'confirmed', 'paid')),
  total_minor  bigint not null default 0,
  confirmed_by uuid references public.profiles (id),
  confirmed_at timestamptz,
  paid_at      timestamptz,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (period_end >= period_start)
);

create index payout_statements_user_idx on public.payout_statements (user_id, period_start desc);
create index payout_statements_status_idx on public.payout_statements (status);

create trigger set_updated_at before update on public.payout_statements
  for each row execute function public.tg_set_updated_at();

create table public.payout_lines (
  id           uuid primary key default gen_random_uuid(),
  statement_id uuid not null references public.payout_statements (id) on delete cascade,
  project_id   uuid not null references public.projects (id),
  hours        numeric(9, 2) not null,
  rate_minor   bigint not null,
  amount_minor bigint not null
);

create index payout_lines_statement_idx on public.payout_lines (statement_id);

-- Same traceability pattern as invoices: line → the entries that produced it.
create table public.payout_line_entries (
  payout_line_id uuid not null references public.payout_lines (id) on delete cascade,
  time_entry_id  uuid not null references public.time_entries (id),
  primary key (payout_line_id, time_entry_id)
);

create index payout_line_entries_entry_idx on public.payout_line_entries (time_entry_id);

-- Guards: confirmed/paid statements are frozen except via RPC; drafts can be
-- regenerated (delete + recreate) by finance.
create or replace function public.tg_payout_statements_guard()
returns trigger
language plpgsql
as $$
declare
  via_rpc boolean := coalesce(current_setting('app.via_rpc', true), '') = 'on';
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Only draft statements can be deleted';
    end if;
    return old;
  end if;
  if old.status <> 'draft' and not via_rpc then
    raise exception 'Confirmed statements are immutable';
  end if;
  if new.status is distinct from old.status and not via_rpc then
    raise exception 'Statement status changes only through workflow actions';
  end if;
  return new;
end;
$$;

create trigger payout_statements_guard
  before update or delete on public.payout_statements
  for each row execute function public.tg_payout_statements_guard();

alter table public.payout_statements enable row level security;
alter table public.payout_lines enable row level security;
alter table public.payout_line_entries enable row level security;

-- Finance manages; people see their own statements (E-2).
create policy payout_statements_finance_all on public.payout_statements
  for all using (public.has_role('finance')) with check (public.has_role('finance'));
create policy payout_statements_own_read on public.payout_statements
  for select using (user_id = auth.uid());
create policy payout_lines_read on public.payout_lines
  for select using (
    public.has_role('finance')
    or exists (select 1 from public.payout_statements s
               where s.id = statement_id and s.user_id = auth.uid())
  );
create policy payout_lines_finance_write on public.payout_lines
  for all using (public.has_role('finance')) with check (public.has_role('finance'));
create policy payout_line_entries_read on public.payout_line_entries
  for select using (public.has_role('finance'));

-- ----------------------------------------------------------------------------
-- Generate draft statements for a period: one per person with approved hours
-- not yet on a live statement. People without a cost rate are skipped and
-- reported in the result's note.
-- ----------------------------------------------------------------------------
create or replace function public.generate_payout_statements(
  p_period_start date, p_period_end date
)
returns setof public.payout_statements
language plpgsql
security definer
set search_path = public
as $$
declare
  person record;
  grp record;
  st public.payout_statements%rowtype;
  line_id uuid;
begin
  if not public.has_role('finance') then
    raise exception 'Finance role required' using errcode = '42501';
  end if;

  perform set_config('app.via_rpc', 'on', true);

  for person in
    select distinct te.user_id
    from public.time_entries te
    where te.status = 'approved'
      and te.work_date between p_period_start and p_period_end
      and not exists (
        select 1
        from public.payout_line_entries ple
        join public.payout_lines pl on pl.id = ple.payout_line_id
        where ple.time_entry_id = te.id
      )
  loop
    if public.resolve_cost_rate(person.user_id, p_period_end) is null then
      continue;  -- no cost rate configured; surfaced by v_payout_reconciliation
    end if;

    insert into public.payout_statements (user_id, period_start, period_end, currency)
    values (person.user_id, p_period_start, p_period_end,
            (select currency from public.cost_rates
             where user_id = person.user_id order by effective_from desc limit 1))
    returning * into st;

    for grp in
      select te.project_id,
             public.resolve_cost_rate(te.user_id, te.work_date) as rate_minor,
             sum(te.hours) as total_hours,
             array_agg(te.id) as entry_ids
      from public.time_entries te
      where te.user_id = person.user_id
        and te.status = 'approved'
        and te.work_date between p_period_start and p_period_end
        and not exists (
          select 1
          from public.payout_line_entries ple
          join public.payout_lines pl on pl.id = ple.payout_line_id
          where ple.time_entry_id = te.id
        )
      group by te.project_id, 2
    loop
      insert into public.payout_lines (statement_id, project_id, hours, rate_minor, amount_minor)
      values (st.id, grp.project_id, grp.total_hours, grp.rate_minor,
              round(grp.total_hours * grp.rate_minor))
      returning id into line_id;

      insert into public.payout_line_entries (payout_line_id, time_entry_id)
      select line_id, unnest(grp.entry_ids);
    end loop;

    update public.payout_statements
    set total_minor = (select coalesce(sum(amount_minor), 0)
                       from public.payout_lines where statement_id = st.id)
    where id = st.id;

    perform public.write_audit('payout_statement.generate', 'payout_statement',
      st.id::text, jsonb_build_object('user_id', person.user_id,
                                      'period_start', p_period_start,
                                      'period_end', p_period_end));

    select * into st from public.payout_statements where id = st.id;
    return next st;
  end loop;
end;
$$;

create or replace function public.confirm_payout_statement(p_statement_id uuid)
returns public.payout_statements
language plpgsql
security definer
set search_path = public
as $$
declare
  st public.payout_statements%rowtype;
begin
  perform set_config('app.via_rpc', 'on', true);
  select * into st from public.payout_statements where id = p_statement_id for update;
  if not found then
    raise exception 'Statement not found';
  end if;

  perform public.fsm_transition('payout_statement', st.id::text, 'confirm', st.status);

  update public.payout_statements
  set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now()
  where id = st.id
  returning * into st;

  perform public.notify_user(st.user_id, 'payout_confirmed',
    'Payout statement confirmed',
    to_char(st.period_start, 'YYYY-MM-DD') || ' → ' || to_char(st.period_end, 'YYYY-MM-DD')
      || ' · ' || (st.total_minor / 100.0) || ' ' || st.currency,
    '/payouts/' || st.id);
  perform public.feed_event('payout.confirmed', 'payout_statement', st.id::text,
    'Payout confirmed for ' ||
    (select full_name from public.profiles where id = st.user_id));

  return st;
end;
$$;

create or replace function public.mark_payout_paid(p_statement_id uuid)
returns public.payout_statements
language plpgsql
security definer
set search_path = public
as $$
declare
  st public.payout_statements%rowtype;
begin
  perform set_config('app.via_rpc', 'on', true);
  select * into st from public.payout_statements where id = p_statement_id for update;
  if not found then
    raise exception 'Statement not found';
  end if;

  perform public.fsm_transition('payout_statement', st.id::text, 'mark_paid', st.status);

  update public.payout_statements
  set status = 'paid', paid_at = now()
  where id = st.id
  returning * into st;

  return st;
end;
$$;

create or replace function public.payout_statement_actions(p_statement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  st public.payout_statements%rowtype;
begin
  select * into st from public.payout_statements where id = p_statement_id;
  if not found or not public.has_role('finance') then
    return '{}'::jsonb;
  end if;
  return public.fsm_actions('payout_statement', st.status);
end;
$$;

-- ----------------------------------------------------------------------------
-- Reconciliation guard (E-3): per person per month — approved vs billed vs
-- paid-out hours, plus whether a cost rate exists. Differences are explicit.
-- ----------------------------------------------------------------------------
create view public.v_payout_reconciliation
with (security_invoker = true) as
select
  pf.id as user_id,
  pf.full_name,
  date_trunc('month', te.work_date)::date as month,
  sum(te.hours) as approved_hours,
  sum(te.hours) filter (where te.invoice_id is not null) as billed_hours,
  coalesce(paid.hours, 0) as paid_out_hours,
  sum(te.hours) - coalesce(paid.hours, 0) as unpaid_hours,
  (public.resolve_cost_rate(pf.id, current_date) is null) as missing_cost_rate
from public.time_entries te
join public.profiles pf on pf.id = te.user_id
left join lateral (
  select sum(pl.hours) as hours
  from public.payout_lines pl
  join public.payout_line_entries ple on ple.payout_line_id = pl.id
  join public.time_entries te2 on te2.id = ple.time_entry_id
  where te2.user_id = pf.id
    and date_trunc('month', te2.work_date) = date_trunc('month', te.work_date)
) paid on true
where te.status = 'approved'
group by pf.id, pf.full_name, 3, paid.hours;

-- ----------------------------------------------------------------------------
-- Margin (E-4): revenue − cost per project per month.
-- Revenue: invoiced T&M value of stamped entries (bill rate at work date) +
-- milestone lines. Cost: approved hours × cost rate. Retainer revenue is
-- reported under the project's client via the invoice, not allocated here.
-- ----------------------------------------------------------------------------
create view public.v_margin_by_project
with (security_invoker = true) as
with entry_econ as (
  select
    te.project_id,
    date_trunc('month', te.work_date)::date as month,
    sum(case when te.invoice_id is not null and te.billable
        then round(te.hours * coalesce(public.resolve_rate(te.user_id, te.project_id, te.work_date), 0))
        else 0 end)::bigint as tm_revenue_minor,
    sum(round(te.hours * coalesce(public.resolve_cost_rate(te.user_id, te.work_date), 0)))::bigint
      as cost_minor,
    sum(te.hours) as approved_hours
  from public.time_entries te
  where te.status = 'approved'
  group by te.project_id, 2
),
milestone_rev as (
  select m.project_id,
         date_trunc('month', i.issued_at)::date as month,
         sum(m.amount_minor)::bigint as milestone_revenue_minor
  from public.milestones m
  join public.invoices i on i.id = m.invoice_id
  where i.status in ('issued', 'paid', 'partially_paid', 'overdue')
  group by m.project_id, 2
)
select
  pr.id as project_id,
  pr.name as project_name,
  cl.id as client_id,
  cl.name as client_name,
  cl.currency,
  coalesce(e.month, mr.month) as month,
  coalesce(e.approved_hours, 0) as approved_hours,
  coalesce(e.tm_revenue_minor, 0) + coalesce(mr.milestone_revenue_minor, 0) as revenue_minor,
  coalesce(e.cost_minor, 0) as cost_minor,
  coalesce(e.tm_revenue_minor, 0) + coalesce(mr.milestone_revenue_minor, 0)
    - coalesce(e.cost_minor, 0) as margin_minor,
  case
    when coalesce(e.tm_revenue_minor, 0) + coalesce(mr.milestone_revenue_minor, 0) > 0
    then round(100.0 * (coalesce(e.tm_revenue_minor, 0) + coalesce(mr.milestone_revenue_minor, 0)
                        - coalesce(e.cost_minor, 0))
               / (coalesce(e.tm_revenue_minor, 0) + coalesce(mr.milestone_revenue_minor, 0)), 1)
  end as margin_pct
from entry_econ e
full outer join milestone_rev mr
  on mr.project_id = e.project_id and mr.month = e.month
join public.projects pr on pr.id = coalesce(e.project_id, mr.project_id)
join public.clients cl on cl.id = pr.client_id;

-- ----------------------------------------------------------------------------
-- My Day: add payout + margin tiles (replaces 0006 version).
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

  if public.has_role('finance') then
    result := result || jsonb_build_object('finance', jsonb_build_object(
      'draft_invoices', (select count(*) from public.invoices
                         where status = 'draft' and kind = 'invoice'),
      'overdue_invoices', (select count(*) from public.invoices
                           where status = 'overdue'),
      'overdue_minor', (select coalesce(sum(outstanding_minor), 0)
                        from public.v_invoice_aging where bucket <> 'current'),
      'unbilled_minor', (select coalesce(sum(value_minor), 0) from public.v_unbilled_work),
      'payouts_to_confirm', (select count(*) from public.payout_statements
                             where status = 'draft')
    ));
  end if;

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
        where paid_at >= date_trunc('month', now())::date),
      'margin_this_month_minor', (
        select coalesce(sum(margin_minor), 0) from public.v_margin_by_project
        where month = date_trunc('month', current_date)::date)
    ));
  end if;

  return result;
end;
$$;

-- 0007's default privileges cover the new tables/functions automatically.
