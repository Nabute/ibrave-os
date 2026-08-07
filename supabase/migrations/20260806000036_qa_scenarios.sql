-- ============================================================================
-- QA scenario data. Idempotent: safe to re-run, creates nothing twice.
--
-- Adds (a) one login per role so permission edges can be tested in isolation,
-- and (b) at least one record in EVERY state of EVERY workflow, so a tester
-- can see each badge, each available action and each guard without having to
-- manufacture the data first.
--
-- All QA passwords are "Passw0rd!QA". See docs/qa-accounts.md for the matrix.
-- ============================================================================

select set_config('app.via_rpc', 'on', false);
-- pgcrypto (crypt/gen_salt) lives in the extensions schema on hosted projects.
set local search_path = public, extensions;

-- ----------------------------------------------------------------------------
-- 1. QA logins, one per role plus the edge cases
-- ----------------------------------------------------------------------------
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
   confirmation_token, recovery_token, email_change, email_change_token_new)
select '00000000-0000-0000-0000-000000000000', v.id, 'authenticated', 'authenticated',
       v.email, crypt('Passw0rd!QA', gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}',
       jsonb_build_object('full_name', v.full_name), now(), now(), '', '', '', ''
from (values
  ('a0000000-0000-4000-a000-000000000001'::uuid, 'qa.admin@ibrave.co',      'QA Admin'),
  ('a0000000-0000-4000-a000-000000000002'::uuid, 'qa.pm@ibrave.co',         'QA Project Manager'),
  ('a0000000-0000-4000-a000-000000000003'::uuid, 'qa.finance@ibrave.co',    'QA Finance'),
  ('a0000000-0000-4000-a000-000000000004'::uuid, 'qa.sales@ibrave.co',      'QA Sales'),
  ('a0000000-0000-4000-a000-000000000005'::uuid, 'qa.recruiter@ibrave.co',  'QA Recruiter'),
  ('a0000000-0000-4000-a000-000000000006'::uuid, 'qa.resourcing@ibrave.co', 'QA Resourcing'),
  ('a0000000-0000-4000-a000-000000000007'::uuid, 'qa.account@ibrave.co',    'QA Account Owner'),
  ('a0000000-0000-4000-a000-000000000008'::uuid, 'qa.employee@ibrave.co',   'QA Employee'),
  ('a0000000-0000-4000-a000-000000000009'::uuid, 'qa.multi@ibrave.co',      'QA Multi Role'),
  ('a0000000-0000-4000-a000-00000000000a'::uuid, 'qa.mfa@ibrave.co',        'QA MFA Required'),
  ('a0000000-0000-4000-a000-00000000000b'::uuid, 'qa.inactive@ibrave.co',   'QA Deactivated'),
  ('a0000000-0000-4000-a000-00000000000c'::uuid, 'qa.nocost@ibrave.co',     'QA No Cost Rate')
) as v(id, email, full_name)
where not exists (select 1 from auth.users u where u.email = v.email);

insert into auth.identities
  (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.email like 'qa.%@ibrave.co'
  and not exists (select 1 from auth.identities i where i.user_id = u.id);

-- Roles: exactly one each, so a tester can prove what that role alone can do.
insert into public.user_roles (user_id, role)
select v.id, v.role::public.app_role
from (values
  ('a0000000-0000-4000-a000-000000000001'::uuid, 'admin'),
  ('a0000000-0000-4000-a000-000000000002'::uuid, 'pm'),
  ('a0000000-0000-4000-a000-000000000003'::uuid, 'finance'),
  ('a0000000-0000-4000-a000-000000000004'::uuid, 'sales'),
  ('a0000000-0000-4000-a000-000000000005'::uuid, 'recruiter'),
  ('a0000000-0000-4000-a000-000000000006'::uuid, 'resourcing'),
  ('a0000000-0000-4000-a000-000000000007'::uuid, 'account_owner'),
  ('a0000000-0000-4000-a000-000000000008'::uuid, 'employee'),
  ('a0000000-0000-4000-a000-00000000000a'::uuid, 'employee'),
  ('a0000000-0000-4000-a000-00000000000b'::uuid, 'employee'),
  ('a0000000-0000-4000-a000-00000000000c'::uuid, 'employee'),
  -- multi-role: three hats at once
  ('a0000000-0000-4000-a000-000000000009'::uuid, 'pm'),
  ('a0000000-0000-4000-a000-000000000009'::uuid, 'finance'),
  ('a0000000-0000-4000-a000-000000000009'::uuid, 'sales')
) as v(id, role)
on conflict (user_id, role) do nothing;

update public.profiles set title = 'QA Admin',       employment_type = 'employee'   where id = 'a0000000-0000-4000-a000-000000000001';
update public.profiles set title = 'QA PM',          employment_type = 'employee'   where id = 'a0000000-0000-4000-a000-000000000002';
update public.profiles set title = 'QA Finance',     employment_type = 'employee'   where id = 'a0000000-0000-4000-a000-000000000003';
update public.profiles set title = 'QA Sales',       employment_type = 'employee'   where id = 'a0000000-0000-4000-a000-000000000004';
update public.profiles set title = 'QA Recruiter',   employment_type = 'employee'   where id = 'a0000000-0000-4000-a000-000000000005';
update public.profiles set title = 'QA Resourcing',  employment_type = 'employee'   where id = 'a0000000-0000-4000-a000-000000000006';
update public.profiles set title = 'QA Account',     employment_type = 'employee'   where id = 'a0000000-0000-4000-a000-000000000007';
update public.profiles set title = 'QA Developer',   employment_type = 'employee'   where id = 'a0000000-0000-4000-a000-000000000008';
update public.profiles set title = 'QA Everything',  employment_type = 'employee'   where id = 'a0000000-0000-4000-a000-000000000009';
update public.profiles set title = 'QA MFA',         employment_type = 'employee',
       mfa_required = true                                                          where id = 'a0000000-0000-4000-a000-00000000000a';
update public.profiles set title = 'QA Deactivated', employment_type = 'contractor',
       active = false                                                               where id = 'a0000000-0000-4000-a000-00000000000b';
update public.profiles set title = 'QA Contractor',  employment_type = 'contractor' where id = 'a0000000-0000-4000-a000-00000000000c';

-- Deactivated login must actually be refused by auth.
update auth.users
set banned_until = now() + interval '100 years'
where id = 'a0000000-0000-4000-a000-00000000000b';

-- Cost rates for everyone EXCEPT qa.nocost (that gap is the test).
insert into public.cost_rates (user_id, effective_from, hourly_cost_minor, currency, note)
select v.id, current_date - 180, v.rate, 'USD', 'QA cost rate'
from (values
  ('a0000000-0000-4000-a000-000000000002'::uuid, 7000),
  ('a0000000-0000-4000-a000-000000000008'::uuid, 5500),
  ('a0000000-0000-4000-a000-000000000009'::uuid, 7500),
  ('a0000000-0000-4000-a000-00000000000a'::uuid, 5000)
) as v(id, rate)
where not exists (
  select 1 from public.cost_rates c where c.user_id = v.id and c.effective_from = current_date - 180
);

-- Skills so candidate matching has something to rank. Names only, existing
-- rows win (the dev seed owns canonical ids for its own set).
insert into public.skills (name)
select v.n from (values ('typescript'), ('kubernetes'), ('figma'), ('python')) as v(n)
where not exists (select 1 from public.skills s where s.name = v.n);

insert into public.person_skills (user_id, skill_id, level)
select 'a0000000-0000-4000-a000-000000000008', s.id, 'senior'::public.skill_level
from public.skills s where s.name in ('typescript', 'python')
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- 2. QA client + projects (every billing model)
-- ----------------------------------------------------------------------------
insert into public.clients
  (id, name, code, legal_name, currency, payment_terms_days, tier, contact_email,
   billing_address, timezone, invoice_grouping, account_owner_id, notes)
values
  ('c0000000-0000-4000-a000-000000000001', 'Northwind Trading', 'NWND',
   'Northwind Trading Ltd', 'USD', 30, 'a', 'ap@northwind.test',
   '1 Harbour Road, Dublin', 'Europe/Dublin', 'project',
   'a0000000-0000-4000-a000-000000000007', 'QA: healthy account, tier A'),
  ('c0000000-0000-4000-a000-000000000002', 'Umbra Systems', 'UMBR',
   'Umbra Systems GmbH', 'EUR', 14, 'b', 'billing@umbra.test',
   'Hauptstr. 9, Munich', 'Europe/Berlin', 'person',
   'a0000000-0000-4000-a000-000000000007', 'QA: overdue + escalation, red health'),
  ('c0000000-0000-4000-a000-000000000003', 'Solstice Retail', 'SOLS',
   'Solstice Retail Inc', 'USD', 45, 'c', 'finance@solstice.test',
   '400 Market St, San Francisco', 'America/Los_Angeles', 'detailed',
   null, 'QA: retainer client, no account owner')
on conflict (id) do nothing;

insert into public.projects
  (id, client_id, name, code, status, billing_model, pm_id, budget_hours,
   retainer_fee_minor, retainer_included_hours, retainer_overage_rate_minor)
values
  ('40000000-0000-4000-a000-000000000001', 'c0000000-0000-4000-a000-000000000001',
   'Northwind Platform', 'NWND-1', 'active', 'tm',
   'a0000000-0000-4000-a000-000000000002', 800, null, null, null),
  ('40000000-0000-4000-a000-000000000002', 'c0000000-0000-4000-a000-000000000002',
   'Umbra Migration', 'UMBR-1', 'active', 'tm',
   'a0000000-0000-4000-a000-000000000002', 400, null, null, null),
  ('40000000-0000-4000-a000-000000000003', 'c0000000-0000-4000-a000-000000000003',
   'Solstice Support', 'SOLS-1', 'active', 'retainer',
   'a0000000-0000-4000-a000-000000000002', null, 800000, 40, 12000),
  ('40000000-0000-4000-a000-000000000004', 'c0000000-0000-4000-a000-000000000001',
   'Northwind Archive', 'NWND-0', 'closed', 'tm',
   'a0000000-0000-4000-a000-000000000002', 120, null, null, null)
on conflict (id) do nothing;

-- Rate cards, effective-dated so the "old rate for old work" rule is testable.
insert into public.rate_cards (id, project_id, effective_from, note)
values
  ('4a000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000001', current_date - 365, 'QA base rates'),
  ('4a000000-0000-4000-a000-000000000002', '40000000-0000-4000-a000-000000000001', current_date - 30,  'QA rate increase'),
  ('4a000000-0000-4000-a000-000000000003', '40000000-0000-4000-a000-000000000002', current_date - 365, 'QA Umbra rates')
on conflict (id) do nothing;

insert into public.rate_card_lines (rate_card_id, user_id, hourly_rate_minor)
select v.card, v.usr, v.rate from (values
  ('4a000000-0000-4000-a000-000000000001'::uuid, 'a0000000-0000-4000-a000-000000000008'::uuid, 11000),
  ('4a000000-0000-4000-a000-000000000002'::uuid, 'a0000000-0000-4000-a000-000000000008'::uuid, 13000),
  ('4a000000-0000-4000-a000-000000000003'::uuid, 'a0000000-0000-4000-a000-000000000008'::uuid,  9500),
  ('4a000000-0000-4000-a000-000000000001'::uuid, 'a0000000-0000-4000-a000-00000000000c'::uuid,  8000)
) as v(card, usr, rate)
where not exists (
  select 1 from public.rate_card_lines l where l.rate_card_id = v.card and l.user_id = v.usr
);

insert into public.assignments (user_id, project_id, role_on_project, start_date, allocation_pct)
select v.usr, v.proj, v.role, current_date - 90, v.pct from (values
  ('a0000000-0000-4000-a000-000000000008'::uuid, '40000000-0000-4000-a000-000000000001'::uuid, 'Engineer', 60),
  ('a0000000-0000-4000-a000-000000000008'::uuid, '40000000-0000-4000-a000-000000000002'::uuid, 'Engineer', 20),
  ('a0000000-0000-4000-a000-00000000000c'::uuid, '40000000-0000-4000-a000-000000000001'::uuid, 'QA', 100),
  ('a0000000-0000-4000-a000-00000000000a'::uuid, '40000000-0000-4000-a000-000000000003'::uuid, 'Support', 25)
) as v(usr, proj, role, pct)
where not exists (
  select 1 from public.assignments a where a.user_id = v.usr and a.project_id = v.proj
);

-- ----------------------------------------------------------------------------
-- 3. Time entries in every status (draft / submitted / approved / rejected)
-- ----------------------------------------------------------------------------
insert into public.time_entries
  (user_id, project_id, work_date, hours, note, billable, status, approved_by, approved_at)
select v.usr, v.proj, v.d::date, v.h, v.note, v.billable, v.status,
       case when v.status = 'approved' then 'a0000000-0000-4000-a000-000000000002'::uuid end,
       case when v.status = 'approved' then now() end
from (values
  ('a0000000-0000-4000-a000-000000000008'::uuid, '40000000-0000-4000-a000-000000000001'::uuid, current_date - 2,  6.5,  'QA draft entry',            true,  'draft'),
  ('a0000000-0000-4000-a000-000000000008'::uuid, '40000000-0000-4000-a000-000000000001'::uuid, current_date - 3,  7.25, 'QA submitted, awaiting PM', true,  'submitted'),
  ('a0000000-0000-4000-a000-000000000008'::uuid, '40000000-0000-4000-a000-000000000001'::uuid, current_date - 40, 8.0,  'QA approved billable',      true,  'approved'),
  ('a0000000-0000-4000-a000-000000000008'::uuid, '40000000-0000-4000-a000-000000000001'::uuid, current_date - 41, 4.0,  'QA approved internal',      false, 'approved'),
  ('a0000000-0000-4000-a000-000000000008'::uuid, '40000000-0000-4000-a000-000000000002'::uuid, current_date - 42, 5.5,  'QA approved, second client',true,  'approved'),
  ('a0000000-0000-4000-a000-00000000000c'::uuid, '40000000-0000-4000-a000-000000000001'::uuid, current_date - 43, 6.0,  'QA contractor hours',       true,  'approved'),
  ('a0000000-0000-4000-a000-00000000000a'::uuid, '40000000-0000-4000-a000-000000000003'::uuid, current_date - 44, 3.25, 'QA retainer hours',         true,  'approved')
) as v(usr, proj, d, h, note, billable, status)
where not exists (
  select 1 from public.time_entries t
  where t.user_id = v.usr and t.work_date = v.d::date and t.note = v.note
);

-- A rejected entry: back in draft, carrying the PM's reason in history.
insert into public.time_entries
  (user_id, project_id, work_date, hours, note, billable, status, rejection_comment)
select 'a0000000-0000-4000-a000-000000000008', '40000000-0000-4000-a000-000000000001',
       current_date - 5, 9.0, 'QA rejected entry, see the reason', true, 'draft',
       'QA: logged against the wrong project, please re-log'
where not exists (
  select 1 from public.time_entries t
  where t.note = 'QA rejected entry, see the reason'
);

-- Time off so bench shows unavailability.
insert into public.time_off (user_id, start_date, end_date, kind, note)
select 'a0000000-0000-4000-a000-000000000008', current_date + 10, current_date + 14, 'vacation', 'QA vacation'
where not exists (select 1 from public.time_off t where t.note = 'QA vacation');

-- ----------------------------------------------------------------------------
-- 4. Invoices in every state, including each dunning stage
-- ----------------------------------------------------------------------------
do $$
declare
  v_inv uuid;
  v_line uuid;
  v_n int;
  r record;
begin
  -- helper-ish inline loop: one issued invoice per dunning offset + extras
  for r in
    select * from (values
      ('QA-COURTESY',  'c0000000-0000-4000-a000-000000000001'::uuid, -3,  120000, 'issued'),
      ('QA-OVERDUE7',  'c0000000-0000-4000-a000-000000000002'::uuid,  7,   85000, 'overdue'),
      ('QA-OVERDUE14', 'c0000000-0000-4000-a000-000000000002'::uuid,  14, 240000, 'overdue'),
      ('QA-OVERDUE30', 'c0000000-0000-4000-a000-000000000002'::uuid,  30,  47500, 'overdue'),
      ('QA-PARTIAL',   'c0000000-0000-4000-a000-000000000001'::uuid,  2,  300000, 'partially_paid'),
      ('QA-PAID',      'c0000000-0000-4000-a000-000000000003'::uuid,  20, 160000, 'paid'),
      ('QA-VOID',      'c0000000-0000-4000-a000-000000000001'::uuid,  5,   60000, 'void')
    ) as t(tag, client_id, days_overdue, amount, target_status)
  loop
    if exists (select 1 from public.invoices where notes = r.tag) then
      continue;
    end if;

    select coalesce(max(last_value), 0) + 1 into v_n
    from public.invoice_counters
    where kind = 'invoice' and year = extract(year from now())::int;

    insert into public.invoices
      (kind, client_id, period_start, period_end, status, currency,
       issued_at, issued_by, due_date, notes, number,
       subtotal_minor, tax_total_minor, total_minor,
       void_reason)
    values
      ('invoice', r.client_id, current_date - 60, current_date - 30,
       r.target_status, (select currency from public.clients where id = r.client_id),
       now() - interval '30 days', 'a0000000-0000-4000-a000-000000000003',
       current_date - r.days_overdue, r.tag,
       'INV-' || (select code from public.clients where id = r.client_id)
         || '-' || extract(year from now())::int || '-9' || lpad(v_n::text, 3, '0'),
       r.amount, 0, r.amount,
       case when r.target_status = 'void' then 'QA: voided for testing' end)
    returning id into v_inv;

    insert into public.invoice_counters (kind, year, client_id, last_value)
    values ('invoice', extract(year from now())::int, r.client_id, v_n)
    on conflict (kind, year, client_id) do update set last_value = greatest(public.invoice_counters.last_value, v_n);

    insert into public.invoice_lines
      (invoice_id, kind, description, quantity, unit_price_minor, amount_minor, tax_rate_pct, position)
    values (v_inv, 'time', 'QA engineering services', 1, r.amount, r.amount, 0, 1)
    returning id into v_line;

    if r.target_status = 'partially_paid' then
      insert into public.payments (invoice_id, amount_minor, paid_at, method, note, recorded_by)
      values (v_inv, r.amount / 3, current_date - 5, 'wire', 'QA partial payment',
              'a0000000-0000-4000-a000-000000000003');
    elsif r.target_status = 'paid' then
      insert into public.payments (invoice_id, amount_minor, paid_at, method, note, recorded_by)
      values (v_inv, r.amount, current_date - 3, 'wire', 'QA full settlement',
              'a0000000-0000-4000-a000-000000000003');
    end if;
  end loop;
end;
$$;

-- A draft invoice (editable) and a credit note against the paid one.
do $$
declare v_inv uuid; v_paid uuid;
begin
  if not exists (select 1 from public.invoices where notes = 'QA-DRAFT') then
    insert into public.invoices
      (kind, client_id, period_start, period_end, status, currency, notes,
       subtotal_minor, tax_total_minor, total_minor)
    values ('invoice', 'c0000000-0000-4000-a000-000000000001', current_date - 30,
            current_date, 'draft', 'USD', 'QA-DRAFT', 95000, 0, 95000)
    returning id into v_inv;
    insert into public.invoice_lines
      (invoice_id, kind, description, quantity, unit_price_minor, amount_minor, tax_rate_pct, position)
    values (v_inv, 'time', 'QA draft line, editable', 1, 95000, 95000, 0, 1);
  end if;

  select id into v_paid from public.invoices where notes = 'QA-PAID' limit 1;
  if v_paid is not null and not exists (select 1 from public.invoices where notes = 'QA-CREDIT') then
    insert into public.invoices
      (kind, client_id, period_start, period_end, status, currency, credits_invoice_id,
       issued_at, issued_by, due_date, notes, number,
       subtotal_minor, tax_total_minor, total_minor)
    values ('credit_note', 'c0000000-0000-4000-a000-000000000003', current_date - 60,
            current_date - 30, 'issued', 'USD', v_paid, now(),
            'a0000000-0000-4000-a000-000000000003', current_date, 'QA-CREDIT',
            'CN-SOLS-' || extract(year from now())::int || '-9001', -25000, 0, -25000)
    returning id into v_inv;
    insert into public.invoice_lines
      (invoice_id, kind, description, quantity, unit_price_minor, amount_minor, tax_rate_pct, position)
    values (v_inv, 'manual', 'QA goodwill credit', 1, -25000, -25000, 0, 1);
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Sales: a lead at every stage, quotes, contracts at each renewal window
-- ----------------------------------------------------------------------------
insert into public.leads
  (id, company, contact_name, email, source, stage, probability_pct,
   expected_value_minor, currency, expected_start, owner_id, lost_reason)
values
  ('1ead0000-0000-4000-a000-000000000001', 'QA Lead Stage One', 'Ana Lead', 'ana@qa1.test',
   'inbound', 'lead', 20, 1500000, 'USD', current_date + 60, 'a0000000-0000-4000-a000-000000000004', null),
  ('1ead0000-0000-4000-a000-000000000002', 'QA Qualified Corp', 'Ben Qual', 'ben@qa2.test',
   'referral', 'qualified', 40, 2500000, 'USD', current_date + 45, 'a0000000-0000-4000-a000-000000000004', null),
  ('1ead0000-0000-4000-a000-000000000003', 'QA Proposal Ltd', 'Cara Prop', 'cara@qa3.test',
   'event', 'proposal_sent', 60, 4000000, 'USD', current_date + 30, 'a0000000-0000-4000-a000-000000000004', null),
  ('1ead0000-0000-4000-a000-000000000004', 'QA Negotiation SA', 'Dan Nego', 'dan@qa4.test',
   'outbound', 'negotiation', 80, 6000000, 'USD', current_date + 20, 'a0000000-0000-4000-a000-000000000004', null),
  ('1ead0000-0000-4000-a000-000000000005', 'QA Won Industries', 'Eve Won', 'eve@qa5.test',
   'referral', 'won', 100, 3200000, 'USD', current_date - 10, 'a0000000-0000-4000-a000-000000000004', null),
  ('1ead0000-0000-4000-a000-000000000006', 'QA Lost Holdings', 'Finn Lost', 'finn@qa6.test',
   'research', 'lost', 0, 900000, 'USD', null, 'a0000000-0000-4000-a000-000000000004', 'QA: budget cut')
on conflict (id) do nothing;

insert into public.quotes (id, lead_id, version, status, currency, notes)
values
  ('9401e000-0000-4000-a000-000000000001', '1ead0000-0000-4000-a000-000000000003', 1, 'sent',       'USD', 'QA sent quote'),
  ('9401e000-0000-4000-a000-000000000002', '1ead0000-0000-4000-a000-000000000004', 1, 'superseded', 'USD', 'QA superseded v1'),
  ('9401e000-0000-4000-a000-000000000003', '1ead0000-0000-4000-a000-000000000004', 2, 'accepted',   'USD', 'QA accepted v2')
on conflict (id) do nothing;

insert into public.quote_lines (quote_id, description, qty_hours, unit_price_minor, amount_minor, position)
select v.q, v.d, v.qty, v.up, v.amt, 1 from (values
  ('9401e000-0000-4000-a000-000000000001'::uuid, 'QA senior engineer, 3 months', 480, 12000, 5760000),
  ('9401e000-0000-4000-a000-000000000003'::uuid, 'QA team of two, 6 months',    1920, 11500, 22080000)
) as v(q, d, qty, up, amt)
where not exists (select 1 from public.quote_lines l where l.quote_id = v.q);

insert into public.contracts (id, client_id, lead_id, start_date, end_date, status, notes)
values
  ('c04d0000-0000-4000-a000-000000000001', 'c0000000-0000-4000-a000-000000000001', null,
   current_date - 300, current_date + 30, 'active', 'QA: renews in 30 days'),
  ('c04d0000-0000-4000-a000-000000000002', 'c0000000-0000-4000-a000-000000000002', null,
   current_date - 200, current_date + 60, 'active', 'QA: renews in 60 days'),
  ('c04d0000-0000-4000-a000-000000000003', 'c0000000-0000-4000-a000-000000000003', null,
   current_date - 500, current_date - 10, 'expired', 'QA: already expired'),
  ('c04d0000-0000-4000-a000-000000000004', 'c0000000-0000-4000-a000-000000000001', null,
   current_date - 100, null, 'active', 'QA: open-ended, no renewal date')
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 6. Prospecting: every prospect status + a cadence with a due task
-- ----------------------------------------------------------------------------
insert into public.prospects
  (id, company, contact_name, email, source, fit_score, status, owner_id, notes)
values
  ('9405e000-0000-4000-a000-000000000001', 'QA Active Prospect', 'Gil Active', 'gil@qap1.test',
   'research', 5, 'active', 'a0000000-0000-4000-a000-000000000004', 'QA: work the cadence'),
  ('9405e000-0000-4000-a000-000000000002', 'QA DNC Prospect', 'Hana Stop', 'hana@qap2.test',
   'outbound', 3, 'dnc', 'a0000000-0000-4000-a000-000000000004', 'QA: do not contact, all actions blocked'),
  ('9405e000-0000-4000-a000-000000000003', 'QA Disqualified', 'Ivan Nofit', 'ivan@qap3.test',
   'inbound', 1, 'disqualified', 'a0000000-0000-4000-a000-000000000004', 'QA: bad fit'),
  ('9405e000-0000-4000-a000-000000000004', 'QA Converted Prospect', 'Jo Converted', 'jo@qap4.test',
   'referral', 4, 'converted', 'a0000000-0000-4000-a000-000000000004', 'QA: became a lead')
on conflict (id) do nothing;

insert into public.cadences (id, name, steps, active)
values ('cade0000-0000-4000-a000-000000000001', 'QA 3-touch sequence',
  '[{"kind":"email","note":"Intro email","day_offset":0},
    {"kind":"call","note":"Follow-up call","day_offset":3},
    {"kind":"email","note":"Break-up email","day_offset":7}]'::jsonb, true)
on conflict (id) do nothing;

insert into public.sales_tasks (owner_id, prospect_id, kind, description, due_date)
select 'a0000000-0000-4000-a000-000000000004', '9405e000-0000-4000-a000-000000000001',
       'touch', 'QA: overdue touch, due yesterday', current_date - 1
where not exists (select 1 from public.sales_tasks t where t.description like 'QA: overdue touch%');

insert into public.sales_tasks (owner_id, prospect_id, kind, description, due_date)
select 'a0000000-0000-4000-a000-000000000004', '9405e000-0000-4000-a000-000000000001',
       'touch', 'QA: due today', current_date
where not exists (select 1 from public.sales_tasks t where t.description = 'QA: due today');

-- ----------------------------------------------------------------------------
-- 7. Accounts: opportunities, escalation (open + resolved), feedback
-- ----------------------------------------------------------------------------
insert into public.opportunities (client_id, description, value_minor, currency, stage, owner_id)
select v.c, v.d, v.amt, 'USD', v.st, 'a0000000-0000-4000-a000-000000000007'
from (values
  ('c0000000-0000-4000-a000-000000000001'::uuid, 'QA upsell: second squad', 4500000, 'idea'),
  ('c0000000-0000-4000-a000-000000000001'::uuid, 'QA upsell: mobile app',   2800000, 'proposed'),
  ('c0000000-0000-4000-a000-000000000003'::uuid, 'QA upsell: won expansion',1200000, 'won'),
  ('c0000000-0000-4000-a000-000000000002'::uuid, 'QA upsell: lost to rival', 900000, 'lost')
) as v(c, d, amt, st)
where not exists (select 1 from public.opportunities o where o.description = v.d);

insert into public.escalations (client_id, summary, severity, owner_id, resolved_at, resolution)
select v.c, v.s, v.sev, 'a0000000-0000-4000-a000-000000000007', v.res, v.note
from (values
  ('c0000000-0000-4000-a000-000000000002'::uuid, 'QA open escalation: delivery quality', 'high', null::timestamptz, null::text),
  ('c0000000-0000-4000-a000-000000000001'::uuid, 'QA resolved escalation: billing dispute', 'medium', now() - interval '5 days', 'QA: credited and closed')
) as v(c, s, sev, res, note)
where not exists (select 1 from public.escalations e where e.summary = v.s);

-- ----------------------------------------------------------------------------
-- 8. Staffing: requests in every status
-- ----------------------------------------------------------------------------
insert into public.staffing_requests
  (id, project_id, role_title, skills, seniority, allocation_pct, start_date,
   duration_weeks, status, notes, created_by)
values
  ('57af0000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000001',
   'QA Open Request, React', array['react','typescript'], 'senior', 100,
   current_date + 14, 12, 'open', 'QA: fill me', 'a0000000-0000-4000-a000-000000000006'),
  ('57af0000-0000-4000-a000-000000000002', '40000000-0000-4000-a000-000000000002',
   'QA Cancelled Request', array['python'], 'mid', 50,
   current_date + 7, 8, 'cancelled', 'QA: cancelled example', 'a0000000-0000-4000-a000-000000000006')
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 9. Talent: requisitions + a candidate in every pipeline stage
-- ----------------------------------------------------------------------------
insert into public.requisitions (id, role_title, skills, seniority, headcount, reason, status, notes)
values
  ('4e910000-0000-4000-a000-000000000001', 'QA Senior Frontend', array['react','typescript'],
   'senior', 2, 'growth', 'open', 'QA: open requisition, 2 seats'),
  ('4e910000-0000-4000-a000-000000000002', 'QA Platform Engineer', array['kubernetes'],
   'mid', 1, 'backfill', 'filled', 'QA: already filled')
on conflict (id) do nothing;

insert into public.candidates
  (id, full_name, email, phone, skills, seniority, expected_rate_minor, available_from,
   source, stage, requisition_id, owner_id, rejection_reason, notes)
values
  ('ca4d0000-0000-4000-a000-000000000001', 'QA Sourced Candidate', 'sourced@qac.test', '+1 555 0101',
   array['react'], 'mid', 7000, current_date + 30, 'linkedin', 'sourced',
   '4e910000-0000-4000-a000-000000000001', 'a0000000-0000-4000-a000-000000000005', null, 'QA: fresh in pipeline'),
  ('ca4d0000-0000-4000-a000-000000000002', 'QA Screening Candidate', 'screening@qac.test', '+1 555 0102',
   array['react','typescript'], 'senior', 9000, current_date + 20, 'referral', 'screening',
   '4e910000-0000-4000-a000-000000000001', 'a0000000-0000-4000-a000-000000000005', null, 'QA: in screening'),
  ('ca4d0000-0000-4000-a000-000000000003', 'QA Interview Candidate', 'interview@qac.test', '+1 555 0103',
   array['typescript'], 'senior', 9500, current_date + 15, 'inbound', 'interview',
   '4e910000-0000-4000-a000-000000000001', 'a0000000-0000-4000-a000-000000000005', null, 'QA: schedule a round'),
  ('ca4d0000-0000-4000-a000-000000000004', 'QA Assessment Candidate', 'assessment@qac.test', '+1 555 0104',
   array['kubernetes'], 'mid', 8000, current_date + 10, 'agency', 'assessment',
   '4e910000-0000-4000-a000-000000000002', 'a0000000-0000-4000-a000-000000000005', null, 'QA: technical assessment'),
  ('ca4d0000-0000-4000-a000-000000000005', 'QA Offer Candidate', 'offer@qac.test', '+1 555 0105',
   array['react','figma'], 'senior', 10000, current_date + 5, 'referral', 'offer',
   '4e910000-0000-4000-a000-000000000001', 'a0000000-0000-4000-a000-000000000005', null, 'QA: offer out, hire needs a scorecard'),
  ('ca4d0000-0000-4000-a000-000000000006', 'QA Hired Candidate', 'hired@qac.test', '+1 555 0106',
   array['python'], 'senior', 9000, current_date, 'job_board', 'hired',
   '4e910000-0000-4000-a000-000000000002', 'a0000000-0000-4000-a000-000000000005', null, 'QA: hired, has onboarding'),
  ('ca4d0000-0000-4000-a000-000000000007', 'QA Rejected Candidate', 'rejected@qac.test', '+1 555 0107',
   array['react'], 'junior', 4000, current_date + 60, 'other', 'rejected',
   null, 'a0000000-0000-4000-a000-000000000005', 'QA: not enough experience', 'QA: rejected example'),
  ('ca4d0000-0000-4000-a000-000000000008', 'QA Talent Pool Candidate', 'pool@qac.test', '+1 555 0108',
   array['typescript','python'], 'senior', 9500, current_date + 90, 'referral', 'talent_pool',
   null, 'a0000000-0000-4000-a000-000000000005', null, 'QA: parked, reactivate me')
on conflict (id) do nothing;

-- A submitted scorecard so the offer candidate can actually be hired.
insert into public.interview_rounds
  (candidate_id, round_no, interviewer_id, scheduled_at, scorecard, recommendation, submitted_at)
select 'ca4d0000-0000-4000-a000-000000000005', 1, 'a0000000-0000-4000-a000-000000000002',
       now() - interval '2 days',
       '[{"criterion":"coding","score_1_5":5,"notes":"QA: strong"},
         {"criterion":"communication","score_1_5":4,"notes":"QA: clear"}]'::jsonb,
       'strong_yes', now() - interval '1 day'
where not exists (
  select 1 from public.interview_rounds r
  where r.candidate_id = 'ca4d0000-0000-4000-a000-000000000005' and r.round_no = 1
);

-- An UNSUBMITTED round on the interview candidate (hire must stay blocked).
insert into public.interview_rounds (candidate_id, round_no, interviewer_id, scheduled_at)
select 'ca4d0000-0000-4000-a000-000000000003', 1, 'a0000000-0000-4000-a000-000000000002',
       now() + interval '2 days'
where not exists (
  select 1 from public.interview_rounds r
  where r.candidate_id = 'ca4d0000-0000-4000-a000-000000000003' and r.round_no = 1
);

insert into public.offers (candidate_id, rate_minor, rate_period, start_date, status)
select 'ca4d0000-0000-4000-a000-000000000005', 10000, 'hourly', current_date + 21, 'sent'
where not exists (
  select 1 from public.offers o where o.candidate_id = 'ca4d0000-0000-4000-a000-000000000005'
);

insert into public.onboarding_tasks (candidate_id, task, owner_id, due_date)
select 'ca4d0000-0000-4000-a000-000000000006', v.t,
       'a0000000-0000-4000-a000-000000000001', current_date + v.off
from (values ('QA: create the login', 1), ('QA: sign the contract', 3), ('QA: set the cost rate', 5)) as v(t, off)
where not exists (
  select 1 from public.onboarding_tasks o
  where o.candidate_id = 'ca4d0000-0000-4000-a000-000000000006' and o.task = v.t
);

-- ----------------------------------------------------------------------------
-- 10. Calendar + notifications so those screens are never empty for QA
-- ----------------------------------------------------------------------------
insert into public.calendar_events
  (id, title, description, location, starts_at, ends_at, organizer_id, client_id)
values
  ('e0e00000-0000-4000-a000-000000000001', 'QA: past retro', 'Already happened', 'Office',
   now() - interval '3 days', now() - interval '3 days' + interval '1 hour',
   'a0000000-0000-4000-a000-000000000002', 'c0000000-0000-4000-a000-000000000001'),
  ('e0e00000-0000-4000-a000-000000000002', 'QA: today standup', 'Happening today', 'Meet',
   date_trunc('day', now()) + interval '9 hours', date_trunc('day', now()) + interval '9 hours 30 minutes',
   'a0000000-0000-4000-a000-000000000002', null),
  ('e0e00000-0000-4000-a000-000000000003', 'QA: client review next week', 'Upcoming', 'Zoom',
   now() + interval '7 days', now() + interval '7 days' + interval '90 minutes',
   'a0000000-0000-4000-a000-000000000002', 'c0000000-0000-4000-a000-000000000002')
on conflict (id) do nothing;

insert into public.calendar_attendees (event_id, user_id)
select v.e, v.u from (values
  ('e0e00000-0000-4000-a000-000000000002'::uuid, 'a0000000-0000-4000-a000-000000000008'::uuid),
  ('e0e00000-0000-4000-a000-000000000003'::uuid, 'a0000000-0000-4000-a000-000000000008'::uuid)
) as v(e, u)
where not exists (
  select 1 from public.calendar_attendees a where a.event_id = v.e and a.user_id = v.u
);

insert into public.calendar_attendees (event_id, email, name)
select 'e0e00000-0000-4000-a000-000000000003', 'guest@northwind.test', 'QA External Guest'
where not exists (
  select 1 from public.calendar_attendees a where a.email = 'guest@northwind.test'
);
