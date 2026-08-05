-- ============================================================================
-- 0005 BILLING: RATE CARDS, INVOICES, PAYMENTS
-- Money is integer minor units (cents) + currency code. Issued invoices are
-- immutable; corrections are credit notes. All financial state changes are
-- SECURITY DEFINER RPCs wrapped around the FSM guard.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Rate cards (versioned, effective-dated; project-level or client default)
-- ----------------------------------------------------------------------------
create table public.rate_cards (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid references public.projects (id) on delete cascade,
  client_id      uuid references public.clients (id) on delete cascade,
  effective_from date not null,
  note           text,
  created_at     timestamptz not null default now(),
  check (num_nonnulls(project_id, client_id) = 1)
);

create index rate_cards_project_idx on public.rate_cards (project_id, effective_from desc);
create index rate_cards_client_idx on public.rate_cards (client_id, effective_from desc);

create table public.rate_card_lines (
  id                uuid primary key default gen_random_uuid(),
  rate_card_id      uuid not null references public.rate_cards (id) on delete cascade,
  user_id           uuid references public.profiles (id),
  role_name         text,
  hourly_rate_minor bigint not null check (hourly_rate_minor >= 0),
  check (num_nonnulls(user_id, role_name) = 1)
);

create index rate_card_lines_card_idx on public.rate_card_lines (rate_card_id);

alter table public.rate_cards enable row level security;
alter table public.rate_card_lines enable row level security;

create policy rate_cards_read on public.rate_cards
  for select using (public.has_role('finance') or public.has_role('pm'));
create policy rate_cards_finance_write on public.rate_cards
  for all using (public.has_role('finance')) with check (public.has_role('finance'));
create policy rate_card_lines_read on public.rate_card_lines
  for select using (public.has_role('finance') or public.has_role('pm'));
create policy rate_card_lines_finance_write on public.rate_card_lines
  for all using (public.has_role('finance')) with check (public.has_role('finance'));

-- Rate changes are sensitive: audit them.
create or replace function public.tg_rate_card_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.write_audit(
    'rate_card.' || lower(tg_op), 'rate_card',
    coalesce(new.id, old.id)::text,
    jsonb_build_object('new', to_jsonb(new), 'old', to_jsonb(old)));
  return coalesce(new, old);
end;
$$;

create trigger rate_cards_audit
  after insert or update or delete on public.rate_cards
  for each row execute function public.tg_rate_card_audit();

-- Resolve the hourly rate for (person, project, date): most recent card at or
-- before the work date — project card first, then the client default. Within a
-- card a person line beats a role line. Never "current rate".
create or replace function public.resolve_rate(
  p_user_id uuid, p_project_id uuid, p_work_date date
)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_role text;
  v_rate bigint;
begin
  select client_id into v_client_id from public.projects where id = p_project_id;

  select role_on_project into v_role
  from public.assignments
  where user_id = p_user_id and project_id = p_project_id
    and start_date <= p_work_date and (end_date is null or end_date >= p_work_date)
  order by start_date desc
  limit 1;

  select l.hourly_rate_minor into v_rate
  from public.rate_cards c
  join public.rate_card_lines l on l.rate_card_id = c.id
  where c.effective_from <= p_work_date
    and (c.project_id = p_project_id or c.client_id = v_client_id)
    and (l.user_id = p_user_id or (v_role is not null and l.role_name = v_role))
  order by
    (c.project_id is not null) desc,  -- project card beats client default
    c.effective_from desc,            -- most recent version
    (l.user_id is not null) desc      -- person line beats role line
  limit 1;

  return v_rate;  -- null = no rate configured (surfaced by generate_draft_invoice)
end;
$$;

-- ----------------------------------------------------------------------------
-- Milestones (fixed-price projects)
-- ----------------------------------------------------------------------------
create table public.milestones (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  name          text not null,
  amount_minor  bigint not null check (amount_minor >= 0),
  ready_to_bill boolean not null default false,
  invoice_id    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index milestones_project_idx on public.milestones (project_id);

create trigger set_updated_at before update on public.milestones
  for each row execute function public.tg_set_updated_at();

alter table public.milestones enable row level security;

create policy milestones_read on public.milestones
  for select using (public.has_role('finance') or public.has_role('pm'));
create policy milestones_write on public.milestones
  for all
  using (public.has_role('finance') or public.has_role('pm'))
  with check (public.has_role('finance') or public.has_role('pm'));

-- ----------------------------------------------------------------------------
-- Invoices
-- ----------------------------------------------------------------------------
create type public.invoice_kind as enum ('invoice', 'credit_note');

create table public.invoices (
  id                 uuid primary key default gen_random_uuid(),
  kind               public.invoice_kind not null default 'invoice',
  client_id          uuid not null references public.clients (id),
  number             text unique,
  period_start       date,
  period_end         date,
  status             text not null default 'draft'
                     check (status in ('draft', 'issued', 'paid', 'partially_paid', 'overdue', 'void')),
  currency           char(3) not null,
  subtotal_minor     bigint not null default 0,
  tax_total_minor    bigint not null default 0,
  total_minor        bigint not null default 0,
  issued_at          timestamptz,
  issued_by          uuid references public.profiles (id),
  due_date           date,
  void_reason        text,
  credits_invoice_id uuid references public.invoices (id),
  dunning_paused     boolean not null default false,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (kind <> 'credit_note' or credits_invoice_id is not null)
);

create index invoices_client_idx on public.invoices (client_id, created_at desc);
create index invoices_status_idx on public.invoices (status);

create trigger set_updated_at before update on public.invoices
  for each row execute function public.tg_set_updated_at();

alter table public.time_entries
  add constraint time_entries_invoice_fk
  foreign key (invoice_id) references public.invoices (id);

alter table public.milestones
  add constraint milestones_invoice_fk
  foreign key (invoice_id) references public.invoices (id);

create table public.invoice_lines (
  id               uuid primary key default gen_random_uuid(),
  invoice_id       uuid not null references public.invoices (id) on delete cascade,
  kind             text not null
                   check (kind in ('time', 'retainer', 'overage', 'milestone', 'manual')),
  description      text not null,
  quantity         numeric(10, 2) not null default 1,
  unit_price_minor bigint not null,
  amount_minor     bigint not null,
  tax_rate_pct     numeric(5, 2) not null default 0,
  group_key        text,
  position         int not null default 0
);

create index invoice_lines_invoice_idx on public.invoice_lines (invoice_id, position);

-- Line → time-entry traceability (FR-17)
create table public.invoice_line_entries (
  invoice_line_id uuid not null references public.invoice_lines (id) on delete cascade,
  time_entry_id   uuid not null references public.time_entries (id),
  primary key (invoice_line_id, time_entry_id)
);

create index invoice_line_entries_entry_idx on public.invoice_line_entries (time_entry_id);

create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references public.invoices (id),
  amount_minor bigint not null check (amount_minor > 0),
  paid_at      date not null default current_date,
  method       text,
  note         text,
  recorded_by  uuid references public.profiles (id),
  created_at   timestamptz not null default now()
);

create index payments_invoice_idx on public.payments (invoice_id);

-- Invoice number counters, claimed under row lock inside issue_invoice.
create table public.invoice_counters (
  kind       public.invoice_kind not null,
  year       int not null,
  last_value int not null default 0,
  primary key (kind, year)
);

-- ----------------------------------------------------------------------------
-- Guards: issued invoices are frozen (except workflow columns changed via RPC);
-- lines editable only while the invoice is draft; payments append-only.
-- ----------------------------------------------------------------------------
create or replace function public.tg_invoices_guard()
returns trigger
language plpgsql
as $$
declare
  via_rpc boolean := coalesce(current_setting('app.via_rpc', true), '') = 'on';
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' or not via_rpc then
      raise exception 'Invoices are deleted only as drafts via delete_draft_invoice()';
    end if;
    return old;
  end if;

  if old.status <> 'draft' and not via_rpc then
    raise exception 'Issued invoices are immutable; use a credit note';
  end if;
  if new.status is distinct from old.status and not via_rpc then
    raise exception 'Invoice status changes only through workflow actions';
  end if;
  -- Even a draft never changes identity fields client-side.
  if (new.number is distinct from old.number
      or new.kind is distinct from old.kind
      or new.client_id is distinct from old.client_id) and not via_rpc then
    raise exception 'Invoice number/kind/client are system-managed';
  end if;
  return new;
end;
$$;

create trigger invoices_guard
  before update or delete on public.invoices
  for each row execute function public.tg_invoices_guard();

create or replace function public.tg_invoice_lines_guard()
returns trigger
language plpgsql
as $$
declare
  via_rpc boolean := coalesce(current_setting('app.via_rpc', true), '') = 'on';
  inv_status text;
begin
  select status into inv_status from public.invoices
    where id = coalesce(new.invoice_id, old.invoice_id);
  if inv_status <> 'draft' and not via_rpc then
    raise exception 'Lines of a non-draft invoice are immutable';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger invoice_lines_guard
  before insert or update or delete on public.invoice_lines
  for each row execute function public.tg_invoice_lines_guard();

create trigger payments_immutable
  before update or delete on public.payments
  for each row execute function public.tg_forbid_change();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.invoice_line_entries enable row level security;
alter table public.payments enable row level security;

create policy invoices_finance_all on public.invoices
  for all using (public.has_role('finance')) with check (public.has_role('finance'));
create policy invoice_lines_finance_all on public.invoice_lines
  for all using (public.has_role('finance')) with check (public.has_role('finance'));
create policy invoice_line_entries_finance_read on public.invoice_line_entries
  for select using (public.has_role('finance'));
create policy payments_finance_read on public.payments
  for select using (public.has_role('finance'));
-- Payments are inserted via record_payment() only (append-only trail).

-- ----------------------------------------------------------------------------
-- Draft invoice generation (FR-12/13): T&M entries priced by effective rate
-- card, retainer + overage lines, ready-to-bill milestones, grouped per the
-- client's preference. Entries already on a live invoice are excluded.
-- ----------------------------------------------------------------------------
create or replace function public.generate_draft_invoice(
  p_client_id uuid, p_period_start date, p_period_end date
)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  cl   public.clients%rowtype;
  inv  public.invoices%rowtype;
  grp  record;
  line_id uuid;
  pos  int := 0;
  missing_rates int;
  v_line_total bigint := 0;
begin
  if not public.has_role('finance') then
    raise exception 'Finance role required' using errcode = '42501';
  end if;

  select * into cl from public.clients where id = p_client_id;
  if not found then
    raise exception 'Client not found';
  end if;

  perform set_config('app.via_rpc', 'on', true);

  -- Fail loudly if any billable approved entry has no resolvable rate.
  select count(*) into missing_rates
  from public.time_entries te
  join public.projects p on p.id = te.project_id
  where p.client_id = p_client_id
    and p.billing_model = 'tm'
    and te.status = 'approved'
    and te.billable
    and te.invoice_id is null
    and te.work_date between p_period_start and p_period_end
    and public.resolve_rate(te.user_id, te.project_id, te.work_date) is null
    and not exists (
      select 1
      from public.invoice_line_entries ile
      join public.invoice_lines il on il.id = ile.invoice_line_id
      join public.invoices i on i.id = il.invoice_id
      where ile.time_entry_id = te.id and i.status <> 'void'
    );
  if missing_rates > 0 then
    raise exception '% approved entries have no rate card rate — configure rates first', missing_rates;
  end if;

  insert into public.invoices (client_id, period_start, period_end, currency, notes)
  values (p_client_id, p_period_start, p_period_end, cl.currency,
          'Draft for ' || to_char(p_period_start, 'YYYY-MM-DD') || ' → ' || to_char(p_period_end, 'YYYY-MM-DD'))
  returning * into inv;

  -- 1) T&M time lines, grouped per client preference. A rate change mid-period
  --    yields separate lines because rate is part of the grouping key.
  for grp in
    select
      case cl.invoice_grouping
        when 'project'  then pr.name
        when 'person'   then pf.full_name
        when 'role'     then coalesce(a.role_on_project, pf.title, pf.full_name)
        else pr.name || ' — ' || pf.full_name || coalesce(' — ' || t.name, '')
      end as group_label,
      public.resolve_rate(te.user_id, te.project_id, te.work_date) as rate_minor,
      sum(te.hours) as total_hours,
      array_agg(te.id) as entry_ids
    from public.time_entries te
    join public.projects pr on pr.id = te.project_id
    join public.profiles pf on pf.id = te.user_id
    left join public.tasks t on t.id = te.task_id
    left join lateral (
      select role_on_project from public.assignments a
      where a.user_id = te.user_id and a.project_id = te.project_id
        and a.start_date <= te.work_date
        and (a.end_date is null or a.end_date >= te.work_date)
      order by a.start_date desc limit 1
    ) a on true
    where pr.client_id = p_client_id
      and pr.billing_model = 'tm'
      and te.status = 'approved'
      and te.billable
      and te.invoice_id is null
      and te.work_date between p_period_start and p_period_end
      and not exists (
        select 1
        from public.invoice_line_entries ile
        join public.invoice_lines il on il.id = ile.invoice_line_id
        join public.invoices i on i.id = il.invoice_id
        where ile.time_entry_id = te.id and i.status <> 'void'
      )
    group by 1, 2
    order by 1
  loop
    pos := pos + 1;
    -- half-up rounding at line level (FR-14); totals are sums of rounded lines
    v_line_total := round(grp.total_hours * grp.rate_minor);
    insert into public.invoice_lines
      (invoice_id, kind, description, quantity, unit_price_minor, amount_minor, tax_rate_pct, group_key, position)
    values
      (inv.id, 'time',
       grp.group_label || ' (' || grp.total_hours || ' h)',
       grp.total_hours, grp.rate_minor, v_line_total, cl.tax_rate_pct, grp.group_label, pos)
    returning id into line_id;

    insert into public.invoice_line_entries (invoice_line_id, time_entry_id)
    select line_id, unnest(grp.entry_ids);
  end loop;

  -- 2) Retainer + overage lines for retainer projects active in the period.
  for grp in
    select pr.id, pr.name, pr.retainer_fee_minor, pr.retainer_included_hours,
           pr.retainer_overage_rate_minor,
           coalesce((
             select sum(te.hours) from public.time_entries te
             where te.project_id = pr.id
               and te.status = 'approved' and te.billable
               and te.work_date between p_period_start and p_period_end
           ), 0) as period_hours
    from public.projects pr
    where pr.client_id = p_client_id
      and pr.billing_model = 'retainer'
      and pr.status = 'active'
      and pr.retainer_fee_minor is not null
  loop
    pos := pos + 1;
    insert into public.invoice_lines
      (invoice_id, kind, description, quantity, unit_price_minor, amount_minor, tax_rate_pct, group_key, position)
    values
      (inv.id, 'retainer',
       grp.name || ' — monthly retainer',
       1, grp.retainer_fee_minor, grp.retainer_fee_minor, cl.tax_rate_pct, grp.name, pos);

    if grp.retainer_included_hours is not null
       and grp.period_hours > grp.retainer_included_hours
       and grp.retainer_overage_rate_minor is not null then
      pos := pos + 1;
      insert into public.invoice_lines
        (invoice_id, kind, description, quantity, unit_price_minor, amount_minor, tax_rate_pct, group_key, position)
      values
        (inv.id, 'overage',
         grp.name || ' — hours beyond retainer ('
           || (grp.period_hours - grp.retainer_included_hours) || ' h)',
         grp.period_hours - grp.retainer_included_hours,
         grp.retainer_overage_rate_minor,
         round((grp.period_hours - grp.retainer_included_hours) * grp.retainer_overage_rate_minor),
         cl.tax_rate_pct, grp.name, pos);
    end if;
  end loop;

  -- 3) Ready-to-bill milestones.
  for grp in
    select m.id, m.name, m.amount_minor, pr.name as project_name
    from public.milestones m
    join public.projects pr on pr.id = m.project_id
    where pr.client_id = p_client_id
      and m.ready_to_bill
      and m.invoice_id is null
  loop
    pos := pos + 1;
    insert into public.invoice_lines
      (invoice_id, kind, description, quantity, unit_price_minor, amount_minor, tax_rate_pct, group_key, position)
    values
      (inv.id, 'milestone',
       grp.project_name || ' — ' || grp.name,
       1, grp.amount_minor, grp.amount_minor, cl.tax_rate_pct, grp.project_name, pos);
    update public.milestones set invoice_id = inv.id where id = grp.id;
  end loop;

  perform public.recompute_invoice_totals(inv.id);
  perform public.write_audit('invoice.generate_draft', 'invoice', inv.id::text,
    jsonb_build_object('client_id', p_client_id, 'period_start', p_period_start,
                       'period_end', p_period_end));

  select * into inv from public.invoices where id = inv.id;
  return inv;
end;
$$;

create or replace function public.recompute_invoice_totals(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.via_rpc', 'on', true);
  update public.invoices i
  set subtotal_minor = coalesce(t.subtotal, 0),
      tax_total_minor = coalesce(t.tax, 0),
      total_minor = coalesce(t.subtotal, 0) + coalesce(t.tax, 0)
  from (
    select sum(amount_minor) as subtotal,
           sum(round(amount_minor * tax_rate_pct / 100.0)) as tax
    from public.invoice_lines
    where invoice_id = p_invoice_id
  ) t
  where i.id = p_invoice_id;
end;
$$;

-- Recompute totals whenever a draft's lines change (manual lines etc.).
create or replace function public.tg_lines_recompute()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recompute_invoice_totals(coalesce(new.invoice_id, old.invoice_id));
  return null;
end;
$$;

create trigger invoice_lines_recompute
  after insert or update or delete on public.invoice_lines
  for each row execute function public.tg_lines_recompute();

-- ----------------------------------------------------------------------------
-- issue_invoice: claim number, freeze, stamp entries — one transaction (FR-17).
-- ----------------------------------------------------------------------------
create or replace function public.issue_invoice(p_invoice_id uuid)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invoices%rowtype;
  cs  public.company_settings%rowtype;
  n   int;
  new_number text;
begin
  perform set_config('app.via_rpc', 'on', true);

  -- Row lock prevents two finance users issuing the same draft (NFR-7).
  select * into inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found';
  end if;

  perform public.fsm_transition('invoice', inv.id::text, 'issue', inv.status);

  if not exists (select 1 from public.invoice_lines where invoice_id = inv.id) then
    raise exception 'Cannot issue an empty invoice';
  end if;

  select * into cs from public.company_settings;

  insert into public.invoice_counters (kind, year, last_value)
  values (inv.kind, extract(year from now())::int, 1)
  on conflict (kind, year)
    do update set last_value = public.invoice_counters.last_value + 1
  returning last_value into n;

  new_number :=
    case inv.kind when 'invoice' then cs.invoice_prefix else cs.credit_note_prefix end
    || '-' || extract(year from now())::int
    || '-' || lpad(n::text, 4, '0');

  update public.invoices
  set status = 'issued',
      number = new_number,
      issued_at = now(),
      issued_by = auth.uid(),
      due_date = current_date + (
        select payment_terms_days from public.clients where id = inv.client_id)
  where id = inv.id
  returning * into inv;

  -- Stamp every included time entry (invoice_id set exactly once, at issue).
  update public.time_entries te
  set invoice_id = inv.id
  from public.invoice_line_entries ile
  join public.invoice_lines il on il.id = ile.invoice_line_id
  where il.invoice_id = inv.id
    and te.id = ile.time_entry_id;

  perform public.feed_event('invoice.issued', 'invoice', inv.id::text,
    inv.number || ' issued to ' ||
    (select name from public.clients where id = inv.client_id) ||
    ' for ' || (inv.total_minor / 100.0) || ' ' || inv.currency);

  return inv;
end;
$$;

-- ----------------------------------------------------------------------------
-- delete_draft_invoice: drafts can be discarded; the FSM history records it.
-- ----------------------------------------------------------------------------
create or replace function public.delete_draft_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invoices%rowtype;
begin
  perform set_config('app.via_rpc', 'on', true);
  select * into inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found';
  end if;
  perform public.fsm_transition('invoice', inv.id::text, 'delete_draft', inv.status);
  update public.milestones set invoice_id = null where invoice_id = inv.id;
  delete from public.invoices where id = inv.id;
end;
$$;

-- ----------------------------------------------------------------------------
-- void_invoice: not collectible; releases nothing (corrections = credit notes).
-- ----------------------------------------------------------------------------
create or replace function public.void_invoice(p_invoice_id uuid, p_reason text)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invoices%rowtype;
begin
  perform set_config('app.via_rpc', 'on', true);
  select * into inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found';
  end if;
  perform public.fsm_transition('invoice', inv.id::text, 'void', inv.status, p_reason);
  update public.invoices
  set status = 'void', void_reason = p_reason
  where id = inv.id
  returning * into inv;
  return inv;
end;
$$;

-- ----------------------------------------------------------------------------
-- create_credit_note: negative invoice referencing the original, issued
-- immediately with a CN- number.
-- ----------------------------------------------------------------------------
create or replace function public.create_credit_note(
  p_invoice_id uuid, p_amount_minor bigint, p_description text
)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  orig public.invoices%rowtype;
  cn   public.invoices%rowtype;
  cs   public.company_settings%rowtype;
  n    int;
begin
  perform set_config('app.via_rpc', 'on', true);

  select * into orig from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found';
  end if;
  if p_amount_minor <= 0 then
    raise exception 'Credit amount must be positive (it is applied as negative)';
  end if;

  perform public.fsm_transition('invoice', orig.id::text, 'credit_note', orig.status);

  select * into cs from public.company_settings;

  insert into public.invoices
    (kind, client_id, period_start, period_end, status, currency,
     credits_invoice_id, issued_at, issued_by, due_date, notes)
  values
    ('credit_note', orig.client_id, orig.period_start, orig.period_end, 'issued',
     orig.currency, orig.id, now(), auth.uid(), current_date,
     'Credit note for ' || orig.number)
  returning * into cn;

  insert into public.invoice_counters (kind, year, last_value)
  values ('credit_note', extract(year from now())::int, 1)
  on conflict (kind, year)
    do update set last_value = public.invoice_counters.last_value + 1
  returning last_value into n;

  update public.invoices
  set number = cs.credit_note_prefix || '-' || extract(year from now())::int
               || '-' || lpad(n::text, 4, '0')
  where id = cn.id;

  insert into public.invoice_lines
    (invoice_id, kind, description, quantity, unit_price_minor, amount_minor, tax_rate_pct, position)
  values
    (cn.id, 'manual', p_description, 1, -p_amount_minor, -p_amount_minor,
     (select tax_rate_pct from public.clients where id = orig.client_id), 1);

  perform public.recompute_invoice_totals(cn.id);
  perform public.feed_event('invoice.credit_note', 'invoice', cn.id::text,
    'Credit note against ' || orig.number || ' for ' || (p_amount_minor / 100.0) || ' ' || cn.currency);

  select * into cn from public.invoices where id = cn.id;
  return cn;
end;
$$;

-- ----------------------------------------------------------------------------
-- record_payment: append a payment; derive paid / partially_paid.
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
begin
  perform set_config('app.via_rpc', 'on', true);

  select * into inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found';
  end if;

  perform public.fsm_transition('invoice', inv.id::text, 'record_payment', inv.status);

  insert into public.payments (invoice_id, amount_minor, paid_at, method, note, recorded_by)
  values (p_invoice_id, p_amount_minor, p_paid_at, p_method, p_note, auth.uid());

  select coalesce(sum(amount_minor), 0) into paid_total
  from public.payments where invoice_id = p_invoice_id;

  update public.invoices
  set status = case when paid_total >= total_minor then 'paid' else 'partially_paid' end
  where id = p_invoice_id
  returning * into inv;

  if inv.status = 'paid' then
    perform public.feed_event('invoice.paid', 'invoice', inv.id::text,
      inv.number || ' fully paid');
  end if;

  return inv;
end;
$$;

-- Overdue derivation, called by the dunning job (idempotent).
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
  where status = 'issued'
    and kind = 'invoice'
    and due_date < current_date;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ----------------------------------------------------------------------------
-- HATEOAS for invoices
-- ----------------------------------------------------------------------------
create or replace function public.invoice_actions(p_invoice_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  inv public.invoices%rowtype;
  allowed text[];
begin
  select * into inv from public.invoices where id = p_invoice_id;
  if not found or not public.has_role('finance') then
    return '{}'::jsonb;
  end if;

  -- Credit notes support no further actions in v1.
  if inv.kind = 'credit_note' then
    return '{}'::jsonb;
  end if;

  return public.fsm_actions('invoice', inv.status, allowed);
end;
$$;
