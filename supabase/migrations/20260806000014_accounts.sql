-- ============================================================================
-- 0014 PHASE 6 — CLIENT & ACCOUNT MANAGEMENT (Module G)
-- Activity timeline, opportunities (upsell), escalations (which pause dunning
-- escalation), explainable account health score, feedback pulses, and the
-- Account 360 aggregate. Mostly *reads* what Phases 1–5 already record.
-- ============================================================================

-- Account ownership + tier (G-7 cadence rhythm hangs off the tier)
alter table public.clients
  add column tier text not null default 'b' check (tier in ('a', 'b', 'c')),
  add column account_owner_id uuid references public.profiles (id);

-- ----------------------------------------------------------------------------
-- Activity & communication log (G-3). System-generated documents (issued
-- invoices, credit notes) land here automatically via trigger.
-- ----------------------------------------------------------------------------
create table public.account_activities (
  id        bigint generated always as identity primary key,
  client_id uuid not null references public.clients (id) on delete cascade,
  kind      text not null default 'note'
            check (kind in ('call', 'meeting', 'email', 'note', 'doc')),
  body      text not null,
  actor_id  uuid references public.profiles (id),
  source    text not null default 'manual' check (source in ('manual', 'system')),
  at        timestamptz not null default now()
);

create index account_activities_client_idx on public.account_activities (client_id, at desc);

alter table public.account_activities enable row level security;

create policy account_activities_read on public.account_activities
  for select using (auth.uid() is not null);
create policy account_activities_write on public.account_activities
  for insert with check (
    (public.has_role('account_owner') or public.has_role('sales')
     or public.has_role('finance') or public.has_role('pm'))
    and source = 'manual' and actor_id = auth.uid()
  );

-- Issued invoices/credit notes appear in the account timeline (G-3).
create or replace function public.tg_invoice_account_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'issued' and old.status = 'draft' then
    insert into public.account_activities (client_id, kind, body, actor_id, source)
    values (new.client_id, 'doc',
            case new.kind when 'invoice' then 'Invoice ' else 'Credit note ' end
              || new.number || ' issued — ' || (new.total_minor / 100.0) || ' ' || new.currency,
            auth.uid(), 'system');
  end if;
  return new;
end;
$$;

create trigger invoice_account_activity
  after update on public.invoices
  for each row execute function public.tg_invoice_account_activity();

-- ----------------------------------------------------------------------------
-- Growth opportunities (G-5): upsell/cross-sell, feeds pipeline analytics.
-- ----------------------------------------------------------------------------
create table public.opportunities (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.clients (id) on delete cascade,
  description    text not null,
  value_minor    bigint,
  currency       char(3) not null default 'USD',
  stage          text not null default 'idea'
                 check (stage in ('idea', 'proposed', 'won', 'lost')),
  expected_start date,
  owner_id       uuid references public.profiles (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index opportunities_client_idx on public.opportunities (client_id);

create trigger set_updated_at before update on public.opportunities
  for each row execute function public.tg_set_updated_at();

alter table public.opportunities enable row level security;

create policy opportunities_read on public.opportunities
  for select using (auth.uid() is not null);
create policy opportunities_manage on public.opportunities
  for all
  using (public.has_role('sales') or public.has_role('account_owner'))
  with check (public.has_role('sales') or public.has_role('account_owner'));

-- ----------------------------------------------------------------------------
-- Escalations (G-6): open escalations pause dunning tone escalation beyond
-- the courtesy reminder.
-- ----------------------------------------------------------------------------
create table public.escalations (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients (id) on delete cascade,
  severity    text not null default 'medium' check (severity in ('low', 'medium', 'high')),
  summary     text not null,
  owner_id    uuid references public.profiles (id),
  opened_at   timestamptz not null default now(),
  resolved_at timestamptz,
  resolution  text
);

create index escalations_client_idx on public.escalations (client_id)
  where resolved_at is null;

alter table public.escalations enable row level security;

create policy escalations_read on public.escalations
  for select using (auth.uid() is not null);
create policy escalations_manage on public.escalations
  for all
  using (public.has_role('account_owner') or public.has_role('pm') or public.has_role('finance'))
  with check (public.has_role('account_owner') or public.has_role('pm') or public.has_role('finance'));

create or replace function public.client_has_open_escalation(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.escalations
    where client_id = p_client_id and resolved_at is null
  );
$$;

-- Escalation-aware dunning queue: the single source the SQL job AND the edge
-- function read, so the pause rule can never diverge (D-3 + G-6).
-- Courtesy (due-3) still goes out; overdue escalation stages are held while
-- an escalation is open or the invoice is manually paused.
create or replace function public.dunning_queue()
returns table (
  invoice_id uuid,
  invoice_number text,
  client_id uuid,
  client_name text,
  billing_email text,
  total_minor bigint,
  currency char(3),
  due_date date,
  days_overdue int,
  stage text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    i.id,
    i.number,
    i.client_id,
    cl.name,
    coalesce(
      (select c.email from public.contacts c
       where c.client_id = cl.id and c.contact_role = 'billing'
         and c.email is not null and not c.opted_out
       limit 1),
      cl.contact_email),
    i.total_minor,
    i.currency,
    i.due_date,
    (current_date - i.due_date),
    case (current_date - i.due_date)
      when -3 then 'courtesy'
      when 7  then 'overdue-7'
      when 14 then 'overdue-14'
      when 30 then 'overdue-30'
    end
  from public.invoices i
  join public.clients cl on cl.id = i.client_id
  where i.kind = 'invoice'
    and i.status in ('issued', 'partially_paid', 'overdue')
    and (current_date - i.due_date) in (-3, 7, 14, 30)
    and not i.dunning_paused
    and ((current_date - i.due_date) = -3
         or not public.client_has_open_escalation(i.client_id));
$$;

-- The SQL job now reads the same queue.
create or replace function public.job_dunning_scan()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_key text := 'day:' || current_date;
  flipped int;
  fin record;
  q record;
begin
  begin
    insert into public.automation_runs (job, run_key) values ('dunning_scan', v_run_key);
  exception when unique_violation then
    return 0;
  end;

  flipped := public.mark_overdue_invoices();

  for q in select * from public.dunning_queue() where days_overdue > 0
  loop
    for fin in
      select distinct user_id from public.user_roles where role in ('finance', 'owner')
    loop
      perform public.notify_user(fin.user_id, 'invoice_overdue',
        'Invoice ' || q.invoice_number || ' overdue',
        q.client_name || ' — ' || q.days_overdue || ' days past due.',
        '/invoices/' || q.invoice_id);
    end loop;
  end loop;

  update public.automation_runs ar
  set detail = jsonb_build_object('flipped_overdue', flipped)
  where ar.job = 'dunning_scan' and ar.run_key = v_run_key;
  return flipped;
end;
$$;

-- ----------------------------------------------------------------------------
-- Feedback pulses (G-8): 1–5 per project per quarter, feeds the health score.
-- ----------------------------------------------------------------------------
create table public.feedback_pulses (
  id         bigint generated always as identity primary key,
  client_id  uuid not null references public.clients (id) on delete cascade,
  project_id uuid references public.projects (id),
  score_1_5  int not null check (score_1_5 between 1 and 5),
  comment    text,
  actor_id   uuid references public.profiles (id),
  at         timestamptz not null default now()
);

create index feedback_pulses_client_idx on public.feedback_pulses (client_id, at desc);

alter table public.feedback_pulses enable row level security;

create policy feedback_pulses_read on public.feedback_pulses
  for select using (auth.uid() is not null);
create policy feedback_pulses_write on public.feedback_pulses
  for insert with check (
    (public.has_role('account_owner') or public.has_role('pm') or public.has_role('sales'))
    and actor_id = auth.uid()
  );

-- ----------------------------------------------------------------------------
-- Account health (G-4): an explainable traffic light. Every factor is a named
-- penalty in factors jsonb — no black-box scores.
-- ----------------------------------------------------------------------------
create table public.account_health (
  client_id   uuid primary key references public.clients (id) on delete cascade,
  score       int not null,
  light       text not null check (light in ('green', 'yellow', 'red')),
  factors     jsonb not null,
  computed_at timestamptz not null default now()
);

alter table public.account_health enable row level security;

create policy account_health_read on public.account_health
  for select using (auth.uid() is not null);

create or replace function public.compute_account_health(p_client_id uuid)
returns public.account_health
language plpgsql
security definer
set search_path = public
as $$
declare
  cl public.clients%rowtype;
  factors jsonb := '[]'::jsonb;
  penalty int := 0;
  v int;
  contact_threshold int;
  last_contact_days int;
  hours_this numeric;
  hours_prev numeric;
  avg_feedback numeric;
  result public.account_health%rowtype;
begin
  select * into cl from public.clients where id = p_client_id;

  -- 1) Payment behaviour: overdue invoices
  select count(*) into v from public.invoices
  where client_id = p_client_id and status = 'overdue';
  if v > 0 then
    penalty := penalty + least(30, v * 15);
    factors := factors || jsonb_build_object(
      'factor', 'overdue_invoices', 'detail', v || ' overdue invoice(s)',
      'penalty', least(30, v * 15));
  end if;

  -- 2) Open escalations
  select count(*) filter (where severity = 'high') * 20
       + count(*) filter (where severity <> 'high') * 10
  into v
  from public.escalations where client_id = p_client_id and resolved_at is null;
  if v > 0 then
    penalty := penalty + least(30, v);
    factors := factors || jsonb_build_object(
      'factor', 'open_escalations', 'detail', 'open escalations weighted by severity',
      'penalty', least(30, v));
  end if;

  -- 3) Time since last meaningful (manual) contact, threshold by tier
  contact_threshold := case cl.tier when 'a' then 30 when 'b' then 60 else 90 end;
  select (current_date - max(at)::date) into last_contact_days
  from public.account_activities
  where client_id = p_client_id and source = 'manual';
  if last_contact_days is null or last_contact_days > contact_threshold then
    penalty := penalty + 15;
    factors := factors || jsonb_build_object(
      'factor', 'stale_contact',
      'detail', coalesce(last_contact_days || ' days since last contact',
                         'no contact logged')
                || ' (tier ' || cl.tier || ' expects ' || contact_threshold || ')',
      'penalty', 15);
  end if;

  -- 4) Contract ending within 60 days with no renewal motion (no open
  --    opportunity and no active lead for this client)
  if exists (
    select 1 from public.contracts ct
    where ct.client_id = p_client_id and ct.status = 'active'
      and ct.end_date is not null
      and ct.end_date - current_date between 0 and 60
  ) and not exists (
    select 1 from public.opportunities o
    where o.client_id = p_client_id and o.stage in ('idea', 'proposed')
  ) then
    penalty := penalty + 15;
    factors := factors || jsonb_build_object(
      'factor', 'renewal_no_motion',
      'detail', 'contract ends within 60 days and no open opportunity',
      'penalty', 15);
  end if;

  -- 5) Hours trend: approved hours this month vs last month
  select coalesce(sum(te.hours), 0) into hours_this
  from public.time_entries te
  join public.projects pr on pr.id = te.project_id
  where pr.client_id = p_client_id and te.status = 'approved'
    and te.work_date >= date_trunc('month', current_date);
  select coalesce(sum(te.hours), 0) into hours_prev
  from public.time_entries te
  join public.projects pr on pr.id = te.project_id
  where pr.client_id = p_client_id and te.status = 'approved'
    and te.work_date >= date_trunc('month', current_date) - interval '1 month'
    and te.work_date < date_trunc('month', current_date);
  if hours_prev > 0 and hours_this < hours_prev * 0.5
     and extract(day from current_date) > 14 then
    penalty := penalty + 15;
    factors := factors || jsonb_build_object(
      'factor', 'hours_drop',
      'detail', hours_this || ' h this month vs ' || hours_prev || ' h last month',
      'penalty', 15);
  end if;

  -- 6) Feedback (G-8): recent average below 3 hurts
  select avg(score_1_5) into avg_feedback
  from public.feedback_pulses
  where client_id = p_client_id and at > now() - interval '120 days';
  if avg_feedback is not null and avg_feedback < 3 then
    penalty := penalty + 15;
    factors := factors || jsonb_build_object(
      'factor', 'low_feedback',
      'detail', 'recent pulse average ' || round(avg_feedback, 1) || '/5',
      'penalty', 15);
  end if;

  insert into public.account_health (client_id, score, light, factors, computed_at)
  values (
    p_client_id,
    greatest(0, 100 - penalty),
    case when 100 - penalty >= 75 then 'green'
         when 100 - penalty >= 50 then 'yellow'
         else 'red' end,
    factors,
    now()
  )
  on conflict (client_id) do update
    set score = excluded.score, light = excluded.light,
        factors = excluded.factors, computed_at = excluded.computed_at
  returning * into result;

  return result;
end;
$$;

create or replace function public.job_account_health()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_key text := 'day:' || current_date;
  n int := 0;
  cl record;
  prev_light text;
  new_health public.account_health%rowtype;
  recipient record;
begin
  begin
    insert into public.automation_runs (job, run_key) values ('account_health', v_run_key);
  exception when unique_violation then
    return 0;
  end;

  for cl in select id, name, account_owner_id from public.clients where active
  loop
    select light into prev_light from public.account_health where client_id = cl.id;
    new_health := public.compute_account_health(cl.id);
    n := n + 1;

    if new_health.light = 'red' and coalesce(prev_light, 'green') <> 'red' then
      for recipient in
        select distinct user_id from public.user_roles where role in ('owner')
        union select cl.account_owner_id where cl.account_owner_id is not null
      loop
        perform public.notify_user(recipient.user_id, 'account_red',
          'Account turned red: ' || cl.name,
          'Health score ' || new_health.score || ' — open the Account 360 for the factors.',
          '/clients/' || cl.id);
      end loop;
      perform public.feed_event('account.red', 'client', cl.id::text,
        cl.name || ' health turned red (' || new_health.score || ')');
    end if;
  end loop;

  update public.automation_runs ar
  set detail = jsonb_build_object('computed', n)
  where ar.job = 'account_health' and ar.run_key = v_run_key;
  return n;
end;
$$;

select cron.schedule('account-health', '45 5 * * *', $$select public.job_account_health()$$);

-- ----------------------------------------------------------------------------
-- Account 360 (G-1): the aggregate, computed live — entered nowhere twice.
-- ----------------------------------------------------------------------------
create or replace function public.account_360(p_client_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return jsonb_build_object(
    'hours_this_month', (
      select coalesce(sum(te.hours), 0)
      from public.time_entries te
      join public.projects pr on pr.id = te.project_id
      where pr.client_id = p_client_id
        and te.status in ('approved', 'submitted')
        and te.work_date >= date_trunc('month', current_date)),
    'team', (
      select coalesce(jsonb_agg(distinct jsonb_build_object(
        'user_id', pf.id, 'full_name', pf.full_name,
        'role', a.role_on_project)), '[]'::jsonb)
      from public.assignments a
      join public.profiles pf on pf.id = a.user_id
      join public.projects pr on pr.id = a.project_id
      where pr.client_id = p_client_id
        and a.start_date <= current_date
        and (a.end_date is null or a.end_date >= current_date)),
    'open_ar_minor', (
      select coalesce(sum(outstanding_minor), 0)
      from public.v_invoice_aging where client_id = p_client_id),
    'overdue_ar_minor', (
      select coalesce(sum(outstanding_minor), 0)
      from public.v_invoice_aging
      where client_id = p_client_id and bucket <> 'current'),
    'next_renewal', (
      select min(end_date) from public.contracts
      where client_id = p_client_id and status = 'active' and end_date >= current_date),
    'open_opportunities_minor', (
      select coalesce(sum(value_minor), 0) from public.opportunities
      where client_id = p_client_id and stage in ('idea', 'proposed')),
    'open_escalations', (
      select count(*) from public.escalations
      where client_id = p_client_id and resolved_at is null),
    'health', (
      select to_jsonb(h) from public.account_health h where h.client_id = p_client_id)
  );
end;
$$;
