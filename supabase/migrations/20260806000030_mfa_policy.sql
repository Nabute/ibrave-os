-- ----------------------------------------------------------------------------
-- MFA policy (TOTP via Supabase Auth). OFF by default; an admin can mandate it
--   * per role  — company_settings.mfa_required_roles (any user holding one)
--   * per user  — profiles.mfa_required
-- Enrollment/verification happen in the app (Preferences → Security). The
-- login flow steps up to AAL2 whenever the user has a verified factor; the
-- MFA gate blocks the workspace until enrollment when the policy demands it.
-- ----------------------------------------------------------------------------
alter table public.company_settings
  add column if not exists mfa_required_roles text[] not null default '{}';

alter table public.profiles
  add column if not exists mfa_required boolean not null default false;

comment on column public.company_settings.mfa_required_roles is
  'Roles for which TOTP MFA is mandatory (empty = not mandated by role)';
comment on column public.profiles.mfa_required is
  'Per-user MFA mandate (admin-set); overrides nothing, ORs with role policy';

-- Does the CURRENT user have to use MFA? (security definer: company_settings
-- is not readable by every role, but everyone may ask this one question)
create or replace function public.my_mfa_requirement()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((select p.mfa_required from public.profiles p where p.id = auth.uid()), false)
    or exists (
      select 1
      from public.user_roles ur, public.company_settings cs
      where ur.user_id = auth.uid()
        and ur.role::text = any (cs.mfa_required_roles));
$$;

grant execute on function public.my_mfa_requirement() to authenticated;

-- ----------------------------------------------------------------------------
-- Also from validation follow-ups: payment terms must be sane. (Negative terms
-- would issue invoices already overdue — verified possible during V3.)
-- ----------------------------------------------------------------------------
alter table public.clients
  add constraint clients_payment_terms_sane
  check (payment_terms_days between 0 and 365);
