-- ----------------------------------------------------------------------------
-- Repoint user_roles.user_id at profiles(id) instead of auth.users(id).
-- Same ids (profiles is 1:1 with auth.users and auto-created by trigger
-- before any role insert), but the FK gives PostgREST the relationship it
-- needs to embed roles from profiles: `profiles.select("*, user_roles(role)")`
-- — the Admin → People query. Cascade behaviour is unchanged: deleting the
-- auth user deletes the profile, which now deletes the roles.
-- ----------------------------------------------------------------------------
alter table public.user_roles
  drop constraint user_roles_user_id_fkey;

alter table public.user_roles
  add constraint user_roles_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;
