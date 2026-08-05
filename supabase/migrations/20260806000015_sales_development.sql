-- ============================================================================
-- 0015 PHASE 7 — SALES DEVELOPMENT (Module A §3a)
-- Prospects (pre-pipeline), reusable outreach cadences, the "today view" task
-- queue, one-click prospect → lead conversion carrying history, do-not-contact,
-- and conversion analytics. v1 creates drafts/tasks — a human sends; the
-- system remembers.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Prospects (A-0.1). Lifecycle via FSM: active → converted|disqualified|dnc.
-- ----------------------------------------------------------------------------
create table public.prospects (
  id                uuid primary key default gen_random_uuid(),
  company           text not null,
  industry          text,
  size              text,
  region            text,
  source            text not null default 'research'
                    check (source in ('referral', 'event', 'inbound', 'research', 'outbound', 'other')),
  fit_score         int not null default 3 check (fit_score between 1 and 5),
  contact_name      text,
  email             text,
  linkedin          text,
  status            text not null default 'active'
                    check (status in ('active', 'converted', 'disqualified', 'dnc')),
  owner_id          uuid references public.profiles (id),
  converted_lead_id uuid references public.leads (id),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index prospects_status_idx on public.prospects (status, fit_score desc);

create trigger set_updated_at before update on public.prospects
  for each row execute function public.tg_set_updated_at();

create table public.prospect_activities (
  id          bigint generated always as identity primary key,
  prospect_id uuid not null references public.prospects (id) on delete cascade,
  kind        text not null default 'note'
              check (kind in ('note', 'email', 'linkedin', 'call', 'meeting', 'status')),
  body        text not null,
  actor_id    uuid references public.profiles (id),
  at          timestamptz not null default now()
);

create index prospect_activities_idx on public.prospect_activities (prospect_id, at desc);

alter table public.prospects enable row level security;
alter table public.prospect_activities enable row level security;

create policy prospects_read on public.prospects
  for select using (public.has_role('sales') or public.has_role('finance'));
create policy prospects_manage on public.prospects
  for all using (public.has_role('sales')) with check (public.has_role('sales'));
create policy prospect_activities_read on public.prospect_activities
  for select using (public.has_role('sales') or public.has_role('finance'));
create policy prospect_activities_write on public.prospect_activities
  for insert with check (public.has_role('sales') and actor_id = auth.uid());

create or replace function public.tg_prospects_guard()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status
     and coalesce(current_setting('app.via_rpc', true), '') <> 'on' then
    raise exception 'Prospect status changes only through workflow actions';
  end if;
  return new;
end;
$$;

create trigger prospects_guard before update on public.prospects
  for each row execute function public.tg_prospects_guard();

insert into public.workflow_transitions
  (entity_type, action, from_state, to_state, required_role, requires_comment, label, is_destructive, sort_order)
values
  ('prospect', 'convert',    'active', 'converted',    'sales', false, 'Convert to lead', false, 1),
  ('prospect', 'disqualify', 'active', 'disqualified', 'sales', true,  'Disqualify',      true,  2),
  ('prospect', 'mark_dnc',   'active', 'dnc',          'sales', false, 'Do not contact',  true,  3);

-- ----------------------------------------------------------------------------
-- Cadences (A-0.2): reusable touch sequences. Steps are ordered jsonb:
--   [{"day_offset": 0, "kind": "email", "note": "intro + case study"}, …]
-- ----------------------------------------------------------------------------
create table public.cadences (
  id     uuid primary key default gen_random_uuid(),
  name   text not null unique,
  steps  jsonb not null,
  active boolean not null default true,
  check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) > 0)
);

create table public.cadence_runs (
  id           uuid primary key default gen_random_uuid(),
  cadence_id   uuid not null references public.cadences (id),
  prospect_id  uuid not null references public.prospects (id) on delete cascade,
  current_step int not null default 0,
  status       text not null default 'active'
               check (status in ('active', 'completed', 'stopped')),
  started_at   timestamptz not null default now()
);

create index cadence_runs_prospect_idx on public.cadence_runs (prospect_id)
  where status = 'active';

alter table public.cadences enable row level security;
alter table public.cadence_runs enable row level security;

create policy cadences_read on public.cadences
  for select using (public.has_role('sales'));
create policy cadences_manage on public.cadences
  for all using (public.has_role('sales')) with check (public.has_role('sales'));
create policy cadence_runs_read on public.cadence_runs
  for select using (public.has_role('sales'));
-- runs are written only by RPCs

-- ----------------------------------------------------------------------------
-- Sales tasks: the "today view" queue (A-0.3, also used by G-7 check-ins).
-- ----------------------------------------------------------------------------
create table public.sales_tasks (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles (id),
  prospect_id    uuid references public.prospects (id) on delete cascade,
  client_id      uuid references public.clients (id) on delete cascade,
  cadence_run_id uuid references public.cadence_runs (id) on delete set null,
  kind           text not null default 'touch'
                 check (kind in ('touch', 'followup', 'checkin', 'meeting')),
  description    text not null,
  due_date       date not null default current_date,
  done_at        timestamptz,
  done_note      text,
  created_at     timestamptz not null default now()
);

create index sales_tasks_owner_due_idx on public.sales_tasks (owner_id, due_date)
  where done_at is null;

alter table public.sales_tasks enable row level security;

create policy sales_tasks_own on public.sales_tasks
  for select using (owner_id = auth.uid() or public.has_role('owner'));
create policy sales_tasks_insert on public.sales_tasks
  for insert with check (
    (public.has_role('sales') or public.has_role('account_owner'))
    and owner_id = auth.uid());
-- completion via RPC (it advances the cadence)

-- ----------------------------------------------------------------------------
-- Cadence RPCs
-- ----------------------------------------------------------------------------
create or replace function public.start_cadence(p_prospect_id uuid, p_cadence_id uuid)
returns public.cadence_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.prospects%rowtype;
  c public.cadences%rowtype;
  run public.cadence_runs%rowtype;
  step jsonb;
begin
  if not public.has_role('sales') then
    raise exception 'Sales role required' using errcode = '42501';
  end if;

  select * into p from public.prospects where id = p_prospect_id;
  if not found then
    raise exception 'Prospect not found';
  end if;
  if p.status <> 'active' then
    raise exception 'Cadences only run against active prospects (status: %)', p.status;
  end if;
  if exists (select 1 from public.cadence_runs
             where prospect_id = p_prospect_id and status = 'active') then
    raise exception 'Prospect already has an active cadence';
  end if;

  select * into c from public.cadences where id = p_cadence_id and active;
  if not found then
    raise exception 'Cadence not found or inactive';
  end if;

  insert into public.cadence_runs (cadence_id, prospect_id)
  values (p_cadence_id, p_prospect_id)
  returning * into run;

  step := c.steps -> 0;
  insert into public.sales_tasks
    (owner_id, prospect_id, cadence_run_id, kind, description, due_date)
  values
    (coalesce(p.owner_id, auth.uid()), p.id, run.id, 'touch',
     '[' || c.name || ' 1/' || jsonb_array_length(c.steps) || '] '
       || (step ->> 'kind') || ': ' || coalesce(step ->> 'note', ''),
     current_date + coalesce((step ->> 'day_offset')::int, 0));

  insert into public.prospect_activities (prospect_id, kind, body, actor_id)
  values (p.id, 'status', 'Cadence started: ' || c.name, auth.uid());

  return run;
end;
$$;

-- Completing a touch logs it and schedules the next step automatically (A-0.3).
create or replace function public.complete_sales_task(p_task_id uuid, p_note text default null)
returns public.sales_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.sales_tasks%rowtype;
  run public.cadence_runs%rowtype;
  c public.cadences%rowtype;
  p public.prospects%rowtype;
  next_step jsonb;
  next_index int;
begin
  select * into t from public.sales_tasks where id = p_task_id for update;
  if not found then
    raise exception 'Task not found';
  end if;
  if t.owner_id <> auth.uid() and not public.has_role('admin') then
    raise exception 'Not your task' using errcode = '42501';
  end if;
  if t.done_at is not null then
    raise exception 'Task already completed';
  end if;

  update public.sales_tasks
  set done_at = now(), done_note = p_note
  where id = t.id
  returning * into t;

  if t.prospect_id is not null then
    insert into public.prospect_activities (prospect_id, kind, body, actor_id)
    values (t.prospect_id, 'note',
            'Done: ' || t.description || coalesce(' — ' || p_note, ''), auth.uid());
  end if;
  if t.client_id is not null then
    insert into public.account_activities (client_id, kind, body, actor_id, source)
    values (t.client_id, 'note',
            'Check-in done: ' || coalesce(p_note, t.description), auth.uid(), 'manual');
  end if;

  -- Advance the cadence, if this task belonged to one.
  if t.cadence_run_id is not null then
    select * into run from public.cadence_runs where id = t.cadence_run_id for update;
    if found and run.status = 'active' then
      select * into c from public.cadences where id = run.cadence_id;
      select * into p from public.prospects where id = run.prospect_id;
      next_index := run.current_step + 1;
      next_step := c.steps -> next_index;

      if next_step is null or p.status <> 'active' then
        update public.cadence_runs set status = 'completed', current_step = next_index
        where id = run.id;
      else
        update public.cadence_runs set current_step = next_index where id = run.id;
        insert into public.sales_tasks
          (owner_id, prospect_id, cadence_run_id, kind, description, due_date)
        values
          (t.owner_id, run.prospect_id, run.id, 'touch',
           '[' || c.name || ' ' || (next_index + 1) || '/' || jsonb_array_length(c.steps) || '] '
             || (next_step ->> 'kind') || ': ' || coalesce(next_step ->> 'note', ''),
           current_date + greatest(1,
             coalesce((next_step ->> 'day_offset')::int, 0)
             - coalesce((c.steps -> run.current_step ->> 'day_offset')::int, 0)));
      end if;
    end if;
  end if;

  return t;
end;
$$;

create or replace function public.stop_cadence(p_run_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  run public.cadence_runs%rowtype;
begin
  if not public.has_role('sales') then
    raise exception 'Sales role required' using errcode = '42501';
  end if;
  select * into run from public.cadence_runs where id = p_run_id for update;
  if not found or run.status <> 'active' then
    return;
  end if;
  update public.cadence_runs set status = 'stopped' where id = run.id;
  delete from public.sales_tasks
  where cadence_run_id = run.id and done_at is null;
  insert into public.prospect_activities (prospect_id, kind, body, actor_id)
  values (run.prospect_id, 'status',
          'Cadence stopped' || coalesce(': ' || p_reason, ''), auth.uid());
end;
$$;

-- ----------------------------------------------------------------------------
-- Prospect workflow RPCs
-- ----------------------------------------------------------------------------

-- One click prospect → lead, carrying the full activity history (A-0.4).
create or replace function public.convert_prospect(p_prospect_id uuid)
returns public.leads
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.prospects%rowtype;
  l public.leads%rowtype;
begin
  perform set_config('app.via_rpc', 'on', true);

  select * into p from public.prospects where id = p_prospect_id for update;
  if not found then
    raise exception 'Prospect not found';
  end if;

  perform public.fsm_transition('prospect', p.id::text, 'convert', p.status);

  insert into public.leads (company, contact_name, email, source, owner_id, notes)
  values (p.company, p.contact_name, p.email, p.source, p.owner_id,
          'Converted from prospect' || coalesce(' — ' || p.notes, ''))
  returning * into l;

  -- carry over history
  insert into public.lead_activities (lead_id, kind, body, actor_id, at)
  select l.id,
         case pa.kind when 'linkedin' then 'note' when 'status' then 'note' else pa.kind end,
         '[prospecting] ' || pa.body, pa.actor_id, pa.at
  from public.prospect_activities pa
  where pa.prospect_id = p.id
  order by pa.at;

  update public.prospects
  set status = 'converted', converted_lead_id = l.id
  where id = p.id;

  -- stop any running cadence
  update public.cadence_runs set status = 'completed'
  where prospect_id = p.id and status = 'active';
  delete from public.sales_tasks
  where prospect_id = p.id and done_at is null and cadence_run_id is not null;

  perform public.feed_event('prospect.converted', 'prospect', p.id::text,
    p.company || ' converted to pipeline lead');

  return l;
end;
$$;

create or replace function public.prospect_action(p_prospect_id uuid, p_action text, p_comment text default null)
returns public.prospects
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.prospects%rowtype;
  new_status text;
begin
  if p_action = 'convert' then
    raise exception 'Use convert_prospect() — it creates the lead and carries history';
  end if;

  perform set_config('app.via_rpc', 'on', true);
  select * into p from public.prospects where id = p_prospect_id for update;
  if not found then
    raise exception 'Prospect not found';
  end if;

  new_status := public.fsm_transition('prospect', p.id::text, p_action, p.status, p_comment);

  update public.prospects set status = new_status where id = p.id returning * into p;

  -- DNC and disqualification kill outreach immediately (A-0.6)
  update public.cadence_runs set status = 'stopped'
  where prospect_id = p.id and status = 'active';
  delete from public.sales_tasks where prospect_id = p.id and done_at is null;

  insert into public.prospect_activities (prospect_id, kind, body, actor_id)
  values (p.id, 'status',
          initcap(replace(p_action, '_', ' ')) || coalesce(' — ' || p_comment, ''),
          auth.uid());
  return p;
end;
$$;

create or replace function public.prospect_actions(p_prospect_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p public.prospects%rowtype;
begin
  select * into p from public.prospects where id = p_prospect_id;
  if not found then
    return '{}'::jsonb;
  end if;
  return public.fsm_actions('prospect', p.status);
end;
$$;

-- ----------------------------------------------------------------------------
-- Conversion analytics (A-0.5): funnel by source, prospects → contacted →
-- converted → won.
-- ----------------------------------------------------------------------------
create view public.v_prospect_funnel
with (security_invoker = true) as
select
  p.source,
  count(*) as prospects,
  count(*) filter (where exists (
    select 1 from public.prospect_activities pa
    where pa.prospect_id = p.id and pa.kind in ('email', 'linkedin', 'call', 'meeting')
  )) as contacted,
  count(*) filter (where p.status = 'converted') as converted,
  count(*) filter (where exists (
    select 1 from public.leads l
    where l.id = p.converted_lead_id and l.stage = 'won'
  )) as won,
  count(*) filter (where p.status = 'dnc') as dnc
from public.prospects p
group by p.source;

-- ----------------------------------------------------------------------------
-- Account check-in tasks (G-7): accounts with no manual contact within their
-- tier's rhythm get a check-in task for the account owner. Same queue as
-- prospecting touches.
-- ----------------------------------------------------------------------------
create or replace function public.job_account_checkins()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_key text := 'day:' || current_date;
  n int := 0;
  cl record;
begin
  begin
    insert into public.automation_runs (job, run_key) values ('account_checkins', v_run_key);
  exception when unique_violation then
    return 0;
  end;

  for cl in
    select c.id, c.name, c.account_owner_id, c.tier,
           case c.tier when 'a' then 30 when 'b' then 60 else 90 end as rhythm
    from public.clients c
    where c.active and c.account_owner_id is not null
      and not exists (
        select 1 from public.sales_tasks t
        where t.client_id = c.id and t.kind = 'checkin' and t.done_at is null)
      and coalesce((
        select max(at)::date from public.account_activities a
        where a.client_id = c.id and a.source = 'manual'
      ), '-infinity'::date)
        < current_date - (case c.tier when 'a' then 30 when 'b' then 60 else 90 end)
  loop
    insert into public.sales_tasks (owner_id, client_id, kind, description, due_date)
    values (cl.account_owner_id, cl.id, 'checkin',
            'Check in with ' || cl.name || ' (tier ' || cl.tier
              || ' rhythm: every ' || cl.rhythm || ' days)',
            current_date);
    n := n + 1;
  end loop;

  update public.automation_runs ar
  set detail = jsonb_build_object('created', n)
  where ar.job = 'account_checkins' and ar.run_key = v_run_key;
  return n;
end;
$$;

select cron.schedule('account-checkins', '0 6 * * *', $$select public.job_account_checkins()$$);

-- ----------------------------------------------------------------------------
-- My Day: sales task queue card (replaces 0010's version of my_day).
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

  -- Task queue (A-0.3 + G-7): everyone with tasks sees them
  result := result || jsonb_build_object('tasks', (
    select jsonb_build_object(
      'due_today', count(*) filter (where due_date <= current_date),
      'overdue', count(*) filter (where due_date < current_date),
      'upcoming', count(*) filter (where due_date > current_date)
    )
    from public.sales_tasks
    where owner_id = uid and done_at is null
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
        where month = date_trunc('month', current_date)::date),
      'red_accounts', (
        select count(*) from public.account_health where light = 'red'),
      'weighted_pipeline_minor', (
        select coalesce(sum(weighted_value_minor), 0) from public.v_pipeline_report)
    ));
  end if;

  return result;
end;
$$;
