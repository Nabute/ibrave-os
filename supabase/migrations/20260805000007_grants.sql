-- ============================================================================
-- 0007 ROLE GRANTS
-- Newer Supabase defaults don't grant DML on new tables to the API roles;
-- grant explicitly. RLS remains the row-level gate on every table — these are
-- the coarse table-level permissions underneath it. The app requires login,
-- so `anon` gets nothing.
-- ============================================================================

-- Missed in 0005: counters are only ever touched inside SECURITY DEFINER RPCs.
alter table public.invoice_counters enable row level security;

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on all tables in schema public
  to authenticated, service_role;
grant usage, select on all sequences in schema public
  to authenticated, service_role;
grant execute on all functions in schema public
  to authenticated, service_role;

-- Future tables/functions created by migrations get the same grants.
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to authenticated, service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to authenticated, service_role;
