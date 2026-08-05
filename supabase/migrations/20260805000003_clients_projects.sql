-- ============================================================================
-- 0003 CLIENTS, PROJECTS, TASKS, ASSIGNMENTS, TIME OFF
-- ============================================================================

create type public.project_status as enum ('active', 'paused', 'closed');
create type public.billing_model as enum ('tm', 'retainer', 'fixed');
create type public.invoice_grouping as enum ('project', 'person', 'role', 'detailed');

-- ----------------------------------------------------------------------------
-- Clients
-- ----------------------------------------------------------------------------
create table public.clients (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  legal_name         text,
  billing_address    text,
  contact_email      text,
  currency           char(3) not null default 'USD',
  payment_terms_days int not null default 30,
  tax_rate_pct       numeric(5, 2) not null default 0,
  invoice_grouping   public.invoice_grouping not null default 'project',
  timesheet_appendix boolean not null default false,
  notes              text,
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger set_updated_at before update on public.clients
  for each row execute function public.tg_set_updated_at();

alter table public.clients enable row level security;

create policy clients_staff_read on public.clients
  for select using (auth.uid() is not null);
create policy clients_finance_write on public.clients
  for all using (public.has_role('finance')) with check (public.has_role('finance'));

-- ----------------------------------------------------------------------------
-- Client contacts (Module G-2; billing contact used by dunning)
-- ----------------------------------------------------------------------------
create table public.contacts (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.clients (id) on delete cascade,
  name              text not null,
  email             text,
  phone             text,
  contact_role      text not null default 'general'
                    check (contact_role in ('billing', 'technical', 'decision_maker', 'champion', 'general')),
  preferred_channel text,
  opted_out         boolean not null default false,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index contacts_client_idx on public.contacts (client_id);

create trigger set_updated_at before update on public.contacts
  for each row execute function public.tg_set_updated_at();

alter table public.contacts enable row level security;

create policy contacts_staff_read on public.contacts
  for select using (auth.uid() is not null);
create policy contacts_finance_write on public.contacts
  for all using (public.has_role('finance')) with check (public.has_role('finance'));

-- ----------------------------------------------------------------------------
-- Projects
-- ----------------------------------------------------------------------------
create table public.projects (
  id                      uuid primary key default gen_random_uuid(),
  client_id               uuid not null references public.clients (id),
  name                    text not null,
  code                    text unique,
  status                  public.project_status not null default 'active',
  billing_model           public.billing_model not null default 'tm',
  -- retainer model fields (minor units)
  retainer_fee_minor      bigint,
  retainer_included_hours numeric(7, 2),
  retainer_overage_rate_minor bigint,
  budget_hours            numeric(9, 2),
  pm_id                   uuid references public.profiles (id),
  notes                   text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index projects_client_idx on public.projects (client_id);
create index projects_pm_idx on public.projects (pm_id);

create trigger set_updated_at before update on public.projects
  for each row execute function public.tg_set_updated_at();

-- Is the current user the PM of this project (or holds pm role broadly)?
create or replace function public.is_project_pm(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.projects p
    where p.id = p_project_id
      and (p.pm_id = auth.uid()
           or exists (select 1 from public.user_roles
                      where user_id = auth.uid() and role in ('owner', 'admin')))
  );
$$;

alter table public.projects enable row level security;

create policy projects_staff_read on public.projects
  for select using (auth.uid() is not null);
create policy projects_manage on public.projects
  for all
  using (public.has_role('finance') or public.has_role('pm'))
  with check (public.has_role('finance') or public.has_role('pm'));

-- ----------------------------------------------------------------------------
-- Tasks (optional per-project; entries must pick one when the list exists)
-- ----------------------------------------------------------------------------
create table public.tasks (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name       text not null,
  billable   boolean not null default true,
  status     text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_project_idx on public.tasks (project_id);

create trigger set_updated_at before update on public.tasks
  for each row execute function public.tg_set_updated_at();

alter table public.tasks enable row level security;

create policy tasks_staff_read on public.tasks
  for select using (auth.uid() is not null);
create policy tasks_pm_write on public.tasks
  for all
  using (public.is_project_pm(project_id) or public.has_role('finance'))
  with check (public.is_project_pm(project_id) or public.has_role('finance'));

-- ----------------------------------------------------------------------------
-- Assignments (B-2): person ↔ project, drives the timesheet grid + capacity
-- ----------------------------------------------------------------------------
create table public.assignments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id),
  project_id     uuid not null references public.projects (id),
  role_on_project text,
  start_date     date not null,
  end_date       date,
  allocation_pct numeric(5, 2) not null default 100 check (allocation_pct > 0 and allocation_pct <= 100),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create index assignments_user_idx on public.assignments (user_id);
create index assignments_project_idx on public.assignments (project_id);

create trigger set_updated_at before update on public.assignments
  for each row execute function public.tg_set_updated_at();

alter table public.assignments enable row level security;

create policy assignments_staff_read on public.assignments
  for select using (auth.uid() is not null);
create policy assignments_manage on public.assignments
  for all
  using (public.has_role('resourcing') or public.has_role('pm') or public.has_role('finance'))
  with check (public.has_role('resourcing') or public.has_role('pm') or public.has_role('finance'));

-- ----------------------------------------------------------------------------
-- Time off (B-6)
-- ----------------------------------------------------------------------------
create table public.time_off (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id),
  start_date date not null,
  end_date   date not null,
  kind       text not null default 'vacation'
             check (kind in ('vacation', 'sick', 'public_holiday', 'other')),
  note       text,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index time_off_user_idx on public.time_off (user_id, start_date);

alter table public.time_off enable row level security;

create policy time_off_read on public.time_off
  for select using (auth.uid() is not null);
create policy time_off_own_write on public.time_off
  for all
  using (user_id = auth.uid() or public.has_role('resourcing'))
  with check (user_id = auth.uid() or public.has_role('resourcing'));
