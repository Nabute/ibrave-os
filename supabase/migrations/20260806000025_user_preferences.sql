-- ----------------------------------------------------------------------------
-- User preferences (self-service account settings).
-- One jsonb bag on the profile; the user edits their own row via the existing
-- profiles_self_update policy, admin via profiles_admin_all. Known keys:
--   email_notifications  boolean (default true)  — master switch for system
--                        emails to this user (timesheet reminders, digests).
--   theme                'light' | 'dark'        — mirrored to localStorage;
--                        stored so it follows the user across devices.
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists preferences jsonb not null default '{}'::jsonb;

comment on column public.profiles.preferences is
  'Self-service user preferences (email_notifications, theme, …)';

-- ----------------------------------------------------------------------------
-- Client timezone: lets every client-facing screen show the client's local
-- time (IANA name, e.g. 'Europe/Berlin'). Rendering happens client-side via
-- Intl; the DB only stores the zone. Validated so a typo fails loudly on
-- write instead of silently breaking the clock.
-- ----------------------------------------------------------------------------
alter table public.clients
  add column if not exists timezone text;

alter table public.clients
  add constraint clients_timezone_valid
  check (timezone is null or now() at time zone timezone is not null);

comment on column public.clients.timezone is
  'IANA timezone of the client''s main office (drives local-time display)';

-- Seed the demo clients so the clock shows immediately.
update public.clients set timezone = 'Europe/Berlin'
  where code = 'ACME' and timezone is null;
update public.clients set timezone = 'America/New_York'
  where code = 'GLOB' and timezone is null;
