-- ============================================================================
-- 0016 PHASE 8 — TALENT ACQUISITION & TALENT DATABASE (Module H)
-- Requisitions, candidate pipeline (FSM) with interview scorecards, offers,
-- talent pool, hire → onboarding checklist, PM engagement close-outs, and the
-- automatic engagement history that powers Talent 360.
-- Privacy tier (H-11): scorecards, offers, expected rates and internal
-- ratings are visible to recruiter/owner/admin (+ the interviewer for their
-- own round) — never to PMs at large, never in client-facing exports.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Requisitions (H-1)
-- ----------------------------------------------------------------------------
create table public.requisitions (
  id                  uuid primary key default gen_random_uuid(),
  role_title          text not null,
  skills              text[] not null default '{}',
  seniority           public.skill_level,
  headcount           int not null default 1 check (headcount > 0),
  reason              text not null default 'growth'
                      check (reason in ('growth', 'backfill', 'staffing_request')),
  staffing_request_id uuid references public.staffing_requests (id),
  status              text not null default 'open'
                      check (status in ('open', 'filled', 'cancelled')),
  opened_at           timestamptz not null default now(),
  filled_at           timestamptz,
  notes               text
);

alter table public.requisitions enable row level security;

create policy requisitions_read on public.requisitions
  for select using (public.has_role('recruiter') or public.has_role('resourcing')
                    or public.has_role('finance'));
create policy requisitions_manage on public.requisitions
  for all using (public.has_role('recruiter')) with check (public.has_role('recruiter'));

-- ----------------------------------------------------------------------------
-- Candidates (H-2): sourced → screening → interview → assessment → offer →
-- hired | rejected | talent_pool (reactivatable, H-4)
-- ----------------------------------------------------------------------------
create table public.candidates (
  id                  uuid primary key default gen_random_uuid(),
  full_name           text not null,
  email               text,
  phone               text,
  cv_url              text,
  skills              text[] not null default '{}',
  seniority           public.skill_level,
  expected_rate_minor bigint,
  available_from      date,
  source              text not null default 'other'
                      check (source in ('referral', 'linkedin', 'job_board', 'inbound', 'agency', 'other')),
  stage               text not null default 'sourced'
                      check (stage in ('sourced', 'screening', 'interview', 'assessment',
                                       'offer', 'hired', 'rejected', 'talent_pool')),
  requisition_id      uuid references public.requisitions (id),
  owner_id            uuid references public.profiles (id),
  rejection_reason    text,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index candidates_stage_idx on public.candidates (stage, updated_at);
create index candidates_requisition_idx on public.candidates (requisition_id);

create trigger set_updated_at before update on public.candidates
  for each row execute function public.tg_set_updated_at();

create table public.candidate_activities (
  id           bigint generated always as identity primary key,
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  kind         text not null default 'note',
  body         text not null,
  actor_id     uuid references public.profiles (id),
  at           timestamptz not null default now()
);

create index candidate_activities_idx on public.candidate_activities (candidate_id, at desc);

alter table public.candidates enable row level security;
alter table public.candidate_activities enable row level security;

create or replace function public.tg_candidates_guard()
returns trigger
language plpgsql
as $$
begin
  if new.stage is distinct from old.stage
     and coalesce(current_setting('app.via_rpc', true), '') <> 'on' then
    raise exception 'Candidate stage changes only through workflow actions';
  end if;
  return new;
end;
$$;

create trigger candidates_guard before update on public.candidates
  for each row execute function public.tg_candidates_guard();

insert into public.workflow_transitions
  (entity_type, action, from_state, to_state, required_role, requires_comment, label, is_destructive, sort_order)
values
  ('candidate', 'screen',     'sourced',     'screening',   'recruiter', false, 'Move to screening',  false, 1),
  ('candidate', 'interview',  'screening',   'interview',   'recruiter', false, 'Move to interviews', false, 1),
  ('candidate', 'assess',     'interview',   'assessment',  'recruiter', false, 'Technical assessment', false, 1),
  ('candidate', 'offer',      'interview',   'offer',       'recruiter', false, 'Make offer…',        false, 2),
  ('candidate', 'offer',      'assessment',  'offer',       'recruiter', false, 'Make offer…',        false, 1),
  ('candidate', 'hire',       'offer',       'hired',       'recruiter', false, 'Hire…',              false, 1),
  ('candidate', 'reject',     'sourced',     'rejected',    'recruiter', true,  'Reject',             true,  8),
  ('candidate', 'reject',     'screening',   'rejected',    'recruiter', true,  'Reject',             true,  8),
  ('candidate', 'reject',     'interview',   'rejected',    'recruiter', true,  'Reject',             true,  8),
  ('candidate', 'reject',     'assessment',  'rejected',    'recruiter', true,  'Reject',             true,  8),
  ('candidate', 'reject',     'offer',       'rejected',    'recruiter', true,  'Offer declined',     true,  8),
  ('candidate', 'pool',       'screening',   'talent_pool', 'recruiter', false, 'Park in talent pool', false, 9),
  ('candidate', 'pool',       'interview',   'talent_pool', 'recruiter', false, 'Park in talent pool', false, 9),
  ('candidate', 'pool',       'assessment',  'talent_pool', 'recruiter', false, 'Park in talent pool', false, 9),
  ('candidate', 'pool',       'offer',       'talent_pool', 'recruiter', false, 'Park in talent pool', false, 9),
  ('candidate', 'reactivate', 'talent_pool', 'screening',   'recruiter', false, 'Reactivate',         false, 1);

-- ----------------------------------------------------------------------------
-- Interview rounds & scorecards (H-3)
-- ----------------------------------------------------------------------------
create table public.interview_rounds (
  id             uuid primary key default gen_random_uuid(),
  candidate_id   uuid not null references public.candidates (id) on delete cascade,
  round_no       int not null default 1,
  interviewer_id uuid not null references public.profiles (id),
  scheduled_at   timestamptz,
  scorecard      jsonb,   -- [{criterion, score_1_5, notes}]
  recommendation text check (recommendation in ('strong_yes', 'yes', 'no', 'strong_no')),
  submitted_at   timestamptz,
  unique (candidate_id, round_no)
);

-- Privacy (H-11): recruiters/owner/admin, plus interviewers for candidates
-- they interview. Defined here because it references interview_rounds.
create or replace function public.can_see_candidate(p_candidate_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role('recruiter')
      or exists (select 1 from public.interview_rounds r
                 where r.candidate_id = p_candidate_id
                   and r.interviewer_id = auth.uid());
$$;

create policy candidates_read on public.candidates
  for select using (public.can_see_candidate(id));
create policy candidates_manage on public.candidates
  for all using (public.has_role('recruiter')) with check (public.has_role('recruiter'));
create policy candidate_activities_read on public.candidate_activities
  for select using (public.can_see_candidate(candidate_id));
create policy candidate_activities_write on public.candidate_activities
  for insert with check (public.has_role('recruiter') and actor_id = auth.uid());

alter table public.interview_rounds enable row level security;

create policy interview_rounds_read on public.interview_rounds
  for select using (public.has_role('recruiter') or interviewer_id = auth.uid());
create policy interview_rounds_recruiter_manage on public.interview_rounds
  for all using (public.has_role('recruiter')) with check (public.has_role('recruiter'));
create policy interview_rounds_interviewer_submit on public.interview_rounds
  for update using (interviewer_id = auth.uid()) with check (interviewer_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Offers (H-6 acceptance analytics)
-- ----------------------------------------------------------------------------
create table public.offers (
  id                uuid primary key default gen_random_uuid(),
  candidate_id      uuid not null references public.candidates (id) on delete cascade,
  rate_minor        bigint not null,
  rate_period       text not null default 'hourly' check (rate_period in ('hourly', 'monthly')),
  start_date        date,
  status            text not null default 'sent' check (status in ('sent', 'accepted', 'declined')),
  sent_at           timestamptz not null default now(),
  responded_at      timestamptz
);

alter table public.offers enable row level security;

create policy offers_recruiter on public.offers
  for all using (public.has_role('recruiter')) with check (public.has_role('recruiter'));

-- ----------------------------------------------------------------------------
-- Onboarding checklist (H-5)
-- ----------------------------------------------------------------------------
create table public.onboarding_tasks (
  id           uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  task         text not null,
  owner_id     uuid references public.profiles (id),
  due_date     date,
  done_at      timestamptz
);

alter table public.onboarding_tasks enable row level security;

create policy onboarding_read on public.onboarding_tasks
  for select using (public.has_role('recruiter') or owner_id = auth.uid());
create policy onboarding_manage on public.onboarding_tasks
  for all
  using (public.has_role('recruiter') or owner_id = auth.uid())
  with check (public.has_role('recruiter') or owner_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Candidate workflow RPCs
-- ----------------------------------------------------------------------------
create or replace function public.candidate_action(p_candidate_id uuid, p_action text, p_comment text default null)
returns public.candidates
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.candidates%rowtype;
  new_stage text;
begin
  if p_action = 'hire' then
    raise exception 'Hiring goes through hire_candidate() — it creates the onboarding checklist';
  end if;

  perform set_config('app.via_rpc', 'on', true);
  select * into c from public.candidates where id = p_candidate_id for update;
  if not found then
    raise exception 'Candidate not found';
  end if;

  new_stage := public.fsm_transition('candidate', c.id::text, p_action, c.stage, p_comment);

  update public.candidates
  set stage = new_stage,
      rejection_reason = case when new_stage = 'rejected' then p_comment else rejection_reason end
  where id = c.id
  returning * into c;

  -- an offer being declined is recorded on the offer too
  if p_action = 'reject' and exists (
    select 1 from public.offers where candidate_id = c.id and status = 'sent') then
    update public.offers set status = 'declined', responded_at = now()
    where candidate_id = c.id and status = 'sent';
  end if;

  insert into public.candidate_activities (candidate_id, kind, body, actor_id)
  values (c.id, 'stage_change',
          initcap(replace(p_action, '_', ' ')) || coalesce(' — ' || p_comment, ''),
          auth.uid());
  return c;
end;
$$;

create or replace function public.candidate_actions(p_candidate_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c public.candidates%rowtype;
begin
  select * into c from public.candidates where id = p_candidate_id;
  if not found then
    return '{}'::jsonb;
  end if;
  return public.fsm_actions('candidate', c.stage);
end;
$$;

create or replace function public.record_offer(
  p_candidate_id uuid, p_rate_minor bigint, p_rate_period text, p_start_date date
)
returns public.offers
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.candidates%rowtype;
  o public.offers%rowtype;
begin
  perform set_config('app.via_rpc', 'on', true);
  select * into c from public.candidates where id = p_candidate_id for update;
  if not found then
    raise exception 'Candidate not found';
  end if;

  if c.stage <> 'offer' then
    perform public.fsm_transition('candidate', c.id::text, 'offer', c.stage);
    update public.candidates set stage = 'offer' where id = c.id;
  end if;

  insert into public.offers (candidate_id, rate_minor, rate_period, start_date)
  values (p_candidate_id, p_rate_minor, p_rate_period, p_start_date)
  returning * into o;

  insert into public.candidate_activities (candidate_id, kind, body, actor_id)
  values (c.id, 'offer', 'Offer sent: ' || (p_rate_minor / 100.0) || ' ' || p_rate_period
          || coalesce(', starting ' || p_start_date, ''), auth.uid());
  return o;
end;
$$;

-- Hire (H-5): requires a completed scorecard (H-3); accepts the open offer,
-- creates the onboarding checklist, closes the requisition when headcount is
-- reached. The auth account itself is created by an admin from the checklist
-- (service-role action) — this wizard prepares everything else.
create or replace function public.hire_candidate(p_candidate_id uuid, p_admin_id uuid default null)
returns setof public.onboarding_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.candidates%rowtype;
  req public.requisitions%rowtype;
  admin_id uuid;
  hired_count int;
begin
  perform set_config('app.via_rpc', 'on', true);

  select * into c from public.candidates where id = p_candidate_id for update;
  if not found then
    raise exception 'Candidate not found';
  end if;

  if not exists (select 1 from public.interview_rounds
                 where candidate_id = c.id and submitted_at is not null) then
    raise exception 'A hiring decision requires at least one completed scorecard (H-3)';
  end if;

  perform public.fsm_transition('candidate', c.id::text, 'hire', c.stage);

  update public.candidates set stage = 'hired' where id = c.id;
  update public.offers set status = 'accepted', responded_at = now()
  where candidate_id = c.id and status = 'sent';

  admin_id := coalesce(p_admin_id,
    (select user_id from public.user_roles where role = 'admin' limit 1));

  insert into public.onboarding_tasks (candidate_id, task, owner_id, due_date)
  values
    (c.id, 'Create user account & send invite', admin_id, current_date + 2),
    (c.id, 'Set cost rate (E-1)', admin_id, current_date + 5),
    (c.id, 'Record skills on profile (B-1)', auth.uid(), current_date + 5),
    (c.id, 'Contract & NDA signed', admin_id, current_date + 7),
    (c.id, 'Equipment & accesses provisioned', admin_id, current_date + 7),
    (c.id, 'Intro meetings scheduled', auth.uid(), current_date + 10);

  if c.requisition_id is not null then
    select * into req from public.requisitions where id = c.requisition_id for update;
    select count(*) into hired_count from public.candidates
    where requisition_id = req.id and stage = 'hired';
    if hired_count >= req.headcount and req.status = 'open' then
      update public.requisitions set status = 'filled', filled_at = now()
      where id = req.id;
    end if;
  end if;

  insert into public.candidate_activities (candidate_id, kind, body, actor_id)
  values (c.id, 'stage_change', 'Hired — onboarding checklist created', auth.uid());
  perform public.feed_event('candidate.hired', 'candidate', c.id::text,
    c.full_name || ' hired' || coalesce(' for ' ||
      (select role_title from public.requisitions where id = c.requisition_id), ''));
  if admin_id is not null then
    perform public.notify_user(admin_id, 'onboarding',
      'Onboarding: ' || c.full_name,
      'Hired — the onboarding checklist is waiting for you.',
      '/recruiting');
  end if;

  return query select * from public.onboarding_tasks where candidate_id = c.id;
end;
$$;

-- Recruiter nudge (H-2): candidates idle in a stage too long.
create or replace function public.job_candidate_idle_nudge()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_key text := 'day:' || current_date;
  n int := 0;
  c record;
begin
  begin
    insert into public.automation_runs (job, run_key) values ('candidate_idle_nudge', v_run_key);
  exception when unique_violation then
    return 0;
  end;

  for c in
    select ca.id, ca.full_name, ca.stage, ca.owner_id,
           (current_date - ca.updated_at::date) as idle_days
    from public.candidates ca
    where ca.stage in ('sourced', 'screening', 'interview', 'assessment', 'offer')
      and ca.updated_at < now() - interval '7 days'
      and ca.owner_id is not null
  loop
    perform public.notify_user(c.owner_id, 'candidate_idle',
      c.full_name || ' idle in ' || c.stage,
      c.idle_days || ' days without movement — nudge or move them.',
      '/recruiting');
    n := n + 1;
  end loop;

  update public.automation_runs ar
  set detail = jsonb_build_object('nudged', n)
  where ar.job = 'candidate_idle_nudge' and ar.run_key = v_run_key;
  return n;
end;
$$;

select cron.schedule('candidate-idle-nudge', '10 6 * * *', $$select public.job_candidate_idle_nudge()$$);

-- ----------------------------------------------------------------------------
-- Engagement close-outs (H-8) + automatic engagement history
-- ----------------------------------------------------------------------------
create table public.engagements (
  assignment_id       uuid primary key references public.assignments (id) on delete cascade,
  outcome_note        text,
  internal_rating_1_5 int check (internal_rating_1_5 between 1 and 5),
  closed_by           uuid references public.profiles (id),
  closed_at           timestamptz not null default now()
);

alter table public.engagements enable row level security;

-- Internal ratings are privacy-tiered (H-11): recruiter/resourcing/owner read.
create policy engagements_read on public.engagements
  for select using (public.has_role('recruiter') or public.has_role('resourcing'));
create policy engagements_write on public.engagements
  for all using (public.has_role('pm')) with check (public.has_role('pm'));

-- Derived from assignments + approved entries — nobody maintains it by hand.
create view public.v_engagement_history
with (security_invoker = true) as
select
  a.id as assignment_id,
  a.user_id,
  pf.full_name,
  a.project_id,
  pr.name as project_name,
  cl.name as client_name,
  a.role_on_project,
  a.start_date,
  a.end_date,
  a.allocation_pct,
  coalesce((
    select sum(te.hours) from public.time_entries te
    where te.user_id = a.user_id and te.project_id = a.project_id
      and te.status = 'approved'
      and te.work_date >= a.start_date
      and (a.end_date is null or te.work_date <= a.end_date)
  ), 0) as approved_hours,
  (a.end_date is not null and a.end_date < current_date) as ended
from public.assignments a
join public.profiles pf on pf.id = a.user_id
join public.projects pr on pr.id = a.project_id
join public.clients cl on cl.id = pr.client_id;

-- ----------------------------------------------------------------------------
-- Recruiting analytics (H-6)
-- ----------------------------------------------------------------------------
create view public.v_recruiting_funnel
with (security_invoker = true) as
select
  source,
  count(*) as candidates,
  count(*) filter (where stage not in ('sourced')) as screened,
  count(*) filter (where exists (
    select 1 from public.interview_rounds r
    where r.candidate_id = candidates.id and r.submitted_at is not null)) as interviewed,
  count(*) filter (where exists (
    select 1 from public.offers o where o.candidate_id = candidates.id)) as offered,
  count(*) filter (where stage = 'hired') as hired,
  count(*) filter (where stage = 'talent_pool') as pooled
from public.candidates
group by source;
