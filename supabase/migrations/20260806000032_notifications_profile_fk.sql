-- ----------------------------------------------------------------------------
-- Repoint notifications.user_id at profiles(id) instead of auth.users(id) —
-- same fix as user_roles in migration 26. Without a FK PostgREST can walk,
-- the reminders email leg's `profiles:user_id(...)` embed errored and (being
-- unchecked in the old code) silently emailed nothing. Profiles are 1:1 with
-- auth.users and auto-created before any notification can reference them, so
-- cascade behaviour is unchanged.
-- ----------------------------------------------------------------------------
alter table public.notifications
  drop constraint notifications_user_id_fkey;

alter table public.notifications
  add constraint notifications_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;
