-- ============================================================================
-- 0013 PHASE 5 — SALES & CONTRACTS (Module A, §3b)
-- Lead pipeline (FSM), versioned quotes (FSM), contract records, the Won-deal
-- handoff (client + contract + project + staffing request in one transaction),
-- renewal watchdog, pipeline reporting.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Leads (A-1)
-- ----------------------------------------------------------------------------
create table public.leads (
  id                 uuid primary key default gen_random_uuid(),
  company            text not null,
  contact_name       text,
  email              text,
  phone              text,
  source             text not null default 'other'
                     check (source in ('referral', 'event', 'inbound', 'research', 'outbound', 'other')),
  stage              text not null default 'lead'
                     check (stage in ('lead', 'qualified', 'proposal_sent', 'negotiation', 'won', 'lost')),
  expected_value_minor bigint,
  currency           char(3) not null default 'USD',
  probability_pct    int not null default 20 check (probability_pct between 0 and 100),
  expected_start     date,
  owner_id           uuid references public.profiles (id),
  client_id          uuid references public.clients (id),  -- set on win
  lost_reason        text,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index leads_stage_idx on public.leads (stage, expected_start);
create index leads_owner_idx on public.leads (owner_id);

create trigger set_updated_at before update on public.leads
  for each row execute function public.tg_set_updated_at();

create table public.lead_activities (
  id       bigint generated always as identity primary key,
  lead_id  uuid not null references public.leads (id) on delete cascade,
  kind     text not null default 'note'
           check (kind in ('note', 'call', 'email', 'meeting', 'stage_change')),
  body     text not null,
  actor_id uuid references public.profiles (id),
  at       timestamptz not null default now()
);

create index lead_activities_lead_idx on public.lead_activities (lead_id, at desc);

alter table public.leads enable row level security;
alter table public.lead_activities enable row level security;

create policy leads_read on public.leads
  for select using (public.has_role('sales') or public.has_role('finance') or public.has_role('pm'));
create policy leads_manage on public.leads
  for all using (public.has_role('sales')) with check (public.has_role('sales'));
create policy lead_activities_read on public.lead_activities
  for select using (public.has_role('sales') or public.has_role('finance') or public.has_role('pm'));
create policy lead_activities_write on public.lead_activities
  for insert with check (public.has_role('sales') and actor_id = auth.uid());

-- Stage changes only via workflow RPCs.
create or replace function public.tg_leads_guard()
returns trigger
language plpgsql
as $$
begin
  if new.stage is distinct from old.stage
     and coalesce(current_setting('app.via_rpc', true), '') <> 'on' then
    raise exception 'Lead stage changes only through workflow actions';
  end if;
  return new;
end;
$$;

create trigger leads_guard before update on public.leads
  for each row execute function public.tg_leads_guard();

insert into public.workflow_transitions
  (entity_type, action, from_state, to_state, required_role, requires_comment, label, is_destructive, sort_order)
values
  ('lead', 'qualify',       'lead',          'qualified',     'sales', false, 'Qualify',        false, 1),
  ('lead', 'send_proposal', 'qualified',     'proposal_sent', 'sales', false, 'Proposal sent',  false, 1),
  ('lead', 'negotiate',     'proposal_sent', 'negotiation',   'sales', false, 'In negotiation', false, 1),
  ('lead', 'win',           'qualified',     'won',           'sales', false, 'Mark won…',      false, 1),
  ('lead', 'win',           'proposal_sent', 'won',           'sales', false, 'Mark won…',      false, 1),
  ('lead', 'win',           'negotiation',   'won',           'sales', false, 'Mark won…',      false, 1),
  ('lead', 'lose',          'lead',          'lost',          'sales', true,  'Mark lost',      true,  9),
  ('lead', 'lose',          'qualified',     'lost',          'sales', true,  'Mark lost',      true,  9),
  ('lead', 'lose',          'proposal_sent', 'lost',          'sales', true,  'Mark lost',      true,  9),
  ('lead', 'lose',          'negotiation',   'lost',          'sales', true,  'Mark lost',      true,  9);

-- ----------------------------------------------------------------------------
-- Quotes (A-2/A-3): versioned per lead; accepted version becomes the
-- contract's commercial basis.
-- ----------------------------------------------------------------------------
create table public.quotes (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads (id) on delete cascade,
  version     int not null default 1,
  status      text not null default 'draft'
              check (status in ('draft', 'sent', 'accepted', 'rejected', 'superseded')),
  currency    char(3) not null default 'USD',
  valid_until date,
  total_minor bigint not null default 0,
  notes       text,
  created_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (lead_id, version)
);

create trigger set_updated_at before update on public.quotes
  for each row execute function public.tg_set_updated_at();

create table public.quote_lines (
  id                 uuid primary key default gen_random_uuid(),
  quote_id           uuid not null references public.quotes (id) on delete cascade,
  description        text not null,
  role_title         text,
  qty_hours          numeric(9, 2),
  unit_price_minor   bigint not null,
  amount_minor       bigint not null,
  billing_model_hint public.billing_model,
  position           int not null default 0
);

create index quote_lines_quote_idx on public.quote_lines (quote_id, position);

alter table public.quotes enable row level security;
alter table public.quote_lines enable row level security;

create policy quotes_read on public.quotes
  for select using (public.has_role('sales') or public.has_role('finance'));
create policy quotes_manage on public.quotes
  for all using (public.has_role('sales')) with check (public.has_role('sales'));
create policy quote_lines_read on public.quote_lines
  for select using (public.has_role('sales') or public.has_role('finance'));
create policy quote_lines_manage on public.quote_lines
  for all using (public.has_role('sales')) with check (public.has_role('sales'));

insert into public.workflow_transitions
  (entity_type, action, from_state, to_state, required_role, requires_comment, label, is_destructive, sort_order)
values
  ('quote', 'send',   'draft', 'sent',     'sales', false, 'Mark sent',     false, 1),
  ('quote', 'accept', 'sent',  'accepted', 'sales', false, 'Client accepted', false, 1),
  ('quote', 'reject', 'sent',  'rejected', 'sales', true,  'Client rejected', true,  2);

-- Lines editable only while the quote is draft; status via RPC only.
create or replace function public.tg_quotes_guard()
returns trigger
language plpgsql
as $$
declare
  via_rpc boolean := coalesce(current_setting('app.via_rpc', true), '') = 'on';
begin
  if old.status <> 'draft' and not via_rpc then
    raise exception 'Non-draft quotes are immutable; create a revision';
  end if;
  if new.status is distinct from old.status and not via_rpc then
    raise exception 'Quote status changes only through workflow actions';
  end if;
  return new;
end;
$$;

create trigger quotes_guard before update on public.quotes
  for each row execute function public.tg_quotes_guard();

create or replace function public.tg_quote_lines_guard()
returns trigger
language plpgsql
as $$
declare
  via_rpc boolean := coalesce(current_setting('app.via_rpc', true), '') = 'on';
  q_status text;
begin
  select status into q_status from public.quotes
    where id = coalesce(new.quote_id, old.quote_id);
  if q_status <> 'draft' and not via_rpc then
    raise exception 'Lines of a non-draft quote are immutable';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger quote_lines_guard
  before insert or update or delete on public.quote_lines
  for each row execute function public.tg_quote_lines_guard();

create or replace function public.tg_quote_lines_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.via_rpc', 'on', true);
  update public.quotes q
  set total_minor = coalesce(
    (select sum(amount_minor) from public.quote_lines where quote_id = q.id), 0)
  where q.id = coalesce(new.quote_id, old.quote_id);
  return null;
end;
$$;

create trigger quote_lines_total
  after insert or update or delete on public.quote_lines
  for each row execute function public.tg_quote_lines_total();

-- ----------------------------------------------------------------------------
-- Contracts (A-4)
-- ----------------------------------------------------------------------------
create table public.contracts (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references public.clients (id),
  lead_id            uuid references public.leads (id),
  quote_id           uuid references public.quotes (id),
  start_date         date not null,
  end_date           date,
  notice_days        int not null default 30,
  payment_terms_days int not null default 30,
  billing_schedule   text not null default 'monthly_arrears'
                     check (billing_schedule in ('monthly_arrears', 'monthly_advance', 'milestone', 'on_completion')),
  status             text not null default 'active'
                     check (status in ('active', 'expired', 'terminated')),
  signed_doc_ref     text,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index contracts_client_idx on public.contracts (client_id);
create index contracts_end_idx on public.contracts (end_date) where status = 'active';

create trigger set_updated_at before update on public.contracts
  for each row execute function public.tg_set_updated_at();

alter table public.contracts enable row level security;

create policy contracts_read on public.contracts
  for select using (public.has_role('sales') or public.has_role('finance') or public.has_role('pm'));
create policy contracts_manage on public.contracts
  for all
  using (public.has_role('sales') or public.has_role('finance'))
  with check (public.has_role('sales') or public.has_role('finance'));

-- ----------------------------------------------------------------------------
-- Quote workflow RPCs
-- ----------------------------------------------------------------------------
create or replace function public.create_quote(p_lead_id uuid)
returns public.quotes
language plpgsql
security definer
set search_path = public
as $$
declare
  q public.quotes%rowtype;
  next_version int;
begin
  if not public.has_role('sales') then
    raise exception 'Sales role required' using errcode = '42501';
  end if;
  select coalesce(max(version), 0) + 1 into next_version
  from public.quotes where lead_id = p_lead_id;

  insert into public.quotes (lead_id, version, currency, valid_until, created_by)
  select l.id, next_version, l.currency, current_date + 30, auth.uid()
  from public.leads l where l.id = p_lead_id
  returning * into q;

  if q.id is null then
    raise exception 'Lead not found';
  end if;
  return q;
end;
$$;

-- New revision: copy lines, supersede the old version.
create or replace function public.create_quote_revision(p_quote_id uuid)
returns public.quotes
language plpgsql
security definer
set search_path = public
as $$
declare
  old_q public.quotes%rowtype;
  new_q public.quotes%rowtype;
begin
  if not public.has_role('sales') then
    raise exception 'Sales role required' using errcode = '42501';
  end if;
  perform set_config('app.via_rpc', 'on', true);

  select * into old_q from public.quotes where id = p_quote_id for update;
  if not found then
    raise exception 'Quote not found';
  end if;
  if old_q.status not in ('sent', 'rejected') then
    raise exception 'Only sent or rejected quotes are revised';
  end if;

  new_q := public.create_quote(old_q.lead_id);

  insert into public.quote_lines
    (quote_id, description, role_title, qty_hours, unit_price_minor, amount_minor, billing_model_hint, position)
  select new_q.id, description, role_title, qty_hours, unit_price_minor, amount_minor, billing_model_hint, position
  from public.quote_lines where quote_id = old_q.id;

  update public.quotes set status = 'superseded' where id = old_q.id;

  perform public.write_audit('quote.revise', 'quote', old_q.id::text,
    jsonb_build_object('new_quote_id', new_q.id, 'new_version', new_q.version));

  select * into new_q from public.quotes where id = new_q.id;
  return new_q;
end;
$$;

create or replace function public.quote_action(p_quote_id uuid, p_action text, p_comment text default null)
returns public.quotes
language plpgsql
security definer
set search_path = public
as $$
declare
  q public.quotes%rowtype;
  new_state text;
begin
  perform set_config('app.via_rpc', 'on', true);
  select * into q from public.quotes where id = p_quote_id for update;
  if not found then
    raise exception 'Quote not found';
  end if;
  new_state := public.fsm_transition('quote', q.id::text, p_action, q.status, p_comment);
  update public.quotes set status = new_state where id = q.id returning * into q;

  insert into public.lead_activities (lead_id, kind, body, actor_id)
  values (q.lead_id, 'stage_change',
          'Quote v' || q.version || ': ' || p_action
            || coalesce(' — ' || p_comment, ''),
          auth.uid());
  return q;
end;
$$;

create or replace function public.quote_actions(p_quote_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  q public.quotes%rowtype;
begin
  select * into q from public.quotes where id = p_quote_id;
  if not found then
    return '{}'::jsonb;
  end if;
  return public.fsm_actions('quote', q.status);
end;
$$;

-- ----------------------------------------------------------------------------
-- Lead workflow RPCs
-- ----------------------------------------------------------------------------
create or replace function public.advance_lead(p_lead_id uuid, p_action text, p_comment text default null)
returns public.leads
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.leads%rowtype;
  new_stage text;
begin
  if p_action = 'win' then
    raise exception 'Winning a deal goes through win_lead() — it creates the client, contract and project';
  end if;

  perform set_config('app.via_rpc', 'on', true);
  select * into l from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'Lead not found';
  end if;

  new_stage := public.fsm_transition('lead', l.id::text, p_action, l.stage, p_comment);

  update public.leads
  set stage = new_stage,
      lost_reason = case when new_stage = 'lost' then p_comment else lost_reason end,
      probability_pct = case new_stage
        when 'qualified' then greatest(probability_pct, 40)
        when 'proposal_sent' then greatest(probability_pct, 60)
        when 'negotiation' then greatest(probability_pct, 75)
        when 'lost' then 0
        else probability_pct end
  where id = l.id
  returning * into l;

  insert into public.lead_activities (lead_id, kind, body, actor_id)
  values (l.id, 'stage_change', initcap(replace(p_action, '_', ' '))
          || coalesce(' — ' || p_comment, ''), auth.uid());

  if l.stage = 'lost' then
    perform public.feed_event('deal.lost', 'lead', l.id::text,
      l.company || ' marked lost: ' || coalesce(p_comment, ''));
  end if;

  return l;
end;
$$;

create or replace function public.lead_actions(p_lead_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  l public.leads%rowtype;
begin
  select * into l from public.leads where id = p_lead_id;
  if not found then
    return '{}'::jsonb;
  end if;
  return public.fsm_actions('lead', l.stage);
end;
$$;

-- ----------------------------------------------------------------------------
-- Win handoff (A-5): one transaction creates Client (if new), Contract from
-- the accepted quote, Project with billing model + rate card hint, and an
-- optional staffing request. Zero retyping.
-- Options jsonb:
--   { "client_id": uuid | null,        -- null → create from lead company
--     "project_name": text,
--     "billing_model": "tm"|"retainer"|"fixed",
--     "contract_end_date": date|null,
--     "staffing": { "role_title": text, "allocation_pct": n,
--                   "skills": [text], "duration_weeks": n } | null }
-- ----------------------------------------------------------------------------
create or replace function public.win_lead(p_lead_id uuid, p_options jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  l  public.leads%rowtype;
  q  public.quotes%rowtype;
  v_client_id uuid;
  v_contract  public.contracts%rowtype;
  v_project   public.projects%rowtype;
  v_request_id uuid;
  v_start date;
begin
  perform set_config('app.via_rpc', 'on', true);

  select * into l from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'Lead not found';
  end if;

  perform public.fsm_transition('lead', l.id::text, 'win', l.stage);

  select * into q from public.quotes
  where lead_id = l.id and status = 'accepted'
  order by version desc limit 1;  -- optional: a deal can close without a quote

  v_start := coalesce(l.expected_start, current_date);

  -- 1) Client
  if p_options ->> 'client_id' is not null then
    v_client_id := (p_options ->> 'client_id')::uuid;
  else
    insert into public.clients (name, contact_email, currency)
    values (l.company, l.email, l.currency)
    returning id into v_client_id;
  end if;

  -- 2) Contract (commercial basis = accepted quote when present)
  insert into public.contracts
    (client_id, lead_id, quote_id, start_date, end_date, notes)
  values
    (v_client_id, l.id, q.id, v_start,
     nullif(p_options ->> 'contract_end_date', '')::date,
     'Created from won deal: ' || l.company)
  returning * into v_contract;

  -- 3) Project
  insert into public.projects (client_id, name, billing_model, pm_id)
  values (v_client_id,
          coalesce(p_options ->> 'project_name', l.company || ' Engagement'),
          coalesce((p_options ->> 'billing_model')::public.billing_model, 'tm'),
          auth.uid())
  returning * into v_project;

  -- 4) Staffing request (B-4) for the roles sold
  if p_options -> 'staffing' is not null and p_options -> 'staffing' <> 'null'::jsonb then
    insert into public.staffing_requests
      (project_id, role_title, skills, allocation_pct, start_date, duration_weeks, notes, created_by)
    values
      (v_project.id,
       p_options -> 'staffing' ->> 'role_title',
       coalesce((select array_agg(x) from jsonb_array_elements_text(p_options -> 'staffing' -> 'skills') x), '{}'),
       coalesce((p_options -> 'staffing' ->> 'allocation_pct')::numeric, 100),
       v_start,
       (p_options -> 'staffing' ->> 'duration_weeks')::int,
       'From won deal: ' || l.company,
       auth.uid())
    returning id into v_request_id;
  end if;

  update public.leads
  set stage = 'won', client_id = v_client_id, probability_pct = 100
  where id = l.id;

  insert into public.lead_activities (lead_id, kind, body, actor_id)
  values (l.id, 'stage_change', 'Won — handed off to delivery', auth.uid());

  perform public.feed_event('deal.won', 'lead', l.id::text,
    l.company || ' won — ' ||
    coalesce((l.expected_value_minor / 100.0)::text || ' ' || l.currency, 'value n/a'));

  return jsonb_build_object(
    'client_id', v_client_id,
    'contract_id', v_contract.id,
    'project_id', v_project.id,
    'staffing_request_id', v_request_id
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- Pipeline report (A-7)
-- ----------------------------------------------------------------------------
create view public.v_pipeline_report
with (security_invoker = true) as
select
  stage,
  count(*) as deal_count,
  sum(expected_value_minor)::bigint as total_value_minor,
  sum(round(expected_value_minor * probability_pct / 100.0))::bigint as weighted_value_minor
from public.leads
where stage not in ('won', 'lost')
group by stage;

-- ----------------------------------------------------------------------------
-- Renewal watchdog (A-6): notify at 60/30 days before contract end.
-- ----------------------------------------------------------------------------
create or replace function public.job_renewal_watchdog()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_key text := 'day:' || current_date;
  n int := 0;
  c record;
  recipient record;
begin
  begin
    insert into public.automation_runs (job, run_key) values ('renewal_watchdog', v_run_key);
  exception when unique_violation then
    return 0;
  end;

  -- flip expired contracts
  update public.contracts set status = 'expired'
  where status = 'active' and end_date < current_date;

  for c in
    select ct.id, ct.end_date, cl.name as client_name,
           (ct.end_date - current_date) as days_left
    from public.contracts ct
    join public.clients cl on cl.id = ct.client_id
    where ct.status = 'active'
      and (ct.end_date - current_date) in (60, 30)
  loop
    for recipient in
      select distinct user_id from public.user_roles where role in ('sales', 'owner')
    loop
      perform public.notify_user(recipient.user_id, 'contract_renewal',
        'Contract renewal: ' || c.client_name,
        c.days_left || ' days until contract end (' || c.end_date || ') — start the renewal motion.',
        '/sales');
      n := n + 1;
    end loop;
    perform public.feed_event('contract.renewal_due', 'contract', c.id::text,
      c.client_name || ' contract ends in ' || c.days_left || ' days');
  end loop;

  update public.automation_runs ar
  set detail = jsonb_build_object('notified', n)
  where ar.job = 'renewal_watchdog' and ar.run_key = v_run_key;
  return n;
end;
$$;

select cron.schedule('renewal-watchdog', '30 5 * * *', $$select public.job_renewal_watchdog()$$);
