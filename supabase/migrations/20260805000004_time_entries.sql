-- ============================================================================
-- 0004 TIME ENTRIES + TIMESHEET WORKFLOW
-- Entry lifecycle (FSM): draft → submitted → approved | rejected(→draft).
-- Approved entries are immutable; corrections are adjustment entries.
-- All state changes go through SECURITY DEFINER RPCs that call fsm_transition.
-- ============================================================================

create table public.time_entries (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id),
  project_id       uuid not null references public.projects (id),
  task_id          uuid references public.tasks (id),
  work_date        date not null,
  hours            numeric(5, 2) not null,
  note             text,
  billable         boolean not null default true,
  status           text not null default 'draft'
                   check (status in ('draft', 'submitted', 'approved')),
  rejection_comment text,
  approved_by      uuid references public.profiles (id),
  approved_at      timestamptz,
  invoice_id       uuid,                -- FK added in the billing migration
  adjusts_entry_id uuid references public.time_entries (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- 0.25 h increments; adjustments may be negative, normal entries positive
  check (hours <> 0 and (hours * 4) = floor(hours * 4)),
  check (adjusts_entry_id is not null or hours > 0),
  check (abs(hours) <= 24)
);

create index time_entries_user_week_idx on public.time_entries (user_id, work_date);
create index time_entries_project_idx on public.time_entries (project_id, work_date);
create index time_entries_status_idx on public.time_entries (status);
create index time_entries_invoice_idx on public.time_entries (invoice_id);

create trigger set_updated_at before update on public.time_entries
  for each row execute function public.tg_set_updated_at();

-- ----------------------------------------------------------------------------
-- Guard triggers
-- ----------------------------------------------------------------------------

-- Status may only change inside an RPC (which sets app.via_rpc for the tx).
-- Approved rows are frozen except for invoice stamping (done by issue_invoice,
-- also inside an RPC).
create or replace function public.tg_time_entries_guard()
returns trigger
language plpgsql
as $$
declare
  via_rpc boolean := coalesce(current_setting('app.via_rpc', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' and not via_rpc then
      raise exception 'Time entries must be created as drafts';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Only draft entries can be deleted; use an adjustment entry';
    end if;
    return old;
  end if;

  -- UPDATE
  if old.status = 'approved' and not via_rpc then
    raise exception 'Approved time entries are immutable; use an adjustment entry';
  end if;
  if old.status = 'submitted' and not via_rpc then
    raise exception 'Submitted entries are locked until approved or rejected';
  end if;
  if new.status is distinct from old.status and not via_rpc then
    raise exception 'Entry status changes only through workflow actions';
  end if;
  return new;
end;
$$;

create trigger time_entries_guard
  before insert or update or delete on public.time_entries
  for each row execute function public.tg_time_entries_guard();

-- Soft business rule: warn-level cap — hard-stop above 24 h/day total.
create or replace function public.tg_time_entries_day_cap()
returns trigger
language plpgsql
as $$
declare
  day_total numeric;
begin
  select coalesce(sum(hours), 0) into day_total
  from public.time_entries
  where user_id = new.user_id
    and work_date = new.work_date
    and id <> new.id;
  if day_total + new.hours > 24 then
    raise exception 'Total hours for % on % would exceed 24', new.user_id, new.work_date;
  end if;
  return new;
end;
$$;

create trigger time_entries_day_cap
  before insert or update on public.time_entries
  for each row execute function public.tg_time_entries_day_cap();

-- Entries only on active projects the person is assigned to (on the work date).
create or replace function public.tg_time_entries_assignment()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public.assignments a
    join public.projects p on p.id = a.project_id
    where a.user_id = new.user_id
      and a.project_id = new.project_id
      and a.start_date <= new.work_date
      and (a.end_date is null or a.end_date >= new.work_date)
      and p.status = 'active'
  ) then
    raise exception 'No active assignment to this project on %', new.work_date;
  end if;
  if new.task_id is not null and not exists (
    select 1 from public.tasks t
    where t.id = new.task_id and t.project_id = new.project_id
  ) then
    raise exception 'Task does not belong to the project';
  end if;
  return new;
end;
$$;

create trigger time_entries_assignment
  before insert or update of project_id, task_id, work_date, user_id
  on public.time_entries
  for each row execute function public.tg_time_entries_assignment();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.time_entries enable row level security;

-- Read: own entries; PM sees entries on their projects; finance sees all
-- (they bill from them); owner/admin via has_role expansion.
create policy time_entries_select on public.time_entries
  for select using (
    user_id = auth.uid()
    or public.is_project_pm(project_id)
    or public.has_role('finance')
  );

-- Employees manage their own drafts only. Status changes are blocked by the
-- guard trigger, so "draft in, draft out" is all a direct write can do.
create policy time_entries_own_insert on public.time_entries
  for insert with check (user_id = auth.uid() and status = 'draft');
create policy time_entries_own_update on public.time_entries
  for update using (user_id = auth.uid() and status = 'draft')
  with check (user_id = auth.uid());
create policy time_entries_own_delete on public.time_entries
  for delete using (user_id = auth.uid() and status = 'draft');

-- ----------------------------------------------------------------------------
-- Workflow RPCs
-- ----------------------------------------------------------------------------

-- Submit all of my draft entries for the week starting p_week_start (a Monday).
create or replace function public.submit_week(p_week_start date)
returns setof public.time_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  e record;
  submitted_count int := 0;
begin
  if extract(isodow from p_week_start) <> 1 then
    raise exception 'Week start must be a Monday';
  end if;

  perform set_config('app.via_rpc', 'on', true);

  for e in
    select * from public.time_entries
    where user_id = auth.uid()
      and status = 'draft'
      and work_date between p_week_start and p_week_start + 6
    for update
  loop
    perform public.fsm_transition('time_entry', e.id::text, 'submit', e.status);
    update public.time_entries
      set status = 'submitted', rejection_comment = null
      where id = e.id;
    submitted_count := submitted_count + 1;
  end loop;

  if submitted_count = 0 then
    raise exception 'No draft entries to submit for week of %', p_week_start;
  end if;

  -- Nudge the PMs of the affected projects.
  perform public.notify_user(
    p.pm_id, 'approval_pending',
    'Timesheet submitted',
    (select full_name from public.profiles where id = auth.uid())
      || ' submitted ' || submitted_count || ' entries for week of ' || p_week_start,
    '/approvals'
  )
  from (
    select distinct pr.pm_id
    from public.time_entries te
    join public.projects pr on pr.id = te.project_id
    where te.user_id = auth.uid()
      and te.status = 'submitted'
      and te.work_date between p_week_start and p_week_start + 6
      and pr.pm_id is not null
      and pr.pm_id <> auth.uid()
  ) p;

  perform public.feed_event(
    'timesheet.submitted', 'timesheet_week',
    auth.uid()::text || ':' || p_week_start::text,
    (select full_name from public.profiles where id = auth.uid())
      || ' submitted the week of ' || p_week_start
  );

  return query
    select * from public.time_entries
    where user_id = auth.uid()
      and work_date between p_week_start and p_week_start + 6;
end;
$$;

-- Approve a batch of submitted entries (per entry or bulk per week).
create or replace function public.approve_entries(p_entry_ids uuid[])
returns setof public.time_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  e record;
begin
  perform set_config('app.via_rpc', 'on', true);

  for e in
    select te.*, pr.pm_id
    from public.time_entries te
    join public.projects pr on pr.id = te.project_id
    where te.id = any (p_entry_ids)
    for update of te
  loop
    -- Row-level guard on top of the FSM role check: must be *this* project's
    -- PM (owner/admin pass via is_project_pm).
    if not public.is_project_pm(e.project_id) then
      raise exception 'Only the project''s PM can approve entry %', e.id
        using errcode = '42501';
    end if;
    if e.user_id = auth.uid() and not public.has_role('admin') then
      raise exception 'You cannot approve your own entries' using errcode = '42501';
    end if;

    perform public.fsm_transition('time_entry', e.id::text, 'approve', e.status);

    update public.time_entries
      set status = 'approved', approved_by = auth.uid(), approved_at = now()
      where id = e.id;
  end loop;

  return query select * from public.time_entries where id = any (p_entry_ids);
end;
$$;

-- Reject one submitted entry back to draft, with a mandatory comment.
create or replace function public.reject_entry(p_entry_id uuid, p_comment text)
returns public.time_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.time_entries%rowtype;
begin
  perform set_config('app.via_rpc', 'on', true);

  select * into e from public.time_entries where id = p_entry_id for update;
  if not found then
    raise exception 'Entry not found';
  end if;
  if not public.is_project_pm(e.project_id) then
    raise exception 'Only the project''s PM can reject this entry' using errcode = '42501';
  end if;

  perform public.fsm_transition('time_entry', e.id::text, 'reject', e.status, p_comment);

  update public.time_entries
    set status = 'draft', rejection_comment = p_comment
    where id = p_entry_id
    returning * into e;

  perform public.notify_user(
    e.user_id, 'entry_rejected',
    'Time entry rejected',
    to_char(e.work_date, 'YYYY-MM-DD') || ' · ' || e.hours || 'h — ' || p_comment,
    '/timesheet'
  );

  return e;
end;
$$;

-- Post-approval correction: a signed adjustment entry referencing the original.
create or replace function public.create_adjustment(
  p_entry_id uuid, p_hours numeric, p_note text
)
returns public.time_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  orig public.time_entries%rowtype;
  adj  public.time_entries%rowtype;
begin
  select * into orig from public.time_entries where id = p_entry_id;
  if not found or orig.status <> 'approved' then
    raise exception 'Adjustments reference an approved entry';
  end if;
  if not (orig.user_id = auth.uid() or public.is_project_pm(orig.project_id)) then
    raise exception 'Not allowed to adjust this entry' using errcode = '42501';
  end if;
  if p_note is null or btrim(p_note) = '' then
    raise exception 'Adjustment entries require a note';
  end if;

  insert into public.time_entries
    (user_id, project_id, task_id, work_date, hours, note, billable, adjusts_entry_id)
  values
    (orig.user_id, orig.project_id, orig.task_id, orig.work_date,
     p_hours, p_note, orig.billable, orig.id)
  returning * into adj;

  perform public.write_audit('time_entry.adjust', 'time_entry', orig.id::text,
    jsonb_build_object('adjustment_id', adj.id, 'hours', p_hours, 'note', p_note));

  return adj;
end;
$$;

-- Copy last week's grid (project/task rows, not hours) as new drafts (FR-9).
create or replace function public.copy_previous_week(p_week_start date)
returns setof public.time_entries
language plpgsql
security definer
set search_path = public
as $$
begin
  if extract(isodow from p_week_start) <> 1 then
    raise exception 'Week start must be a Monday';
  end if;

  return query
  insert into public.time_entries (user_id, project_id, task_id, work_date, hours, note, billable)
  select user_id, project_id, task_id, work_date + 7, hours, null, billable
  from public.time_entries prev
  where prev.user_id = auth.uid()
    and prev.work_date between p_week_start - 7 and p_week_start - 1
    and prev.adjusts_entry_id is null
    and not exists (
      select 1 from public.time_entries cur
      where cur.user_id = prev.user_id
        and cur.project_id = prev.project_id
        and cur.task_id is not distinct from prev.task_id
        and cur.work_date = prev.work_date + 7
    )
  returning *;
end;
$$;

-- ----------------------------------------------------------------------------
-- HATEOAS: available actions for a single entry, for the current user.
-- ----------------------------------------------------------------------------
create or replace function public.time_entry_actions(p_entry_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  e public.time_entries%rowtype;
  allowed text[] := '{}';
begin
  select * into e from public.time_entries where id = p_entry_id;
  if not found then
    return '{}'::jsonb;
  end if;

  if e.user_id = auth.uid() then
    allowed := allowed || array['submit'];
  end if;
  if public.is_project_pm(e.project_id) and e.user_id <> auth.uid() then
    allowed := allowed || array['approve', 'reject'];
  end if;

  return public.fsm_actions('time_entry', e.status, allowed);
end;
$$;
