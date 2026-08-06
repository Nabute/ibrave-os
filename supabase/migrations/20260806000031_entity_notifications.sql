-- ----------------------------------------------------------------------------
-- Entity-change notifications. In-app notifications already exist for
-- submit→PM, reject→employee, overdue→finance, renewals, red accounts, idle
-- candidates, payouts and calendar. This migration adds the missing
-- high-signal ones and makes the email leg idempotent:
--   * week approved            → the employee
--   * invoice fully paid       → the client's account owner
--   * escalation opened        → finance + owner (they pause dunning tone)
--   * staffing request opened  → resourcing team
--   * lead won                 → finance (new client/contract to set up)
--   * notifications.emailed_at → the reminders job emails each notification
--     once (digest per user) instead of re-sending daily until read.
-- ----------------------------------------------------------------------------
alter table public.notifications
  add column if not exists emailed_at timestamptz;

create index if not exists notifications_unemailed_idx
  on public.notifications (user_id) where emailed_at is null;

-- Notify everyone holding one of the roles (owner/admin do NOT implicitly
-- receive role notifications — that would spam them; list them explicitly
-- where wanted). The acting user is skipped.
create or replace function public.notify_role(
  p_roles text[], p_kind text, p_title text, p_body text, p_link text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select distinct ur.user_id
    from public.user_roles ur
    where ur.role::text = any (p_roles)
      and ur.user_id is distinct from auth.uid()
  loop
    perform public.notify_user(r.user_id, p_kind, p_title, p_body, p_link);
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- approve_entries: same body as before + one summary notification per person.
-- ----------------------------------------------------------------------------
create or replace function public.approve_entries(p_entry_ids uuid[])
returns setof public.time_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  e record;
  person record;
begin
  perform set_config('app.via_rpc', 'on', true);

  for e in
    select te.*, pr.pm_id
    from public.time_entries te
    join public.projects pr on pr.id = te.project_id
    where te.id = any (p_entry_ids)
    for update of te
  loop
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

  -- One notification per affected person, not one per entry.
  for person in
    select te.user_id, count(*) as n, sum(te.hours) as hours
    from public.time_entries te
    where te.id = any (p_entry_ids)
    group by te.user_id
  loop
    perform public.notify_user(person.user_id, 'entries_approved',
      'Hours approved',
      person.n || ' entries (' || round(person.hours, 2) || ' h) approved by '
        || (select full_name from public.profiles where id = auth.uid()),
      '/timesheet');
  end loop;

  return query select * from public.time_entries where id = any (p_entry_ids);
end;
$$;

-- ----------------------------------------------------------------------------
-- record_payment: m27 body + notify the account owner when fully paid.
-- ----------------------------------------------------------------------------
create or replace function public.record_payment(
  p_invoice_id uuid, p_amount_minor bigint,
  p_paid_at date default current_date,
  p_method text default null, p_note text default null
)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invoices%rowtype;
  paid_total bigint;
  remaining bigint;
  v_account_owner uuid;
begin
  perform set_config('app.via_rpc', 'on', true);

  select * into inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found';
  end if;

  if p_amount_minor <= 0 then
    raise exception 'Payment amount must be positive; use a credit note for corrections';
  end if;

  select coalesce(sum(amount_minor), 0) into paid_total
  from public.payments where invoice_id = p_invoice_id;
  remaining := inv.total_minor - paid_total;
  if p_amount_minor > remaining then
    raise exception 'Payment of % exceeds the remaining balance of % on %',
      round(p_amount_minor / 100.0, 2), round(remaining / 100.0, 2), inv.number;
  end if;

  perform public.fsm_transition('invoice', inv.id::text, 'record_payment', inv.status);

  insert into public.payments (invoice_id, amount_minor, paid_at, method, note, recorded_by)
  values (p_invoice_id, p_amount_minor, p_paid_at, p_method, p_note, auth.uid());

  paid_total := paid_total + p_amount_minor;

  update public.invoices
  set status = case when paid_total >= total_minor then 'paid' else 'partially_paid' end
  where id = p_invoice_id
  returning * into inv;

  if inv.status = 'paid' then
    perform public.feed_event('invoice.paid', 'invoice', inv.id::text,
      inv.number || ' fully paid');
    select account_owner_id into v_account_owner
    from public.clients where id = inv.client_id;
    if v_account_owner is not null and v_account_owner is distinct from auth.uid() then
      perform public.notify_user(v_account_owner, 'invoice_paid',
        'Invoice paid: ' || inv.number,
        (select name from public.clients where id = inv.client_id)
          || ' settled ' || round(inv.total_minor / 100.0, 2) || ' ' || inv.currency,
        '/invoices/' || inv.id);
    end if;
  end if;

  return inv;
end;
$$;

-- ----------------------------------------------------------------------------
-- Escalation opened → finance + owner (it pauses dunning tone, they must know)
-- ----------------------------------------------------------------------------
create or replace function public.tg_escalation_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_role(array['finance', 'owner'], 'escalation_opened',
    'Escalation: ' || (select name from public.clients where id = new.client_id),
    new.summary || ' (' || new.severity || ') — dunning escalation is paused while open',
    '/clients/' || new.client_id);
  return new;
end;
$$;

drop trigger if exists escalations_notify on public.escalations;
create trigger escalations_notify
  after insert on public.escalations
  for each row execute function public.tg_escalation_notify();

-- ----------------------------------------------------------------------------
-- Staffing request opened → resourcing team
-- ----------------------------------------------------------------------------
create or replace function public.tg_staffing_request_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_role(array['resourcing'], 'staffing_request_opened',
    'Staffing request: ' || new.role_title,
    coalesce(nullif(array_to_string(new.skills, ', '), '') || ' · ', '')
      || new.allocation_pct || '% from ' || new.start_date,
    '/staffing');
  return new;
end;
$$;

drop trigger if exists staffing_requests_notify on public.staffing_requests;
create trigger staffing_requests_notify
  after insert on public.staffing_requests
  for each row execute function public.tg_staffing_request_notify();

-- ----------------------------------------------------------------------------
-- Lead won → finance (a client, contract and project just came into existence)
-- ----------------------------------------------------------------------------
create or replace function public.tg_lead_won_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stage = 'won' and old.stage is distinct from 'won' then
    perform public.notify_role(array['finance'], 'deal_won',
      'Deal won: ' || new.company,
      'Client, contract and project were created — review rates and billing setup',
      '/clients');
  end if;
  return new;
end;
$$;

drop trigger if exists leads_won_notify on public.leads;
create trigger leads_won_notify
  after update on public.leads
  for each row execute function public.tg_lead_won_notify();
