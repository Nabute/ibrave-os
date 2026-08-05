-- ============================================================================
-- SEED — local/dev demo data. All demo passwords are "password123".
--   owner@ibrave.dev   (owner, admin)
--   pm@ibrave.dev      (pm, employee)
--   finance@ibrave.dev (finance)
--   dev1@ibrave.dev    (employee)
--   dev2@ibrave.dev    (employee, contractor)
-- ============================================================================

-- Seed runs as superuser; allow status values on direct inserts.
select set_config('app.via_rpc', 'on', false);

-- ----------------------------------------------------------------------------
-- Auth users (local dev pattern: direct inserts into auth schema)
-- ----------------------------------------------------------------------------
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
   confirmation_token, recovery_token, email_change, email_change_token_new)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'owner@ibrave.dev',
   crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Dana Owner"}',
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'pm@ibrave.dev',
   crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Petra Manager"}',
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'finance@ibrave.dev',
   crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Fikir Finance"}',
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444',
   'authenticated', 'authenticated', 'dev1@ibrave.dev',
   crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Selam Developer"}',
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '55555555-5555-5555-5555-555555555555',
   'authenticated', 'authenticated', 'dev2@ibrave.dev',
   crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Kal Contractor"}',
   now(), now(), '', '', '', '');

insert into auth.identities
  (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select id::text, id,
       jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users;

-- Profiles were auto-created by the on_auth_user_created trigger; enrich them.
update public.profiles set title = 'CEO' where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set title = 'Project Manager' where id = '22222222-2222-2222-2222-222222222222';
update public.profiles set title = 'Finance Lead' where id = '33333333-3333-3333-3333-333333333333';
update public.profiles set title = 'Senior Developer' where id = '44444444-4444-4444-4444-444444444444';
update public.profiles
  set title = 'QA Engineer', employment_type = 'contractor'
  where id = '55555555-5555-5555-5555-555555555555';

insert into public.user_roles (user_id, role) values
  ('11111111-1111-1111-1111-111111111111', 'owner'),
  ('11111111-1111-1111-1111-111111111111', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'pm'),
  ('22222222-2222-2222-2222-222222222222', 'employee'),
  ('33333333-3333-3333-3333-333333333333', 'finance'),
  ('44444444-4444-4444-4444-444444444444', 'employee'),
  ('55555555-5555-5555-5555-555555555555', 'employee');

-- ----------------------------------------------------------------------------
-- Clients + contacts
-- ----------------------------------------------------------------------------
insert into public.clients
  (id, name, legal_name, billing_address, contact_email, currency,
   payment_terms_days, tax_rate_pct, invoice_grouping)
values
  ('aaaa1111-0000-0000-0000-000000000001', 'Acme Corp', 'Acme Corporation GmbH',
   'Musterstr. 1, Berlin', 'billing@acme.example', 'USD', 30, 0, 'person'),
  ('aaaa1111-0000-0000-0000-000000000002', 'Globex', 'Globex International Ltd',
   '1 Harbor Way, London', 'ap@globex.example', 'USD', 14, 0, 'project');

insert into public.contacts (client_id, name, email, contact_role) values
  ('aaaa1111-0000-0000-0000-000000000001', 'Alice Accounts', 'billing@acme.example', 'billing'),
  ('aaaa1111-0000-0000-0000-000000000001', 'Tom Tech', 'tom@acme.example', 'technical'),
  ('aaaa1111-0000-0000-0000-000000000002', 'Grace Gate', 'ap@globex.example', 'billing');

-- ----------------------------------------------------------------------------
-- Projects + tasks
-- ----------------------------------------------------------------------------
insert into public.projects
  (id, client_id, name, code, status, billing_model, budget_hours, pm_id)
values
  ('bbbb2222-0000-0000-0000-000000000001', 'aaaa1111-0000-0000-0000-000000000001',
   'Acme Web Platform', 'ACME-WEB', 'active', 'tm', 800,
   '22222222-2222-2222-2222-222222222222');

insert into public.projects
  (id, client_id, name, code, status, billing_model,
   retainer_fee_minor, retainer_included_hours, retainer_overage_rate_minor, pm_id)
values
  ('bbbb2222-0000-0000-0000-000000000002', 'aaaa1111-0000-0000-0000-000000000002',
   'Globex Support Retainer', 'GLOB-SUP', 'active', 'retainer',
   500000, 40, 9000, '22222222-2222-2222-2222-222222222222');

insert into public.projects
  (id, client_id, name, code, status, billing_model, pm_id)
values
  ('bbbb2222-0000-0000-0000-000000000003', 'aaaa1111-0000-0000-0000-000000000002',
   'Globex Data Migration', 'GLOB-MIG', 'active', 'fixed',
   '22222222-2222-2222-2222-222222222222');

insert into public.tasks (id, project_id, name, billable) values
  ('cccc3333-0000-0000-0000-000000000001', 'bbbb2222-0000-0000-0000-000000000001', 'Feature development', true),
  ('cccc3333-0000-0000-0000-000000000002', 'bbbb2222-0000-0000-0000-000000000001', 'Code review', true),
  ('cccc3333-0000-0000-0000-000000000003', 'bbbb2222-0000-0000-0000-000000000001', 'Internal meetings', false),
  ('cccc3333-0000-0000-0000-000000000004', 'bbbb2222-0000-0000-0000-000000000002', 'Support tickets', true);

insert into public.milestones (project_id, name, amount_minor, ready_to_bill) values
  ('bbbb2222-0000-0000-0000-000000000003', 'Phase 1: schema mapping', 1200000, true),
  ('bbbb2222-0000-0000-0000-000000000003', 'Phase 2: cutover', 1800000, false);

-- ----------------------------------------------------------------------------
-- Assignments (grid scoping + capacity)
-- ----------------------------------------------------------------------------
insert into public.assignments (user_id, project_id, role_on_project, start_date, allocation_pct) values
  ('44444444-4444-4444-4444-444444444444', 'bbbb2222-0000-0000-0000-000000000001', 'Senior Developer', current_date - 90, 100),
  ('55555555-5555-5555-5555-555555555555', 'bbbb2222-0000-0000-0000-000000000001', 'QA Engineer', current_date - 60, 50),
  ('55555555-5555-5555-5555-555555555555', 'bbbb2222-0000-0000-0000-000000000002', 'QA Engineer', current_date - 60, 50),
  ('22222222-2222-2222-2222-222222222222', 'bbbb2222-0000-0000-0000-000000000001', 'Project Manager', current_date - 90, 30);

-- ----------------------------------------------------------------------------
-- Rate cards (versioned): Acme project card + Globex client default
-- ----------------------------------------------------------------------------
insert into public.rate_cards (id, project_id, effective_from, note) values
  ('dddd4444-0000-0000-0000-000000000001', 'bbbb2222-0000-0000-0000-000000000001',
   current_date - 120, 'Initial Acme rates');

insert into public.rate_card_lines (rate_card_id, user_id, role_name, hourly_rate_minor) values
  ('dddd4444-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', null, 12000),
  ('dddd4444-0000-0000-0000-000000000001', null, 'QA Engineer', 8500),
  ('dddd4444-0000-0000-0000-000000000001', null, 'Project Manager', 11000);

insert into public.rate_cards (id, client_id, effective_from, note) values
  ('dddd4444-0000-0000-0000-000000000002', 'aaaa1111-0000-0000-0000-000000000002',
   current_date - 120, 'Globex default rates');

insert into public.rate_card_lines (rate_card_id, user_id, role_name, hourly_rate_minor) values
  ('dddd4444-0000-0000-0000-000000000002', null, 'QA Engineer', 9000);

-- ----------------------------------------------------------------------------
-- Time entries: two weeks ago approved, last week submitted, this week draft.
-- Weekday-only via generate_series over Mon–Fri offsets.
-- ----------------------------------------------------------------------------
-- Two weeks ago: dev1 on Acme, approved (invoiceable)
insert into public.time_entries
  (user_id, project_id, task_id, work_date, hours, note, billable, status, approved_by, approved_at)
select
  '44444444-4444-4444-4444-444444444444',
  'bbbb2222-0000-0000-0000-000000000001',
  'cccc3333-0000-0000-0000-000000000001',
  date_trunc('week', current_date)::date - 14 + d,
  8, 'Feature work', true, 'approved',
  '22222222-2222-2222-2222-222222222222', now() - interval '7 days'
from generate_series(0, 4) d;

-- Two weeks ago: dev2 QA on Acme, approved
insert into public.time_entries
  (user_id, project_id, task_id, work_date, hours, note, billable, status, approved_by, approved_at)
select
  '55555555-5555-5555-5555-555555555555',
  'bbbb2222-0000-0000-0000-000000000001',
  'cccc3333-0000-0000-0000-000000000002',
  date_trunc('week', current_date)::date - 14 + d,
  4, 'Regression testing', true, 'approved',
  '22222222-2222-2222-2222-222222222222', now() - interval '7 days'
from generate_series(0, 4) d;

-- Two weeks ago: dev2 on Globex retainer, approved
insert into public.time_entries
  (user_id, project_id, task_id, work_date, hours, note, billable, status, approved_by, approved_at)
select
  '55555555-5555-5555-5555-555555555555',
  'bbbb2222-0000-0000-0000-000000000002',
  'cccc3333-0000-0000-0000-000000000004',
  date_trunc('week', current_date)::date - 14 + d,
  4, 'Ticket triage', true, 'approved',
  '22222222-2222-2222-2222-222222222222', now() - interval '7 days'
from generate_series(0, 4) d;

-- Last week: dev1 submitted, waiting for PM
insert into public.time_entries
  (user_id, project_id, task_id, work_date, hours, note, billable, status)
select
  '44444444-4444-4444-4444-444444444444',
  'bbbb2222-0000-0000-0000-000000000001',
  'cccc3333-0000-0000-0000-000000000001',
  date_trunc('week', current_date)::date - 7 + d,
  7.5, 'Sprint 12 work', true, 'submitted'
from generate_series(0, 4) d;

-- This week: dev1 draft (in progress)
insert into public.time_entries
  (user_id, project_id, task_id, work_date, hours, note, billable, status)
select
  '44444444-4444-4444-4444-444444444444',
  'bbbb2222-0000-0000-0000-000000000001',
  'cccc3333-0000-0000-0000-000000000001',
  date_trunc('week', current_date)::date + d,
  8, null, true, 'draft'
from generate_series(0, least(2, extract(isodow from current_date)::int - 1)) d
where extract(isodow from current_date) > 1;

select set_config('app.via_rpc', 'off', false);
