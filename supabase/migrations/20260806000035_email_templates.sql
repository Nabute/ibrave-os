-- ----------------------------------------------------------------------------
-- Editable email templates. Each department owns its templates: finance edits
-- billing/dunning letters, sales its outreach, recruiting its candidate mail,
-- and admin everything (incl. the 'general' set). Templates are plain text
-- with {{placeholders}}; the composer and the dunning/invite senders fill
-- them at send time. Deleting a template is not allowed, senders fall back
-- to built-in copy only when a key has never been seeded.
-- ----------------------------------------------------------------------------
create table public.email_templates (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,          -- machine key, e.g. 'dunning-courtesy'
  name        text not null,                 -- human label in the editor
  department  text not null check (department in ('finance', 'sales', 'talent', 'general')),
  subject     text not null,
  body        text not null,                 -- plain text; {{vars}}; blank line = paragraph
  variables   text[] not null default '{}',  -- documented placeholders for the editor
  updated_by  uuid references public.profiles (id),
  updated_at  timestamptz not null default now()
);

create trigger set_updated_at before update on public.email_templates
  for each row execute function public.tg_set_updated_at();

alter table public.email_templates enable row level security;

-- Everyone signed in can READ (the composer offers them); editing is
-- department-scoped. owner/admin pass every has_role() check implicitly.
create or replace function public.can_edit_template(p_department text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case p_department
    when 'finance' then public.has_role('finance')
    when 'sales'   then public.has_role('sales')
    when 'talent'  then public.has_role('recruiter')
    else public.has_role('admin')
  end;
$$;

create policy email_templates_read on public.email_templates
  for select using (auth.uid() is not null);
create policy email_templates_update on public.email_templates
  for update using (public.can_edit_template(department))
  with check (public.can_edit_template(department));
create policy email_templates_insert on public.email_templates
  for insert with check (public.can_edit_template(department));
-- no delete policy: templates are edited, never removed

-- Record who last touched a template.
create or replace function public.tg_email_templates_stamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger email_templates_stamp before insert or update on public.email_templates
  for each row execute function public.tg_email_templates_stamp();

-- ----------------------------------------------------------------------------
-- Seed defaults (idempotent), the copy the departments start from.
-- ----------------------------------------------------------------------------
insert into public.email_templates (key, name, department, subject, body, variables) values
  ('invoice-send', 'Invoice delivery', 'finance',
   'Invoice {{invoice_number}}, {{amount}} {{currency}}',
   E'Dear {{client_name}},\n\nPlease find invoice {{invoice_number}} for {{amount}} {{currency}}, due {{due_date}}, attached as PDF.\n\nThank you for your business.',
   array['client_name', 'invoice_number', 'amount', 'currency', 'due_date']),

  ('dunning-courtesy', 'Dunning, courtesy (due in 3 days)', 'finance',
   'Upcoming invoice {{invoice_number}}',
   E'Dear {{client_name}},\n\nThis is a friendly reminder that the invoice below is due soon.\n\nIf payment has already been made, please disregard this message.',
   array['client_name', 'invoice_number', 'amount', 'currency', 'due_date']),

  ('dunning-overdue-7', 'Dunning, 7 days overdue', 'finance',
   'Overdue invoice {{invoice_number}}',
   E'Dear {{client_name}},\n\nA gentle reminder that the invoice below is now {{days_overdue}} days past due.\n\nIf payment has already been made, please disregard this message.',
   array['client_name', 'invoice_number', 'amount', 'currency', 'due_date', 'days_overdue']),

  ('dunning-overdue-14', 'Dunning, 14 days overdue', 'finance',
   'Second notice: invoice {{invoice_number}}',
   E'Dear {{client_name}},\n\nSecond notice: the invoice below remains unpaid, {{days_overdue}} days past due.\n\nPlease arrange payment at your earliest convenience, or let us know if something is blocking it.',
   array['client_name', 'invoice_number', 'amount', 'currency', 'due_date', 'days_overdue']),

  ('dunning-overdue-30', 'Dunning, 30 days overdue (final)', 'finance',
   'Final notice: invoice {{invoice_number}}',
   E'Dear {{client_name}},\n\nFinal notice before escalation: the invoice below is {{days_overdue}} days overdue.\n\nPlease treat this as urgent.',
   array['client_name', 'invoice_number', 'amount', 'currency', 'due_date', 'days_overdue']),

  ('prospect-intro', 'Prospect introduction', 'sales',
   'Engineering capacity for {{company}}',
   E'Hi {{contact_name}},\n\nI''m reaching out from ibrave, we provide senior software engineering teams to companies like {{company}}.\n\nWould you be open to a short call this week?',
   array['contact_name', 'company']),

  ('quote-followup', 'Quote follow-up', 'sales',
   'Following up on our proposal',
   E'Hi {{contact_name}},\n\nI wanted to follow up on the proposal we sent over. Happy to walk through it together or adjust the scope.\n\nWhen would suit you?',
   array['contact_name', 'company']),

  ('candidate-outreach', 'Candidate outreach', 'talent',
   'Opportunity at ibrave, {{role_title}}',
   E'Hi {{candidate_name}},\n\nYour profile stood out to us for a {{role_title}} position at ibrave.\n\nWould you be open to a short conversation?',
   array['candidate_name', 'role_title']),

  ('interview-invite', 'Interview invitation', 'talent',
   'Interview invitation, ibrave',
   E'Hi {{candidate_name}},\n\nWe''d like to invite you to an interview. The attached calendar invite has the details.\n\nLooking forward to speaking with you.',
   array['candidate_name', 'role_title']),

  ('event-invite', 'Calendar event invitation', 'general',
   'Invitation: {{title}}, {{date}} {{time}}',
   E'You''re invited to {{title}}.\n\n{{date}}, {{time}}{{location}}\n\nThe attached invite adds it to your calendar.',
   array['title', 'date', 'time', 'location'])
on conflict (key) do nothing;
