-- ============================================================================
-- 0009 FIX: qualify automation_runs.run_key in the job functions — the bare
-- column name was ambiguous against the plpgsql variable of the same name.
-- ============================================================================

create or replace function public.job_timesheet_reminders()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  last_week date := date_trunc('week', current_date)::date - 7;
  v_run_key text := 'week:' || last_week;
  n int := 0;
  person record;
begin
  begin
    insert into public.automation_runs (job, run_key) values ('timesheet_reminders', v_run_key);
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

  update public.automation_runs ar
  set detail = jsonb_build_object('reminded', n)
  where ar.job = 'timesheet_reminders' and ar.run_key = v_run_key;
  return n;
end;
$$;

create or replace function public.job_approval_nudges()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  nudge_days int;
  v_run_key text := 'day:' || current_date;
  n int := 0;
  pm record;
begin
  select approval_nudge_days into nudge_days from public.company_settings;

  begin
    insert into public.automation_runs (job, run_key) values ('approval_nudges', v_run_key);
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

  update public.automation_runs ar
  set detail = jsonb_build_object('nudged', n)
  where ar.job = 'approval_nudges' and ar.run_key = v_run_key;
  return n;
end;
$$;

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
  inv record;
begin
  begin
    insert into public.automation_runs (job, run_key) values ('dunning_scan', v_run_key);
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

  update public.automation_runs ar
  set detail = jsonb_build_object('flipped_overdue', flipped)
  where ar.job = 'dunning_scan' and ar.run_key = v_run_key;
  return flipped;
end;
$$;
