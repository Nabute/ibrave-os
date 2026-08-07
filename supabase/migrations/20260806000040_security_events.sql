-- ============================================================================
-- 0040 SECURITY EVENTS
-- Central, queryable security event trail for OWASP A09 logging/alerting.
-- ============================================================================

create table public.security_events (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles (id) on delete set null,
  event_type  text not null,
  severity    text not null default 'info'
              check (severity in ('info', 'low', 'medium', 'high', 'critical')),
  source      text not null
              check (source in ('frontend', 'edge_function', 'database', 'admin')),
  entity_type text,
  entity_id   text,
  ip          inet,
  user_agent  text,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index security_events_created_idx on public.security_events (created_at desc);
create index security_events_severity_idx on public.security_events (severity, created_at desc);
create index security_events_actor_idx on public.security_events (actor_id, created_at desc)
  where actor_id is not null;
create index security_events_type_idx on public.security_events (event_type, created_at desc);

alter table public.security_events enable row level security;

create policy security_events_admin_read on public.security_events
  for select using (public.has_role('admin') or public.has_role('owner'));

comment on table public.security_events is
  'Append-only security events for access denials, suspicious requests, and operational security review.';

create or replace function public.record_security_event(
  p_event_type text,
  p_severity text default 'info',
  p_source text default 'frontend',
  p_entity_type text default null,
  p_entity_id text default null,
  p_detail jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  event_id bigint;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_severity not in ('info', 'low', 'medium', 'high', 'critical') then
    raise exception 'Unsupported security event severity';
  end if;

  if p_source not in ('frontend', 'edge_function', 'database', 'admin') then
    raise exception 'Unsupported security event source';
  end if;

  insert into public.security_events
    (actor_id, event_type, severity, source, entity_type, entity_id, detail)
  values
    (auth.uid(), left(trim(p_event_type), 120), p_severity, p_source,
     nullif(left(coalesce(p_entity_type, ''), 80), ''),
     nullif(left(coalesce(p_entity_id, ''), 160), ''),
     coalesce(p_detail, '{}'::jsonb))
  returning id into event_id;

  return event_id;
end;
$$;

revoke all on function public.record_security_event(text, text, text, text, text, jsonb) from public;
grant execute on function public.record_security_event(text, text, text, text, text, jsonb)
  to authenticated;
