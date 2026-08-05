-- ============================================================================
-- 0008 CRON → EDGE FUNCTIONS
-- pg_cron triggers the email-sending Edge Functions via pg_net. The function
-- URL and the shared CRON_SECRET live in Supabase Vault, so no secret is
-- baked into a migration. Until both vault secrets exist the invoker records
-- a 'skipped' automation run and does nothing — safe to deploy first,
-- activate later.
--
-- Activate (SQL editor, once per environment):
--   select vault.create_secret('https://<project-ref>.supabase.co', 'edge_base_url');
--   select vault.create_secret('<value of CRON_SECRET>', 'cron_secret');
-- ============================================================================

create extension if not exists pg_net;

create or replace function public.invoke_edge_function(p_fn text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  base_url text;
  secret   text;
begin
  select decrypted_secret into base_url
  from vault.decrypted_secrets where name = 'edge_base_url';
  select decrypted_secret into secret
  from vault.decrypted_secrets where name = 'cron_secret';

  if base_url is null or secret is null then
    insert into public.automation_runs (job, run_key, status, detail)
    values ('invoke_edge:' || p_fn, 'day:' || current_date || ':' || clock_timestamp(),
            'skipped', jsonb_build_object('reason', 'vault secrets edge_base_url/cron_secret not set'))
    on conflict do nothing;
    return;
  end if;

  perform net.http_post(
    url := rtrim(base_url, '/') || '/functions/v1/' || p_fn,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || secret,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
end;
$$;

-- Only the scheduler needs this; revoke from API roles.
revoke execute on function public.invoke_edge_function(text) from public, authenticated, anon;

-- Email legs run shortly after the SQL jobs have written their notifications.
select cron.schedule('edge-reminders', '15 6 * * 1', $$select public.invoke_edge_function('reminders')$$);
select cron.schedule('edge-dunning',   '15 5 * * *', $$select public.invoke_edge_function('dunning')$$);
