-- ============================================================================
-- 0039 PRIVACY GOVERNANCE
-- GDPR/European readiness primitives: data-subject request queue, self-service
-- export, and non-destructive retention review helpers.
-- ============================================================================

create table public.privacy_requests (
  id              uuid primary key default gen_random_uuid(),
  requester_id    uuid references public.profiles (id) on delete set null,
  requester_email text not null,
  request_type    text not null
                  check (request_type in ('access', 'portability', 'rectification',
                                           'erasure', 'restriction', 'objection', 'other')),
  details         text not null,
  status          text not null default 'open'
                  check (status in ('open', 'in_review', 'fulfilled', 'rejected', 'withdrawn')),
  response_note   text,
  due_at          timestamptz not null default now() + interval '30 days',
  closed_at       timestamptz,
  updated_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index privacy_requests_requester_idx
  on public.privacy_requests (requester_id, created_at desc);
create index privacy_requests_status_due_idx
  on public.privacy_requests (status, due_at)
  where status in ('open', 'in_review');

create trigger set_updated_at before update on public.privacy_requests
  for each row execute function public.tg_set_updated_at();

alter table public.privacy_requests enable row level security;

create policy privacy_requests_own_read on public.privacy_requests
  for select using (requester_id = auth.uid());

create policy privacy_requests_admin_read on public.privacy_requests
  for select using (public.has_role('admin') or public.has_role('owner'));

create policy privacy_requests_admin_update on public.privacy_requests
  for update
  using (public.has_role('admin') or public.has_role('owner'))
  with check (public.has_role('admin') or public.has_role('owner'));

comment on table public.privacy_requests is
  'Operational queue for GDPR/data-subject requests. Inserts go through submit_privacy_request() so requester identity is server-derived.';

create table public.privacy_retention_policies (
  data_area                text primary key,
  lawful_basis             text not null,
  default_retention_months int not null check (default_retention_months > 0),
  review_action            text not null check (review_action in ('retain', 'delete', 'anonymize', 'archive')),
  notes                    text not null,
  updated_at               timestamptz not null default now()
);

alter table public.privacy_retention_policies enable row level security;

create policy privacy_retention_policies_read on public.privacy_retention_policies
  for select using (auth.uid() is not null);

create policy privacy_retention_policies_admin_write on public.privacy_retention_policies
  for all
  using (public.has_role('admin') or public.has_role('owner'))
  with check (public.has_role('admin') or public.has_role('owner'));

insert into public.privacy_retention_policies
  (data_area, lawful_basis, default_retention_months, review_action, notes)
values
  ('profiles', 'contract / legitimate interest', 84, 'archive',
   'Employment and contractor identity records require legal/accounting review before deletion.'),
  ('time_entries', 'contract / legal obligation', 84, 'retain',
   'Timesheets support payroll, invoices, tax, and dispute evidence.'),
  ('invoices_payments', 'legal obligation', 84, 'retain',
   'Financial records normally need multi-year statutory retention; confirm by jurisdiction.'),
  ('candidates', 'legitimate interest / consent where applicable', 24, 'anonymize',
   'Rejected and inactive candidate data should be reviewed or anonymized when no longer needed.'),
  ('prospects_leads', 'legitimate interest', 24, 'delete',
   'Disqualified and do-not-contact records should retain only suppression evidence where needed.'),
  ('email_log', 'legitimate interest / legal obligation', 36, 'archive',
   'Message logs support accountability; bodies may contain personal data and need periodic review.'),
  ('notifications', 'legitimate interest', 12, 'delete',
   'Operational notification content is short-lived.')
on conflict (data_area) do update set
  lawful_basis = excluded.lawful_basis,
  default_retention_months = excluded.default_retention_months,
  review_action = excluded.review_action,
  notes = excluded.notes,
  updated_at = now();

create or replace function public.submit_privacy_request(
  p_request_type text,
  p_details text
)
returns public.privacy_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  prof public.profiles%rowtype;
  req public.privacy_requests%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_request_type not in ('access', 'portability', 'rectification',
                            'erasure', 'restriction', 'objection', 'other') then
    raise exception 'Unsupported privacy request type';
  end if;

  if length(trim(coalesce(p_details, ''))) < 10 then
    raise exception 'Request details must be at least 10 characters';
  end if;

  select * into prof from public.profiles where id = auth.uid();
  if not found then
    raise exception 'Profile not found' using errcode = '42501';
  end if;

  insert into public.privacy_requests
    (requester_id, requester_email, request_type, details)
  values
    (prof.id, prof.email, p_request_type, trim(p_details))
  returning * into req;

  perform public.write_audit(
    'privacy.request_submitted',
    'privacy_request',
    req.id::text,
    jsonb_build_object('request_type', req.request_type)
  );

  return req;
end;
$$;

revoke all on function public.submit_privacy_request(text, text) from public;
grant execute on function public.submit_privacy_request(text, text) to authenticated;

create or replace function public.my_privacy_export()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then
      null
    else
      jsonb_build_object(
        'generated_at', now(),
        'profile', (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
        'roles', coalesce((
          select jsonb_agg(to_jsonb(r) order by r.granted_at desc)
          from public.user_roles r
          where r.user_id = auth.uid()
        ), '[]'::jsonb),
        'assignments', coalesce((
          select jsonb_agg(to_jsonb(a) order by a.start_date desc)
          from public.assignments a
          where a.user_id = auth.uid()
        ), '[]'::jsonb),
        'time_off', coalesce((
          select jsonb_agg(to_jsonb(t) order by t.start_date desc)
          from public.time_off t
          where t.user_id = auth.uid()
        ), '[]'::jsonb),
        'time_entries', coalesce((
          select jsonb_agg(to_jsonb(t) order by t.work_date desc)
          from public.time_entries t
          where t.user_id = auth.uid()
        ), '[]'::jsonb),
        'payout_statements', coalesce((
          select jsonb_agg(to_jsonb(p) order by p.period_start desc)
          from public.payout_statements p
          where p.user_id = auth.uid()
        ), '[]'::jsonb),
        'notifications', coalesce((
          select jsonb_agg(to_jsonb(n) order by n.created_at desc)
          from public.notifications n
          where n.user_id = auth.uid()
        ), '[]'::jsonb),
        'calendar_attendance', coalesce((
          select jsonb_agg(to_jsonb(a) order by a.id desc)
          from public.calendar_attendees a
          where a.user_id = auth.uid()
        ), '[]'::jsonb),
        'sent_email_log', coalesce((
          select jsonb_agg(to_jsonb(e) order by e.created_at desc)
          from public.email_log e
          where e.sent_by = auth.uid()
        ), '[]'::jsonb),
        'privacy_requests', coalesce((
          select jsonb_agg(to_jsonb(r) order by r.created_at desc)
          from public.privacy_requests r
          where r.requester_id = auth.uid()
        ), '[]'::jsonb)
      )
  end;
$$;

revoke all on function public.my_privacy_export() from public;
grant execute on function public.my_privacy_export() to authenticated;

create or replace function public.privacy_retention_due()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not (public.has_role('admin') or public.has_role('owner')) then
      jsonb_build_object('error', 'Admin role required')
    else
      jsonb_build_object(
        'generated_at', now(),
        'candidates_review_due', (
          select count(*)
          from public.candidates
          where stage in ('rejected', 'talent_pool')
            and updated_at < now() - interval '24 months'
        ),
        'prospects_review_due', (
          select count(*)
          from public.prospects
          where status in ('disqualified', 'dnc')
            and updated_at < now() - interval '24 months'
        ),
        'email_log_review_due', (
          select count(*)
          from public.email_log
          where created_at < now() - interval '36 months'
        ),
        'notifications_delete_due', (
          select count(*)
          from public.notifications
          where created_at < now() - interval '12 months'
        )
      )
  end;
$$;

revoke all on function public.privacy_retention_due() from public;
grant execute on function public.privacy_retention_due() to authenticated;

create or replace function public.tg_privacy_requests_admin_stamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_by := auth.uid();
  if new.status in ('fulfilled', 'rejected', 'withdrawn') and old.status is distinct from new.status then
    new.closed_at := now();
  end if;
  if new.status in ('open', 'in_review') then
    new.closed_at := null;
  end if;
  return new;
end;
$$;

create trigger privacy_requests_admin_stamp
  before update on public.privacy_requests
  for each row execute function public.tg_privacy_requests_admin_stamp();
