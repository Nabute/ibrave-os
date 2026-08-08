-- ============================================================================
-- 0041 TENANT FOUNDATION
-- Adds the workspace model needed for SaaS without breaking the current
-- single-company app paths. Follow-up migrations should replace legacy global
-- role/settings reads with workspace-scoped reads and tighten RLS per table.
-- ============================================================================

create table if not exists public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  status      text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  plan        text not null default 'internal',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger set_updated_at before update on public.workspaces
  for each row execute function public.tg_set_updated_at();

alter table public.workspaces enable row level security;

create table if not exists public.workspace_memberships (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  role         public.app_role not null,
  status       text not null default 'active' check (status in ('active', 'invited', 'suspended')),
  granted_by   uuid references public.profiles (id),
  granted_at   timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id, role)
);

create index if not exists workspace_memberships_user_idx
  on public.workspace_memberships (user_id, status, workspace_id);

alter table public.workspace_memberships enable row level security;

create table if not exists public.workspace_invites (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  email          text not null,
  roles          public.app_role[] not null default array['employee']::public.app_role[],
  token_hash     text not null unique,
  invited_by     uuid references public.profiles (id),
  accepted_by    uuid references public.profiles (id),
  status         text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at     timestamptz not null default now() + interval '14 days',
  accepted_at    timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists workspace_invites_workspace_email_idx
  on public.workspace_invites (workspace_id, lower(email), status);

alter table public.workspace_invites enable row level security;

create table if not exists public.workspace_settings (
  workspace_id                uuid primary key references public.workspaces (id) on delete cascade,
  company_name                text not null,
  legal_name                  text,
  address                     text,
  logo_url                    text,
  company_timezone            text not null default 'UTC',
  base_currency               char(3) not null default 'USD',
  invoice_prefix              text not null default 'INV',
  credit_note_prefix          text not null default 'CN',
  default_payment_terms_days  int not null default 30,
  default_tax_rate_pct        numeric(5, 2) not null default 0,
  bank_details                text,
  stale_entry_days            int not null default 14,
  approval_nudge_days         int not null default 3,
  mfa_required_roles          text[] not null default '{}',
  acct_ar                     text not null default '1200',
  acct_bank                   text not null default '1000',
  acct_revenue                text not null default '4000',
  acct_tax                    text not null default '2200',
  tagline                     text not null default 'Software Engineering & Outsourcing Services',
  tin                         text,
  registration_no             text,
  invoice_intro               text not null default
    'Professional software engineering services delivered in accordance with the submitted monthly time reports.',
  payment_instructions        text not null default
    'Payoneer payment request / international transfer details to be provided separately.',
  vat_note                    text not null default
    'Cross-border B2B service. VAT is not charged by the supplier; the customer accounts for applicable VAT under the reverse-charge mechanism.',
  contact_note                text not null default 'Invoice correspondence: via agreed client channel',
  issuer_name                 text,
  issuer_title                text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create trigger set_updated_at before update on public.workspace_settings
  for each row execute function public.tg_set_updated_at();

alter table public.workspace_settings enable row level security;

insert into public.workspaces (id, slug, name, plan)
values ('00000000-0000-4000-8000-000000000001', 'ibrave', 'ibrave', 'internal')
on conflict (id) do nothing;

insert into public.workspace_settings (
  workspace_id,
  company_name,
  legal_name,
  address,
  logo_url,
  company_timezone,
  base_currency,
  invoice_prefix,
  credit_note_prefix,
  default_payment_terms_days,
  default_tax_rate_pct,
  bank_details,
  stale_entry_days,
  approval_nudge_days,
  mfa_required_roles,
  acct_ar,
  acct_bank,
  acct_revenue,
  acct_tax,
  tagline,
  tin,
  registration_no,
  invoice_intro,
  payment_instructions,
  vat_note,
  contact_note,
  issuer_name,
  issuer_title
)
select
  '00000000-0000-4000-8000-000000000001',
  company_name,
  legal_name,
  address,
  logo_url,
  company_timezone,
  base_currency,
  invoice_prefix,
  credit_note_prefix,
  default_payment_terms_days,
  default_tax_rate_pct,
  bank_details,
  stale_entry_days,
  approval_nudge_days,
  coalesce(mfa_required_roles, '{}'),
  acct_ar,
  acct_bank,
  acct_revenue,
  acct_tax,
  tagline,
  tin,
  registration_no,
  invoice_intro,
  payment_instructions,
  vat_note,
  contact_note,
  issuer_name,
  issuer_title
from public.company_settings
on conflict (workspace_id) do nothing;

insert into public.workspace_memberships (workspace_id, user_id, role, granted_by, granted_at)
select
  '00000000-0000-4000-8000-000000000001',
  ur.user_id,
  ur.role,
  ur.granted_by,
  ur.granted_at
from public.user_roles ur
on conflict (workspace_id, user_id, role) do nothing;

insert into public.workspace_memberships (workspace_id, user_id, role)
select
  '00000000-0000-4000-8000-000000000001',
  p.id,
  'employee'::public.app_role
from public.profiles p
where not exists (
  select 1
  from public.workspace_memberships wm
  where wm.workspace_id = '00000000-0000-4000-8000-000000000001'
    and wm.user_id = p.id
)
on conflict (workspace_id, user_id, role) do nothing;

create or replace function public.current_workspace_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(current_setting('app.current_workspace_id', true), '')::uuid,
    (
      select wm.workspace_id
      from public.workspace_memberships wm
      join public.workspaces w on w.id = wm.workspace_id
      where wm.user_id = auth.uid()
        and wm.status = 'active'
        and w.status = 'active'
      order by wm.created_at, wm.workspace_id
      limit 1
    ),
    '00000000-0000-4000-8000-000000000001'::uuid
  );
$$;

create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_memberships wm
    join public.workspaces w on w.id = wm.workspace_id
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and w.status = 'active'
  );
$$;

create or replace function public.has_workspace_role(p_workspace_id uuid, check_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_memberships wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and (
        wm.role::text = check_role
        or wm.role in ('owner', 'admin')
      )
  );
$$;

create or replace function public.has_exact_workspace_role(p_workspace_id uuid, check_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_memberships wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.role::text = check_role
  );
$$;

-- Keep legacy app code working, but let new membership rows participate in the
-- same checks. Final tenant isolation should move callers to has_workspace_role.
create or replace function public.has_role(check_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_memberships wm
    where wm.workspace_id = public.current_workspace_id()
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and (wm.role::text = check_role or wm.role in ('owner', 'admin'))
  )
  or exists (
    select 1 from public.user_roles
    where user_id = auth.uid()
      and (role::text = check_role or role in ('owner', 'admin'))
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
    select 1 from public.workspace_memberships wm
    where wm.workspace_id = public.current_workspace_id()
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.role::text = check_role
  )
  or exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role::text = check_role
  );
$$;

create policy workspaces_member_read on public.workspaces
  for select using (public.is_workspace_member(id));

create policy workspaces_admin_update on public.workspaces
  for update using (public.has_workspace_role(id, 'admin'))
  with check (public.has_workspace_role(id, 'admin'));

create policy workspace_memberships_member_read on public.workspace_memberships
  for select using (
    user_id = auth.uid()
    or public.has_workspace_role(workspace_id, 'admin')
    or public.has_workspace_role(workspace_id, 'owner')
  );

create policy workspace_memberships_admin_write on public.workspace_memberships
  for all using (public.has_workspace_role(workspace_id, 'admin'))
  with check (public.has_workspace_role(workspace_id, 'admin'));

create policy workspace_invites_admin on public.workspace_invites
  for all using (public.has_workspace_role(workspace_id, 'admin'))
  with check (public.has_workspace_role(workspace_id, 'admin'));

create policy workspace_settings_read on public.workspace_settings
  for select using (public.is_workspace_member(workspace_id));

create policy workspace_settings_admin_write on public.workspace_settings
  for all using (public.has_workspace_role(workspace_id, 'admin'))
  with check (public.has_workspace_role(workspace_id, 'admin'));

do $$
declare
  tbl text;
  tenant_tables text[] := array[
    'audit_log',
    'notifications',
    'activity_feed',
    'automation_runs',
    'workflow_history',
    'clients',
    'contacts',
    'projects',
    'tasks',
    'assignments',
    'time_off',
    'time_entries',
    'rate_cards',
    'rate_card_lines',
    'milestones',
    'invoices',
    'invoice_lines',
    'invoice_line_entries',
    'payments',
    'invoice_counters',
    'cost_rates',
    'payout_statements',
    'payout_lines',
    'payout_line_entries',
    'skills',
    'person_skills',
    'staffing_requests',
    'leads',
    'lead_activities',
    'quotes',
    'quote_lines',
    'contracts',
    'account_activities',
    'opportunities',
    'escalations',
    'feedback_pulses',
    'account_health',
    'prospects',
    'prospect_activities',
    'cadences',
    'cadence_runs',
    'sales_tasks',
    'requisitions',
    'candidates',
    'candidate_activities',
    'interview_rounds',
    'offers',
    'onboarding_tasks',
    'engagements',
    'email_log',
    'calendar_events',
    'calendar_attendees',
    'email_identities',
    'owner_alert_rules',
    'email_templates',
    'privacy_requests',
    'privacy_retention_policies',
    'security_events'
  ];
begin
  foreach tbl in array tenant_tables loop
    if to_regclass(format('public.%I', tbl)) is not null then
      execute format(
        'alter table public.%I add column if not exists workspace_id uuid references public.workspaces (id) on delete restrict',
        tbl
      );
      execute format('alter table public.%I disable trigger user', tbl);
      execute format(
        'update public.%I set workspace_id = %L where workspace_id is null',
        tbl,
        '00000000-0000-4000-8000-000000000001'
      );
      execute format('alter table public.%I enable trigger user', tbl);
      execute format('alter table public.%I alter column workspace_id set default public.current_workspace_id()', tbl);
      execute format('alter table public.%I alter column workspace_id set not null', tbl);
      execute format('create index if not exists %I on public.%I (workspace_id)', tbl || '_workspace_idx', tbl);
    end if;
  end loop;
end;
$$;

comment on table public.workspaces is
  'Tenant root. All business data should be scoped to a workspace before external SaaS launch.';
comment on table public.workspace_memberships is
  'Tenant-scoped roles. Replaces global user_roles after frontend/edge functions are migrated.';
comment on table public.workspace_invites is
  'Tenant-scoped invitations. Store only token hashes, never raw invite tokens.';
comment on function public.has_role(text) is
  'Legacy role helper. Kept for compatibility; new code should prefer has_workspace_role(workspace_id, role).';
