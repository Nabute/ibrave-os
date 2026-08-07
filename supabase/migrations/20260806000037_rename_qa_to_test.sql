-- ----------------------------------------------------------------------------
-- Rename the scenario fixtures from "QA" to "Test" so the documentation, the
-- data and the logins all use one word. Emails move qa.* -> test.*, the
-- password becomes Passw0rd!Test, invoice tags QA-* become TEST-*, and the
-- "QA:" / "QA " prose in seeded notes becomes "Test". Idempotent.
-- ----------------------------------------------------------------------------
set local search_path = public, extensions;
select set_config('app.via_rpc', 'on', false);

-- 1. Logins ------------------------------------------------------------------
do $$
declare u record; new_email text;
begin
  for u in select id, email from auth.users where email like 'qa.%@ibrave.co' loop
    new_email := replace(u.email, 'qa.', 'test.');
    -- a previous run (or a fresh migration 36) may already own the address
    if exists (select 1 from auth.users x where x.email = new_email and x.id <> u.id) then
      continue;
    end if;
    update auth.users
      set email = new_email,
          encrypted_password = crypt('Passw0rd!Test', gen_salt('bf'))
      where id = u.id;
    update auth.identities
      set identity_data = jsonb_set(identity_data, '{email}', to_jsonb(new_email))
      where user_id = u.id and provider = 'email';
    update public.profiles set email = new_email where id = u.id;
  end loop;
end;
$$;

-- Profile display names and titles.
update public.profiles
set full_name = replace(full_name, 'QA ', 'Test '),
    title     = replace(coalesce(title, ''), 'QA ', 'Test ')
where full_name like 'QA %';

-- 2. Invoice tags and seeded prose -------------------------------------------
update public.invoices set notes = replace(notes, 'QA-', 'TEST-')
where notes like 'QA-%';
update public.invoices set void_reason = replace(void_reason, 'QA:', 'Test:')
where void_reason like 'QA:%';

update public.clients   set notes = replace(notes, 'QA:', 'Test:') where notes like 'QA:%';
update public.leads     set lost_reason = replace(lost_reason, 'QA:', 'Test:') where lost_reason like 'QA:%';
update public.prospects set notes = replace(notes, 'QA:', 'Test:') where notes like 'QA:%';
update public.prospects set company = replace(company, 'QA ', 'Test ') where company like 'QA %';
update public.leads     set company = replace(company, 'QA ', 'Test ') where company like 'QA %';

update public.candidates
set full_name = replace(full_name, 'QA ', 'Test '),
    notes = replace(coalesce(notes, ''), 'QA:', 'Test:'),
    rejection_reason = replace(coalesce(rejection_reason, ''), 'QA:', 'Test:')
where full_name like 'QA %';

update public.requisitions
set role_title = replace(role_title, 'QA ', 'Test '),
    notes = replace(coalesce(notes, ''), 'QA:', 'Test:')
where role_title like 'QA %';

update public.staffing_requests
set role_title = replace(role_title, 'QA ', 'Test '),
    notes = replace(coalesce(notes, ''), 'QA:', 'Test:')
where role_title like 'QA %';

update public.opportunities set description = replace(description, 'QA ', 'Test ')
where description like 'QA %';
update public.escalations set summary = replace(summary, 'QA ', 'Test '),
    resolution = replace(coalesce(resolution, ''), 'QA:', 'Test:')
where summary like 'QA %';
update public.contracts set notes = replace(notes, 'QA:', 'Test:') where notes like 'QA:%';
update public.cadences set name = replace(name, 'QA ', 'Test ') where name like 'QA %';

update public.sales_tasks set description = replace(description, 'QA:', 'Test:')
where description like 'QA:%';
update public.onboarding_tasks set task = replace(task, 'QA:', 'Test:') where task like 'QA:%';
update public.time_off set note = replace(note, 'QA ', 'Test ') where note like 'QA %';

update public.calendar_events set title = replace(title, 'QA:', 'Test:') where title like 'QA:%';
update public.calendar_attendees set name = replace(name, 'QA ', 'Test ') where name like 'QA %';

-- Time entry notes are the only rows an employee sees in their own grid.
update public.time_entries
set note = replace(note, 'QA ', 'Test '),
    rejection_comment = replace(coalesce(rejection_comment, ''), 'QA:', 'Test:')
where note like 'QA %';

update public.cost_rates set note = replace(note, 'QA ', 'Test ') where note like 'QA %';
update public.rate_cards set note = replace(note, 'QA ', 'Test ') where note like 'QA %';
update public.invoice_lines set description = replace(description, 'QA ', 'Test ')
where description like 'QA %';
update public.quotes set notes = replace(notes, 'QA ', 'Test ') where notes like 'QA %';
update public.quote_lines set description = replace(description, 'QA ', 'Test ')
where description like 'QA %';
