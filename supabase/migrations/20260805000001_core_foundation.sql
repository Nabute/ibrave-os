-- ============================================================================
-- 0001 CORE FOUNDATION
-- Roles, profiles, company settings, audit log, notifications, activity feed,
-- automation runs, and shared helper functions.
-- ============================================================================

create extension if not exists pg_cron;

-- ----------------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- ----------------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Roles
-- ----------------------------------------------------------------------------
create type public.app_role as enum
  ('employee', 'pm', 'finance', 'recruiter', 'resourcing', 'sales', 'account_owner', 'owner', 'admin');

create table public.user_roles (
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       public.app_role not null,
  granted_by uuid references auth.users (id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- SECURITY DEFINER so RLS policies can call it without recursing into
-- user_roles' own policies.
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
      and (role::text = check_role
           or role in ('owner', 'admin'))
  );
$$;

create or replace function public.has_exact_role(check_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role::text = check_role
  );
$$;

alter table public.user_roles enable row level security;

create policy user_roles_select on public.user_roles
  for select using (user_id = auth.uid() or public.has_role('admin'));
create policy user_roles_admin_write on public.user_roles
  for all using (public.has_role('admin')) with check (public.has_role('admin'));

-- ----------------------------------------------------------------------------
-- Profiles (1:1 with auth.users; the app-facing person record)
-- ----------------------------------------------------------------------------
create type public.employment_type as enum ('employee', 'contractor');

create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  full_name       text not null,
  email           text not null unique,
  title           text,
  employment_type public.employment_type not null default 'employee',
  weekly_capacity_hours numeric(5, 2) not null default 40,
  timezone        text,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger set_updated_at before update on public.profiles
  for each row execute function public.tg_set_updated_at();

alter table public.profiles enable row level security;

-- Everyone in the company can see who works here; only admin edits others.
create policy profiles_select on public.profiles
  for select using (auth.uid() is not null);
create policy profiles_self_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin_all on public.profiles
  for all using (public.has_role('admin')) with check (public.has_role('admin'));

-- Auto-create a profile when an auth user is created.
create or replace function public.tg_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.tg_handle_new_user();

-- ----------------------------------------------------------------------------
-- Company settings (single row)
-- ----------------------------------------------------------------------------
create table public.company_settings (
  id                     boolean primary key default true check (id), -- singleton
  company_name           text not null default 'ibrave',
  legal_name             text,
  address                text,
  logo_url               text,
  company_timezone       text not null default 'Africa/Addis_Ababa',
  base_currency          char(3) not null default 'USD',
  invoice_prefix         text not null default 'INV',
  credit_note_prefix     text not null default 'CN',
  default_payment_terms_days int not null default 30,
  default_tax_rate_pct   numeric(5, 2) not null default 0,
  bank_details           text,
  stale_entry_days       int not null default 14,
  approval_nudge_days    int not null default 3,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create trigger set_updated_at before update on public.company_settings
  for each row execute function public.tg_set_updated_at();

alter table public.company_settings enable row level security;

create policy company_settings_select on public.company_settings
  for select using (auth.uid() is not null);
create policy company_settings_admin_write on public.company_settings
  for all using (public.has_role('admin')) with check (public.has_role('admin'));

insert into public.company_settings (id) values (true);

-- ----------------------------------------------------------------------------
-- Audit log (append-only)
-- ----------------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid references auth.users (id),
  action      text not null,
  entity_type text not null,
  entity_id   text not null,
  diff        jsonb,
  at          timestamptz not null default now()
);

create index audit_log_entity_idx on public.audit_log (entity_type, entity_id, at desc);
create index audit_log_actor_idx on public.audit_log (actor_id, at desc);

alter table public.audit_log enable row level security;

create policy audit_log_owner_read on public.audit_log
  for select using (public.has_role('owner'));
-- No insert/update/delete policies: rows are written only by SECURITY DEFINER
-- functions; the log is immutable to app users.

create or replace function public.write_audit(
  p_action text, p_entity_type text, p_entity_id text, p_diff jsonb default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.audit_log (actor_id, action, entity_type, entity_id, diff)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, p_diff);
$$;

create or replace function public.tg_forbid_change()
returns trigger
language plpgsql
as $$
begin
  raise exception '% rows are append-only (% not allowed)', tg_table_name, tg_op
    using errcode = 'P0001';
end;
$$;

create trigger audit_log_immutable
  before update or delete on public.audit_log
  for each row execute function public.tg_forbid_change();

-- ----------------------------------------------------------------------------
-- Notifications (in-app)
-- ----------------------------------------------------------------------------
create table public.notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text,
  link       text,
  payload    jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy notifications_own_select on public.notifications
  for select using (user_id = auth.uid());
create policy notifications_own_update on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.notify_user(
  p_user_id uuid, p_kind text, p_title text,
  p_body text default null, p_link text default null, p_payload jsonb default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, kind, title, body, link, payload)
  values (p_user_id, p_kind, p_title, p_body, p_link, p_payload);
$$;

-- ----------------------------------------------------------------------------
-- Company activity feed (denormalized, Module I-2)
-- ----------------------------------------------------------------------------
create table public.activity_feed (
  id          bigint generated always as identity primary key,
  event_type  text not null,
  entity_type text not null,
  entity_id   text not null,
  summary     text not null,
  actor_id    uuid references auth.users (id),
  at          timestamptz not null default now()
);

create index activity_feed_at_idx on public.activity_feed (at desc);
create index activity_feed_entity_idx on public.activity_feed (entity_type, entity_id);

alter table public.activity_feed enable row level security;

create policy activity_feed_read on public.activity_feed
  for select using (public.has_role('owner') or public.has_role('pm')
                    or public.has_role('finance'));

create or replace function public.feed_event(
  p_event_type text, p_entity_type text, p_entity_id text, p_summary text
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.activity_feed (event_type, entity_type, entity_id, summary, actor_id)
  values (p_event_type, p_entity_type, p_entity_id, p_summary, auth.uid());
$$;

-- ----------------------------------------------------------------------------
-- Automation runs (idempotency + audit for scheduled jobs)
-- ----------------------------------------------------------------------------
create table public.automation_runs (
  id          bigint generated always as identity primary key,
  job         text not null,
  run_key     text not null,             -- e.g. 'timesheet-reminder:2026-W32'
  ran_at      timestamptz not null default now(),
  status      text not null default 'ok' check (status in ('ok', 'error', 'skipped')),
  detail      jsonb,
  unique (job, run_key)
);

alter table public.automation_runs enable row level security;

create policy automation_runs_read on public.automation_runs
  for select using (public.has_role('admin'));
-- Written only by service-role Edge Functions (bypasses RLS).
