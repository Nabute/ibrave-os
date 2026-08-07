-- ============================================================================
-- 0038 SECURITY HARDENING
-- Tighten owner/admin semantics, enforce mandated MFA at the API boundary,
-- remove direct execution of internal helpers, and add missing authorization
-- checks to service-style RPCs.
-- ============================================================================

-- Admin is not owner. Owners/admins still pass every non-owner role check;
-- only an actual owner passes has_role('owner').
create or replace function public.has_role(check_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid()
      and (
        role::text = check_role
        or role = 'owner'
        or (role = 'admin' and check_role <> 'owner')
      )
  );
$$;

-- Required-MFA users must present an AAL2 JWT for PostgREST table/RPC access.
-- Auth endpoints remain available, and this RPC itself remains callable so the
-- frontend can decide whether to show enrollment/verification.
create or replace function public.require_mfa_for_api()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req_path text := coalesce(current_setting('request.path', true), '');
  jwt_aal text := coalesce(auth.jwt() ->> 'aal', 'aal1');
begin
  if auth.uid() is null then
    return;
  end if;

  if req_path = '/rpc/my_mfa_requirement' then
    return;
  end if;

  if public.my_mfa_requirement() and jwt_aal <> 'aal2' then
    raise exception 'MFA verification required' using errcode = '42501';
  end if;
end;
$$;

grant execute on function public.require_mfa_for_api() to authenticator;
alter role authenticator set pgrst.db_pre_request = 'public.require_mfa_for_api';
notify pgrst, 'reload config';

-- Stop future migrations from making every new function callable by app users.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

-- Internal helpers/jobs must not be directly callable through PostgREST.
revoke execute on function public.write_audit(text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.notify_user(uuid, text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.notify_role(text[], text, text, text, text) from public, anon, authenticated;
revoke execute on function public.feed_event(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.notify_slack(text) from public, anon, authenticated;
revoke execute on function public.invoke_edge_function(text) from public, anon, authenticated;
revoke execute on function public.fsm_transition(text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.fsm_actions(text, text, text[]) from public, anon, authenticated;
revoke execute on function public.can_use_email_identity(uuid, text) from public, anon, authenticated;
revoke execute on function public.recompute_invoice_totals(uuid) from public, anon, authenticated;
revoke execute on function public.mark_overdue_invoices() from public, anon, authenticated;
revoke execute on function public.dunning_queue() from public, anon, authenticated;
revoke execute on function public.client_has_open_escalation(uuid) from public, anon, authenticated;
revoke execute on function public.compute_account_health(uuid) from public, anon, authenticated;
revoke execute on function public.job_timesheet_reminders() from public, anon, authenticated;
revoke execute on function public.job_approval_nudges() from public, anon, authenticated;
revoke execute on function public.job_dunning_scan() from public, anon, authenticated;
revoke execute on function public.job_renewal_watchdog() from public, anon, authenticated;
revoke execute on function public.job_account_checkins() from public, anon, authenticated;
revoke execute on function public.job_account_health() from public, anon, authenticated;
revoke execute on function public.job_candidate_idle_nudge() from public, anon, authenticated;
revoke execute on function public.job_owner_alerts() from public, anon, authenticated;

-- Keep the explicit public RPC/helper surface callable.
grant execute on function public.has_role(text) to authenticated;
grant execute on function public.has_exact_role(text) to authenticated;
grant execute on function public.is_project_pm(uuid) to authenticated;
grant execute on function public.can_see_event(uuid) to authenticated;
grant execute on function public.can_see_candidate(uuid) to authenticated;
grant execute on function public.can_edit_template(text) to authenticated;
grant execute on function public.my_mfa_requirement() to authenticated;
grant execute on function public.resolve_rate(uuid, uuid, date) to authenticated;
grant execute on function public.resolve_cost_rate(uuid, date) to authenticated;
grant execute on function public.my_day() to authenticated;
grant execute on function public.submit_week(date) to authenticated;
grant execute on function public.copy_previous_week(date) to authenticated;
grant execute on function public.create_adjustment(uuid, numeric, text) to authenticated;
grant execute on function public.time_entry_actions(uuid) to authenticated;
grant execute on function public.approve_entries(uuid[]) to authenticated;
grant execute on function public.reject_entry(uuid, text) to authenticated;
grant execute on function public.generate_draft_invoice(uuid, date, date) to authenticated;
grant execute on function public.issue_invoice(uuid) to authenticated;
grant execute on function public.void_invoice(uuid, text) to authenticated;
grant execute on function public.create_credit_note(uuid, bigint, text) to authenticated;
grant execute on function public.record_payment(uuid, bigint, date, text, text) to authenticated;
grant execute on function public.delete_draft_invoice(uuid) to authenticated;
grant execute on function public.invoice_actions(uuid) to authenticated;
grant execute on function public.generate_payout_statements(date, date) to authenticated;
grant execute on function public.confirm_payout_statement(uuid) to authenticated;
grant execute on function public.mark_payout_paid(uuid) to authenticated;
grant execute on function public.payout_statement_actions(uuid) to authenticated;
grant execute on function public.bench(date, date) to authenticated;
grant execute on function public.capacity_forecast(int) to authenticated;
grant execute on function public.suggest_candidates(uuid) to authenticated;
grant execute on function public.fill_staffing_request(uuid, uuid) to authenticated;
grant execute on function public.cancel_staffing_request(uuid, text) to authenticated;
grant execute on function public.staffing_request_actions(uuid) to authenticated;
grant execute on function public.lead_actions(uuid) to authenticated;
grant execute on function public.advance_lead(uuid, text, text) to authenticated;
grant execute on function public.win_lead(uuid, jsonb) to authenticated;
grant execute on function public.create_quote(uuid) to authenticated;
grant execute on function public.create_quote_revision(uuid) to authenticated;
grant execute on function public.quote_action(uuid, text, text) to authenticated;
grant execute on function public.quote_actions(uuid) to authenticated;
grant execute on function public.prospect_actions(uuid) to authenticated;
grant execute on function public.prospect_action(uuid, text, text) to authenticated;
grant execute on function public.convert_prospect(uuid) to authenticated;
grant execute on function public.start_cadence(uuid, uuid) to authenticated;
grant execute on function public.stop_cadence(uuid, text) to authenticated;
grant execute on function public.complete_sales_task(uuid, text) to authenticated;
grant execute on function public.account_360(uuid) to authenticated;
grant execute on function public.client_digest(uuid, date) to authenticated;
grant execute on function public.my_email_identities() to authenticated;
grant execute on function public.schedule_event(jsonb) to authenticated;
grant execute on function public.cancel_event(uuid) to authenticated;
grant execute on function public.command_center() to authenticated;
grant execute on function public.two_sided_pipeline(int) to authenticated;
grant execute on function public.candidate_actions(uuid) to authenticated;
grant execute on function public.candidate_action(uuid, text, text) to authenticated;
grant execute on function public.record_offer(uuid, bigint, text, date) to authenticated;
grant execute on function public.hire_candidate(uuid, uuid) to authenticated;

-- Partially paid invoices past their due date are overdue receivables too.
create or replace function public.mark_overdue_invoices()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  perform set_config('app.via_rpc', 'on', true);
  update public.invoices
  set status = 'overdue'
  where status in ('issued', 'partially_paid')
    and kind = 'invoice'
    and due_date < current_date;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.account_360(p_client_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.has_role('account_owner') or public.has_role('sales')
          or public.has_role('finance') or public.has_role('pm')) then
    raise exception 'Not permitted' using errcode = '42501';
  end if;

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

create or replace function public.schedule_event(p jsonb)
returns public.calendar_events
language plpgsql
security definer
set search_path = public
as $$
declare
  ev public.calendar_events%rowtype;
  uid uuid;
  ext jsonb;
  v_client_id uuid := nullif(p ->> 'client_id', '')::uuid;
  v_lead_id uuid := nullif(p ->> 'lead_id', '')::uuid;
  v_prospect_id uuid := nullif(p ->> 'prospect_id', '')::uuid;
  v_candidate_id uuid := nullif(p ->> 'candidate_id', '')::uuid;
  v_round_id uuid := nullif(p ->> 'interview_round_id', '')::uuid;
begin
  if v_client_id is not null and not (
    public.has_role('account_owner') or public.has_role('sales')
    or public.has_role('finance') or public.has_role('pm')
  ) then
    raise exception 'Not permitted to link this client' using errcode = '42501';
  end if;

  if v_lead_id is not null and not (
    public.has_role('sales') or public.has_role('finance') or public.has_role('pm')
  ) then
    raise exception 'Not permitted to link this lead' using errcode = '42501';
  end if;

  if v_prospect_id is not null and not (
    public.has_role('sales') or public.has_role('finance')
  ) then
    raise exception 'Not permitted to link this prospect' using errcode = '42501';
  end if;

  if v_candidate_id is not null and not public.can_see_candidate(v_candidate_id) then
    raise exception 'Not permitted to link this candidate' using errcode = '42501';
  end if;

  if v_round_id is not null and not exists (
    select 1 from public.interview_rounds r
    where r.id = v_round_id
      and (public.has_role('recruiter') or r.interviewer_id = auth.uid())
  ) then
    raise exception 'Not permitted to link this interview round' using errcode = '42501';
  end if;

  insert into public.calendar_events
    (title, description, location, starts_at, ends_at, organizer_id,
     client_id, lead_id, prospect_id, candidate_id, interview_round_id)
  values
    (p ->> 'title',
     p ->> 'description',
     p ->> 'location',
     (p ->> 'starts_at')::timestamptz,
     (p ->> 'ends_at')::timestamptz,
     auth.uid(),
     v_client_id,
     v_lead_id,
     v_prospect_id,
     v_candidate_id,
     v_round_id)
  returning * into ev;

  for uid in
    select value::uuid from jsonb_array_elements_text(coalesce(p -> 'attendee_user_ids', '[]'::jsonb))
  loop
    insert into public.calendar_attendees (event_id, user_id)
    values (ev.id, uid);
    if uid <> auth.uid() then
      perform public.notify_user(uid, 'calendar_invite',
        'Invite: ' || ev.title,
        to_char(ev.starts_at, 'YYYY-MM-DD HH24:MI') || ' - from ' ||
          (select full_name from public.profiles where id = auth.uid()),
        '/calendar');
    end if;
  end loop;

  for ext in
    select value from jsonb_array_elements(coalesce(p -> 'external', '[]'::jsonb))
  loop
    insert into public.calendar_attendees (event_id, email, name)
    values (ev.id, ext ->> 'email', ext ->> 'name');
  end loop;

  if ev.interview_round_id is not null then
    update public.interview_rounds set scheduled_at = ev.starts_at
    where id = ev.interview_round_id;
  end if;

  return ev;
end;
$$;
