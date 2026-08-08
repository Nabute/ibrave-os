-- ============================================================================
-- 0043 PRODUCTIVITY INTEGRATIONS
-- Normalized delivery/productivity artifacts synced from GitHub, Jira, Linear,
-- Google/Microsoft Calendar, Slack and Teams. Raw provider payloads remain in
-- metadata; the columns below are the operational fields users need to scan.
-- ============================================================================

create table public.productivity_external_items (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces (id) on delete cascade default public.current_workspace_id(),
  connection_id     uuid not null references public.integration_connections (id) on delete cascade,
  provider          public.integration_provider not null,
  project_id        uuid references public.projects (id) on delete set null,
  client_id         uuid references public.clients (id) on delete set null,
  external_type     text not null check (external_type in ('issue', 'pull_request', 'event', 'message', 'channel', 'team')),
  external_id       text not null,
  external_key      text,
  title             text not null,
  status            text,
  priority          text,
  assignee          text,
  external_url      text,
  occurred_at       timestamptz,
  due_at            timestamptz,
  last_seen_at      timestamptz not null default now(),
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (workspace_id, provider, connection_id, external_type, external_id)
);

create index productivity_external_items_project_idx
  on public.productivity_external_items (workspace_id, project_id, provider, last_seen_at desc);

create index productivity_external_items_client_idx
  on public.productivity_external_items (workspace_id, client_id, provider, last_seen_at desc);

create index productivity_external_items_status_idx
  on public.productivity_external_items (workspace_id, status)
  where status is not null;

create trigger set_updated_at before update on public.productivity_external_items
  for each row execute function public.tg_set_updated_at();

alter table public.productivity_external_items enable row level security;

create policy productivity_external_items_member_read on public.productivity_external_items
  for select using (public.is_workspace_member(workspace_id));

create policy productivity_external_items_integration_write on public.productivity_external_items
  for all using (
    public.has_workspace_role(workspace_id, 'admin')
    or public.has_workspace_role(workspace_id, 'owner')
    or public.has_workspace_role(workspace_id, 'pm')
    or public.has_workspace_role(workspace_id, 'account_owner')
  )
  with check (
    public.has_workspace_role(workspace_id, 'admin')
    or public.has_workspace_role(workspace_id, 'owner')
    or public.has_workspace_role(workspace_id, 'pm')
    or public.has_workspace_role(workspace_id, 'account_owner')
  );

insert into public.workspace_setup_steps (workspace_id, key, label, status)
values
  ('00000000-0000-4000-8000-000000000001', 'delivery_integration', 'Delivery/productivity integration', 'pending')
on conflict (workspace_id, key) do nothing;

comment on table public.productivity_external_items is
  'Normalized productivity artifacts synced from GitHub, Jira, Linear, calendars, Slack and Teams.';
