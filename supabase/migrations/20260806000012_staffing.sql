-- ============================================================================
-- 0012 PHASE 4 — STAFFING & BENCH (Module B)
-- Skills with proficiency, staffing requests (FSM: open → filled | cancelled)
-- with ranked candidate matching, bench view, capacity forecast. Bench cost
-- follows the privacy tier: only finance/owner see money.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Skills vocabulary + per-person proficiency (B-1)
-- ----------------------------------------------------------------------------
create table public.skills (
  id   uuid primary key default gen_random_uuid(),
  name text not null unique
);

create type public.skill_level as enum ('junior', 'mid', 'senior');

create table public.person_skills (
  user_id  uuid not null references public.profiles (id) on delete cascade,
  skill_id uuid not null references public.skills (id) on delete cascade,
  level    public.skill_level not null default 'mid',
  primary key (user_id, skill_id)
);

alter table public.skills enable row level security;
alter table public.person_skills enable row level security;

create policy skills_read on public.skills
  for select using (auth.uid() is not null);
create policy skills_manage on public.skills
  for all using (public.has_role('resourcing')) with check (public.has_role('resourcing'));
create policy person_skills_read on public.person_skills
  for select using (auth.uid() is not null);
create policy person_skills_manage on public.person_skills
  for all
  using (user_id = auth.uid() or public.has_role('resourcing'))
  with check (user_id = auth.uid() or public.has_role('resourcing'));

-- ----------------------------------------------------------------------------
-- Staffing requests (B-4)
-- ----------------------------------------------------------------------------
create table public.staffing_requests (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid references public.projects (id),
  role_title           text not null,
  skills               text[] not null default '{}',
  seniority            public.skill_level,
  allocation_pct       numeric(5, 2) not null default 100 check (allocation_pct > 0 and allocation_pct <= 100),
  start_date           date not null,
  duration_weeks       int check (duration_weeks > 0),
  status               text not null default 'open'
                       check (status in ('open', 'filled', 'cancelled')),
  filled_by_assignment uuid references public.assignments (id),
  notes                text,
  created_by           uuid references public.profiles (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index staffing_requests_status_idx on public.staffing_requests (status, start_date);

create trigger set_updated_at before update on public.staffing_requests
  for each row execute function public.tg_set_updated_at();

alter table public.staffing_requests enable row level security;

create policy staffing_requests_read on public.staffing_requests
  for select using (auth.uid() is not null);
create policy staffing_requests_manage on public.staffing_requests
  for all
  using (public.has_role('resourcing') or public.has_role('pm'))
  with check (public.has_role('resourcing') or public.has_role('pm'));

-- Status changes only via workflow RPCs.
create or replace function public.tg_staffing_requests_guard()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status
     and coalesce(current_setting('app.via_rpc', true), '') <> 'on' then
    raise exception 'Request status changes only through workflow actions';
  end if;
  return new;
end;
$$;

create trigger staffing_requests_guard
  before update on public.staffing_requests
  for each row execute function public.tg_staffing_requests_guard();

insert into public.workflow_transitions
  (entity_type, action, from_state, to_state, required_role, requires_comment, label, is_destructive, sort_order)
values
  ('staffing_request', 'fill',   'open', 'filled',    'resourcing', false, 'Assign & fill', false, 1),
  ('staffing_request', 'cancel', 'open', 'cancelled', 'resourcing', true,  'Cancel request', true, 2);

-- ----------------------------------------------------------------------------
-- Candidate matching (B-4): rank people by skill overlap + availability in
-- the request window. Availability = 100 − average committed allocation.
-- ----------------------------------------------------------------------------
create or replace function public.suggest_candidates(p_request_id uuid)
returns table (
  user_id uuid,
  full_name text,
  title text,
  matched_skills text[],
  skill_match_count int,
  committed_allocation_pct numeric,
  available_pct numeric,
  score numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  req public.staffing_requests%rowtype;
  window_end date;
begin
  if not (public.has_role('resourcing') or public.has_role('pm')) then
    raise exception 'Resourcing role required' using errcode = '42501';
  end if;

  select * into req from public.staffing_requests where id = p_request_id;
  if not found then
    raise exception 'Request not found';
  end if;
  window_end := req.start_date + coalesce(req.duration_weeks, 12) * 7;

  return query
  select
    p.id,
    p.full_name,
    p.title,
    coalesce(m.matched, '{}') as matched_skills,
    coalesce(array_length(m.matched, 1), 0) as skill_match_count,
    round(coalesce(alloc.pct, 0), 1) as committed_allocation_pct,
    round(100 - coalesce(alloc.pct, 0), 1) as available_pct,
    -- score: skill match dominates (100 per matched skill); availability
    -- (up to 100) breaks ties between equally-skilled candidates
    round(coalesce(array_length(m.matched, 1), 0) * 100 + (100 - coalesce(alloc.pct, 0)), 1)
      as score
  from public.profiles p
  left join lateral (
    select array_agg(s.name order by s.name) as matched
    from public.person_skills ps
    join public.skills s on s.id = ps.skill_id
    where ps.user_id = p.id
      and s.name = any (req.skills)
      and (req.seniority is null or ps.level >= req.seniority)
  ) m on true
  left join lateral (
    select sum(a.allocation_pct) as pct
    from public.assignments a
    where a.user_id = p.id
      and a.start_date <= window_end
      and (a.end_date is null or a.end_date >= req.start_date)
  ) alloc on true
  where p.active
  order by score desc, p.full_name
  limit 10;
end;
$$;

-- Fill: create the assignment and close the request — one transaction.
create or replace function public.fill_staffing_request(
  p_request_id uuid, p_user_id uuid
)
returns public.staffing_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.staffing_requests%rowtype;
  a   public.assignments%rowtype;
begin
  perform set_config('app.via_rpc', 'on', true);

  select * into req from public.staffing_requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found';
  end if;
  if req.project_id is null then
    raise exception 'Request has no project — link one before filling';
  end if;

  perform public.fsm_transition('staffing_request', req.id::text, 'fill', req.status);

  insert into public.assignments (user_id, project_id, role_on_project, start_date, end_date, allocation_pct)
  values (p_user_id, req.project_id, req.role_title, req.start_date,
          case when req.duration_weeks is not null
               then req.start_date + req.duration_weeks * 7 end,
          req.allocation_pct)
  returning * into a;

  update public.staffing_requests
  set status = 'filled', filled_by_assignment = a.id
  where id = req.id
  returning * into req;

  perform public.notify_user(p_user_id, 'assignment_created',
    'New assignment',
    req.role_title || ' from ' || req.start_date || ' at ' || req.allocation_pct || '%',
    '/timesheet');
  perform public.feed_event('staffing.filled', 'staffing_request', req.id::text,
    (select full_name from public.profiles where id = p_user_id)
      || ' assigned as ' || req.role_title);

  return req;
end;
$$;

create or replace function public.cancel_staffing_request(p_request_id uuid, p_comment text)
returns public.staffing_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.staffing_requests%rowtype;
begin
  perform set_config('app.via_rpc', 'on', true);
  select * into req from public.staffing_requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found';
  end if;
  perform public.fsm_transition('staffing_request', req.id::text, 'cancel', req.status, p_comment);
  update public.staffing_requests set status = 'cancelled' where id = req.id
  returning * into req;
  return req;
end;
$$;

create or replace function public.staffing_request_actions(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  req public.staffing_requests%rowtype;
begin
  select * into req from public.staffing_requests where id = p_request_id;
  if not found then
    return '{}'::jsonb;
  end if;
  return public.fsm_actions('staffing_request', req.status);
end;
$$;

-- ----------------------------------------------------------------------------
-- Bench (B-3): allocation vs capacity today (+ window), under-80% flagged.
-- Bench cost only for finance/owner (privacy tier) — null for others.
-- ----------------------------------------------------------------------------
create or replace function public.bench(p_from date default current_date, p_to date default current_date + 27)
returns table (
  user_id uuid,
  full_name text,
  title text,
  employment_type public.employment_type,
  weekly_capacity_hours numeric,
  committed_allocation_pct numeric,
  bench_pct numeric,
  under_allocated boolean,
  skills text[],
  time_off_days int,
  weekly_bench_cost_minor bigint  -- null unless caller is finance/owner
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  can_see_cost boolean := public.has_role('finance');
begin
  if not (public.has_role('resourcing') or public.has_role('pm') or public.has_role('finance')) then
    raise exception 'Resourcing, PM or finance role required' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    p.full_name,
    p.title,
    p.employment_type,
    p.weekly_capacity_hours,
    round(coalesce(alloc.pct, 0), 1),
    round(100 - least(coalesce(alloc.pct, 0), 100), 1),
    coalesce(alloc.pct, 0) < 80,
    coalesce(sk.names, '{}'),
    coalesce(toff.days, 0)::int,
    case when can_see_cost then
      round((100 - least(coalesce(alloc.pct, 0), 100)) / 100.0
            * p.weekly_capacity_hours
            * coalesce(public.resolve_cost_rate(p.id, current_date), 0))::bigint
    end
  from public.profiles p
  left join lateral (
    select sum(a.allocation_pct) as pct
    from public.assignments a
    where a.user_id = p.id
      and a.start_date <= p_to
      and (a.end_date is null or a.end_date >= p_from)
  ) alloc on true
  left join lateral (
    select array_agg(s.name order by s.name) as names
    from public.person_skills ps
    join public.skills s on s.id = ps.skill_id
    where ps.user_id = p.id
  ) sk on true
  left join lateral (
    select sum(least(t.end_date, p_to) - greatest(t.start_date, p_from) + 1) as days
    from public.time_off t
    where t.user_id = p.id and t.start_date <= p_to and t.end_date >= p_from
  ) toff on true
  where p.active
  order by coalesce(alloc.pct, 0), p.full_name;
end;
$$;

-- ----------------------------------------------------------------------------
-- Capacity forecast (B-5): committed allocation hours vs capacity per month.
-- Pipeline demand joins in Phase 5.
-- ----------------------------------------------------------------------------
create or replace function public.capacity_forecast(p_months int default 6)
returns table (
  month date,
  capacity_hours numeric,
  committed_hours numeric,
  time_off_hours numeric,
  free_hours numeric,
  utilization_pct numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.has_role('resourcing') or public.has_role('pm') or public.has_role('finance')) then
    raise exception 'Resourcing, PM or finance role required' using errcode = '42501';
  end if;

  return query
  with months as (
    select generate_series(
      date_trunc('month', current_date)::date,
      (date_trunc('month', current_date) + make_interval(months => p_months - 1))::date,
      interval '1 month'
    )::date as m
  ),
  people as (
    select id, weekly_capacity_hours from public.profiles where active
  ),
  per_month as (
    select
      months.m,
      -- ~4.345 weeks per month
      sum(people.weekly_capacity_hours) * 4.345 as cap,
      coalesce(sum(alloc.hours), 0) as committed,
      coalesce(sum(toff.hours), 0) as off_hours
    from months
    cross join people
    left join lateral (
      select sum(people.weekly_capacity_hours * 4.345 * a.allocation_pct / 100.0) as hours
      from public.assignments a
      where a.user_id = people.id
        and a.start_date <= (months.m + interval '1 month - 1 day')::date
        and (a.end_date is null or a.end_date >= months.m)
    ) alloc on true
    left join lateral (
      select sum(
        (least(t.end_date, (months.m + interval '1 month - 1 day')::date)
         - greatest(t.start_date, months.m) + 1)
        * people.weekly_capacity_hours / 5.0
      ) as hours
      from public.time_off t
      where t.user_id = people.id
        and t.start_date <= (months.m + interval '1 month - 1 day')::date
        and t.end_date >= months.m
    ) toff on true
    group by months.m
  )
  select
    per_month.m,
    round(per_month.cap, 0),
    round(per_month.committed, 0),
    round(per_month.off_hours, 0),
    round(per_month.cap - per_month.committed - per_month.off_hours, 0),
    round(100 * per_month.committed / nullif(per_month.cap, 0), 1)
  from per_month
  order by per_month.m;
end;
$$;
