-- ============================================================================
-- 0042 PRODUCTIZATION FOUNDATION
-- Durable tables for the remaining SaaS gaps: guided onboarding, imports,
-- integrations, accounting/payment reconciliation, client portal, UX state,
-- and commercial trust artifacts. Provider-specific sync jobs and UI flows
-- build on these records.
-- ============================================================================

create type public.integration_provider as enum (
  'quickbooks',
  'xero',
  'netsuite',
  'stripe',
  'wise',
  'bank_csv',
  'jira',
  'linear',
  'github',
  'google_calendar',
  'microsoft_calendar',
  'slack',
  'teams'
);

create type public.integration_status as enum ('connected', 'paused', 'error', 'disconnected');
create type public.import_status as enum ('draft', 'validating', 'ready', 'committed', 'failed', 'cancelled');
create type public.client_portal_status as enum ('invited', 'active', 'suspended');
create type public.client_approval_status as enum ('requested', 'approved', 'rejected', 'cancelled');

-- ----------------------------------------------------------------------------
-- Guided onboarding and imports
-- ----------------------------------------------------------------------------
create table public.workspace_setup_steps (
  workspace_id uuid not null references public.workspaces (id) on delete cascade default public.current_workspace_id(),
  key          text not null,
  label        text not null,
  status       text not null default 'pending' check (status in ('pending', 'in_progress', 'done', 'skipped')),
  completed_by uuid references public.profiles (id),
  completed_at timestamptz,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (workspace_id, key)
);

create trigger set_updated_at before update on public.workspace_setup_steps
  for each row execute function public.tg_set_updated_at();

create table public.onboarding_import_batches (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade default public.current_workspace_id(),
  import_type    text not null check (import_type in (
    'people',
    'clients',
    'projects',
    'assignments',
    'rate_cards',
    'opening_balances',
    'invoices',
    'time_entries'
  )),
  filename       text,
  status         public.import_status not null default 'draft',
  column_map     jsonb not null default '{}'::jsonb,
  summary        jsonb not null default '{}'::jsonb,
  created_by     uuid references public.profiles (id),
  committed_by   uuid references public.profiles (id),
  committed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger set_updated_at before update on public.onboarding_import_batches
  for each row execute function public.tg_set_updated_at();

create table public.onboarding_import_rows (
  id          bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade default public.current_workspace_id(),
  batch_id    uuid not null references public.onboarding_import_batches (id) on delete cascade,
  row_number  int not null,
  raw_data    jsonb not null,
  normalized  jsonb not null default '{}'::jsonb,
  status      text not null default 'pending' check (status in ('pending', 'valid', 'invalid', 'committed', 'skipped')),
  errors      jsonb not null default '[]'::jsonb,
  target_type text,
  target_id   text,
  created_at  timestamptz not null default now(),
  unique (batch_id, row_number)
);

-- ----------------------------------------------------------------------------
-- Integrations and sync audit
-- ----------------------------------------------------------------------------
create table public.integration_connections (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces (id) on delete cascade default public.current_workspace_id(),
  provider          public.integration_provider not null,
  status            public.integration_status not null default 'connected',
  display_name      text not null,
  external_tenant_id text,
  token_secret_name text,
  config            jsonb not null default '{}'::jsonb,
  connected_by      uuid references public.profiles (id),
  last_sync_at      timestamptz,
  error_message     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (workspace_id, provider, external_tenant_id)
);

create trigger set_updated_at before update on public.integration_connections
  for each row execute function public.tg_set_updated_at();

create table public.integration_sync_runs (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade default public.current_workspace_id(),
  connection_id  uuid not null references public.integration_connections (id) on delete cascade,
  direction      text not null check (direction in ('pull', 'push', 'bidirectional')),
  object_type    text not null,
  status         text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  started_at     timestamptz,
  finished_at    timestamptz,
  counts         jsonb not null default '{}'::jsonb,
  error_message  text,
  created_at     timestamptz not null default now()
);

create table public.external_record_links (
  workspace_id      uuid not null references public.workspaces (id) on delete cascade default public.current_workspace_id(),
  provider          public.integration_provider not null,
  connection_id     uuid references public.integration_connections (id) on delete cascade,
  local_entity_type text not null,
  local_entity_id   text not null,
  external_id       text not null,
  external_url      text,
  last_seen_at      timestamptz not null default now(),
  metadata          jsonb not null default '{}'::jsonb,
  primary key (workspace_id, provider, local_entity_type, local_entity_id, external_id)
);

-- ----------------------------------------------------------------------------
-- Tax, payments, and reconciliation
-- ----------------------------------------------------------------------------
create table public.tax_rates (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade default public.current_workspace_id(),
  name         text not null,
  country_code char(2),
  rate_pct     numeric(7, 4) not null check (rate_pct >= 0 and rate_pct <= 100),
  reverse_charge boolean not null default false,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (workspace_id, name, country_code, rate_pct, reverse_charge)
);

create trigger set_updated_at before update on public.tax_rates
  for each row execute function public.tg_set_updated_at();

create table public.bank_statement_imports (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade default public.current_workspace_id(),
  source       text not null default 'csv',
  filename     text,
  currency     char(3),
  status       public.import_status not null default 'draft',
  created_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger set_updated_at before update on public.bank_statement_imports
  for each row execute function public.tg_set_updated_at();

create table public.bank_statement_rows (
  id             bigint generated always as identity primary key,
  import_id      uuid not null references public.bank_statement_imports (id) on delete cascade,
  workspace_id   uuid not null references public.workspaces (id) on delete cascade default public.current_workspace_id(),
  posted_at      date not null,
  description    text not null,
  amount_minor   bigint not null,
  currency       char(3) not null,
  counterparty   text,
  reference      text,
  raw_data       jsonb not null default '{}'::jsonb,
  matched_payment_id uuid references public.payments (id),
  created_at     timestamptz not null default now()
);

create table public.payment_reconciliation_matches (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces (id) on delete cascade default public.current_workspace_id(),
  bank_row_id       bigint not null references public.bank_statement_rows (id) on delete cascade,
  invoice_id        uuid references public.invoices (id) on delete set null,
  payment_id        uuid references public.payments (id) on delete set null,
  confidence_pct    numeric(5, 2) not null default 0 check (confidence_pct >= 0 and confidence_pct <= 100),
  status            text not null default 'suggested' check (status in ('suggested', 'confirmed', 'rejected')),
  reason            text,
  confirmed_by      uuid references public.profiles (id),
  confirmed_at      timestamptz,
  created_at        timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Client portal
-- ----------------------------------------------------------------------------
create table public.client_portal_users (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade default public.current_workspace_id(),
  client_id    uuid not null references public.clients (id) on delete cascade,
  email        text not null,
  full_name    text,
  status       public.client_portal_status not null default 'invited',
  invited_by   uuid references public.profiles (id),
  last_seen_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index client_portal_users_workspace_client_email_idx
  on public.client_portal_users (workspace_id, client_id, lower(email));

create trigger set_updated_at before update on public.client_portal_users
  for each row execute function public.tg_set_updated_at();

create table public.client_documents (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade default public.current_workspace_id(),
  client_id     uuid not null references public.clients (id) on delete cascade,
  project_id    uuid references public.projects (id) on delete set null,
  uploaded_by   uuid references public.profiles (id),
  title         text not null,
  storage_path  text not null,
  content_type  text,
  visibility    text not null default 'internal' check (visibility in ('internal', 'client')),
  created_at    timestamptz not null default now()
);

create table public.client_approval_requests (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade default public.current_workspace_id(),
  client_id      uuid not null references public.clients (id) on delete cascade,
  project_id     uuid references public.projects (id) on delete set null,
  invoice_id     uuid references public.invoices (id) on delete set null,
  title          text not null,
  body           text,
  status         public.client_approval_status not null default 'requested',
  requested_by   uuid references public.profiles (id),
  decided_by_email text,
  decided_at     timestamptz,
  decision_note  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger set_updated_at before update on public.client_approval_requests
  for each row execute function public.tg_set_updated_at();

-- ----------------------------------------------------------------------------
-- UX state: saved views and report drill-downs
-- ----------------------------------------------------------------------------
create table public.user_saved_views (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade default public.current_workspace_id(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  surface      text not null,
  name         text not null,
  config       jsonb not null default '{}'::jsonb,
  is_default   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (workspace_id, user_id, surface, name)
);

create trigger set_updated_at before update on public.user_saved_views
  for each row execute function public.tg_set_updated_at();

create table public.report_drilldown_snapshots (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade default public.current_workspace_id(),
  report_key   text not null,
  params       jsonb not null default '{}'::jsonb,
  source_refs  jsonb not null default '[]'::jsonb,
  created_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Commercial trust layer
-- ----------------------------------------------------------------------------
create table public.trust_artifacts (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  artifact_type text not null check (artifact_type in (
    'dpa',
    'subprocessors',
    'sla',
    'backup_dr',
    'incident_response',
    'soc2_evidence',
    'security_policy',
    'audit_export'
  )),
  title        text not null,
  storage_path text,
  public_url   text,
  status       text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  metadata     jsonb not null default '{}'::jsonb,
  created_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger set_updated_at before update on public.trust_artifacts
  for each row execute function public.tg_set_updated_at();

create table public.admin_audit_exports (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade default public.current_workspace_id(),
  requested_by uuid references public.profiles (id),
  range_start  timestamptz,
  range_end    timestamptz,
  status       text not null default 'queued' check (status in ('queued', 'running', 'ready', 'failed', 'expired')),
  storage_path text,
  error_message text,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '7 days'
);

-- ----------------------------------------------------------------------------
-- RLS policies
-- ----------------------------------------------------------------------------
do $$
declare
  tbl text;
  member_read_tables text[] := array[
    'workspace_setup_steps',
    'onboarding_import_batches',
    'onboarding_import_rows',
    'integration_connections',
    'integration_sync_runs',
    'external_record_links',
    'tax_rates',
    'bank_statement_imports',
    'bank_statement_rows',
    'payment_reconciliation_matches',
    'client_portal_users',
    'client_documents',
    'client_approval_requests',
    'user_saved_views',
    'report_drilldown_snapshots',
    'trust_artifacts',
    'admin_audit_exports'
  ];
begin
  foreach tbl in array member_read_tables loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format(
      'create policy %I on public.%I for select using (workspace_id is null or public.is_workspace_member(workspace_id))',
      tbl || '_member_read',
      tbl
    );
  end loop;
end;
$$;

create policy workspace_setup_steps_admin_write on public.workspace_setup_steps
  for all using (public.has_workspace_role(workspace_id, 'admin'))
  with check (public.has_workspace_role(workspace_id, 'admin'));

create policy onboarding_import_batches_admin_write on public.onboarding_import_batches
  for all using (public.has_workspace_role(workspace_id, 'admin'))
  with check (public.has_workspace_role(workspace_id, 'admin'));

create policy onboarding_import_rows_admin_write on public.onboarding_import_rows
  for all using (
    exists (
      select 1 from public.onboarding_import_batches b
      where b.id = batch_id and public.has_workspace_role(b.workspace_id, 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.onboarding_import_batches b
      where b.id = batch_id and public.has_workspace_role(b.workspace_id, 'admin')
    )
  );

create policy integration_connections_admin_write on public.integration_connections
  for all using (public.has_workspace_role(workspace_id, 'admin'))
  with check (public.has_workspace_role(workspace_id, 'admin'));

create policy accounting_foundation_finance_write on public.tax_rates
  for all using (public.has_workspace_role(workspace_id, 'finance'))
  with check (public.has_workspace_role(workspace_id, 'finance'));

create policy bank_imports_finance_write on public.bank_statement_imports
  for all using (public.has_workspace_role(workspace_id, 'finance'))
  with check (public.has_workspace_role(workspace_id, 'finance'));

create policy bank_rows_finance_write on public.bank_statement_rows
  for all using (public.has_workspace_role(workspace_id, 'finance'))
  with check (public.has_workspace_role(workspace_id, 'finance'));

create policy reconciliation_finance_write on public.payment_reconciliation_matches
  for all using (public.has_workspace_role(workspace_id, 'finance'))
  with check (public.has_workspace_role(workspace_id, 'finance'));

create policy client_portal_admin_write on public.client_portal_users
  for all using (public.has_workspace_role(workspace_id, 'admin') or public.has_workspace_role(workspace_id, 'account_owner'))
  with check (public.has_workspace_role(workspace_id, 'admin') or public.has_workspace_role(workspace_id, 'account_owner'));

create policy client_documents_staff_write on public.client_documents
  for all using (
    public.has_workspace_role(workspace_id, 'account_owner')
    or public.has_workspace_role(workspace_id, 'pm')
    or public.has_workspace_role(workspace_id, 'finance')
  )
  with check (
    public.has_workspace_role(workspace_id, 'account_owner')
    or public.has_workspace_role(workspace_id, 'pm')
    or public.has_workspace_role(workspace_id, 'finance')
  );

create policy client_approval_requests_staff_write on public.client_approval_requests
  for all using (
    public.has_workspace_role(workspace_id, 'account_owner')
    or public.has_workspace_role(workspace_id, 'pm')
    or public.has_workspace_role(workspace_id, 'finance')
  )
  with check (
    public.has_workspace_role(workspace_id, 'account_owner')
    or public.has_workspace_role(workspace_id, 'pm')
    or public.has_workspace_role(workspace_id, 'finance')
  );

create policy user_saved_views_own_write on public.user_saved_views
  for all using (user_id = auth.uid() and public.is_workspace_member(workspace_id))
  with check (user_id = auth.uid() and public.is_workspace_member(workspace_id));

create policy report_drilldowns_member_write on public.report_drilldown_snapshots
  for insert with check (public.is_workspace_member(workspace_id));

create policy trust_artifacts_admin_write on public.trust_artifacts
  for all using (workspace_id is null or public.has_workspace_role(workspace_id, 'admin'))
  with check (workspace_id is null or public.has_workspace_role(workspace_id, 'admin'));

create policy admin_audit_exports_admin_write on public.admin_audit_exports
  for all using (public.has_workspace_role(workspace_id, 'admin') or public.has_workspace_role(workspace_id, 'owner'))
  with check (public.has_workspace_role(workspace_id, 'admin') or public.has_workspace_role(workspace_id, 'owner'));

insert into public.workspace_setup_steps (workspace_id, key, label, status)
values
  ('00000000-0000-4000-8000-000000000001', 'company_settings', 'Company settings', 'done'),
  ('00000000-0000-4000-8000-000000000001', 'people_import', 'Import people', 'pending'),
  ('00000000-0000-4000-8000-000000000001', 'clients_import', 'Import clients', 'pending'),
  ('00000000-0000-4000-8000-000000000001', 'projects_import', 'Import projects', 'pending'),
  ('00000000-0000-4000-8000-000000000001', 'rate_cards_import', 'Import rate cards', 'pending'),
  ('00000000-0000-4000-8000-000000000001', 'assignments_import', 'Import assignments', 'pending'),
  ('00000000-0000-4000-8000-000000000001', 'invoice_opening_balances', 'Opening invoice balances', 'pending'),
  ('00000000-0000-4000-8000-000000000001', 'client_portal', 'Client portal setup', 'pending'),
  ('00000000-0000-4000-8000-000000000001', 'accounting_integration', 'Accounting or payment integration', 'pending')
on conflict (workspace_id, key) do nothing;

comment on table public.onboarding_import_batches is
  'Guided onboarding import runs. Rows are staged and validated before commit.';
comment on table public.integration_connections is
  'Per-workspace external connections. OAuth tokens must live in Vault/secret storage, referenced by token_secret_name.';
comment on table public.client_portal_users is
  'Client-facing identities scoped to one workspace and client.';
comment on table public.trust_artifacts is
  'Commercial trust-center assets and SOC/SLA/DPA evidence metadata.';
