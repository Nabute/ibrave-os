-- ============================================================================
-- 0018 EMAIL SENDER IDENTITIES
-- User-initiated email is never "noreply": people send as themselves (their
-- login email) or as a department identity (talent@…, finance@…) their role
-- entitles them to. The Edge Function validates the chosen From server-side
-- via can_use_email_identity() — the picker is convenience, not the boundary.
-- Automated jobs (dunning, reminders) keep the system address.
-- ============================================================================

create table public.email_identities (
  id           uuid primary key default gen_random_uuid(),
  email        text not null unique,
  display_name text not null,
  kind         text not null default 'department' check (kind in ('department', 'system')),
  -- which roles may send as this identity (owner/admin always may)
  allowed_roles public.app_role[] not null default '{}',
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

alter table public.email_identities enable row level security;

create policy email_identities_read on public.email_identities
  for select using (auth.uid() is not null);
create policy email_identities_admin on public.email_identities
  for all using (public.has_role('admin')) with check (public.has_role('admin'));

-- Demo defaults — replace with your real department addresses (the domain
-- must be verified in Resend).
insert into public.email_identities (email, display_name, kind, allowed_roles) values
  ('talent@ibrave.co',  'iBrave Talent',  'department', array['recruiter']::public.app_role[]),
  ('finance@ibrave.co', 'iBrave Finance', 'department', array['finance']::public.app_role[]),
  ('sales@ibrave.co',   'iBrave Sales',   'department', array['sales', 'account_owner']::public.app_role[]);

-- May p_user send as p_email? Their own login email always; a department
-- identity when a role matches (owner/admin pass everything).
create or replace function public.can_use_email_identity(p_user_id uuid, p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (select 1 from public.profiles
            where id = p_user_id and lower(email) = lower(p_email))
    or exists (
      select 1
      from public.email_identities ei
      where lower(ei.email) = lower(p_email)
        and ei.active
        and ei.kind = 'department'
        and exists (
          select 1 from public.user_roles ur
          where ur.user_id = p_user_id
            and (ur.role = any (ei.allowed_roles)
                 or ur.role in ('owner', 'admin'))));
$$;

-- The identities the current user may pick from (their own email first).
create or replace function public.my_email_identities()
returns table (email text, display_name text, kind text)
language sql
stable
security definer
set search_path = public
as $$
  select p.email, p.full_name, 'personal'
  from public.profiles p where p.id = auth.uid()
  union all
  select ei.email, ei.display_name, ei.kind
  from public.email_identities ei
  where ei.active and ei.kind = 'department'
    and exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and (ur.role = any (ei.allowed_roles)
             or ur.role in ('owner', 'admin')));
$$;

alter table public.email_log
  add column from_email text;
