-- ============================================================================
-- 0017 IN-APP COMMUNICATIONS & CALENDAR
-- All email is sent from inside the app (send-user-email Edge Function) and
-- every send is logged here + mirrored into the related entity's timeline.
-- Scheduling is in-app too: calendar_events + attendees (internal users and
-- external emails); invites go out as ICS attachments through the same email
-- pipeline. Users never need an outside tool.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Email log: the audit trail of every message the app sends on a user's
-- behalf. Written by the Edge Function (service role).
-- ----------------------------------------------------------------------------
create table public.email_log (
  id                bigint generated always as identity primary key,
  sent_by           uuid references public.profiles (id),
  to_emails         text[] not null,
  cc_emails         text[] not null default '{}',
  subject           text not null,
  body_html         text not null,
  status            text not null default 'sent' check (status in ('sent', 'failed')),
  error             text,
  client_id         uuid references public.clients (id) on delete set null,
  lead_id           uuid references public.leads (id) on delete set null,
  prospect_id       uuid references public.prospects (id) on delete set null,
  candidate_id      uuid references public.candidates (id) on delete set null,
  invoice_id        uuid references public.invoices (id) on delete set null,
  calendar_event_id uuid,
  created_at        timestamptz not null default now()
);

create index email_log_sender_idx on public.email_log (sent_by, created_at desc);
create index email_log_client_idx on public.email_log (client_id) where client_id is not null;

alter table public.email_log enable row level security;

create policy email_log_read on public.email_log
  for select using (
    sent_by = auth.uid()
    or public.has_role('sales') or public.has_role('finance')
    or public.has_role('recruiter') or public.has_role('account_owner'));
-- inserts come from the Edge Function (service role) only

-- ----------------------------------------------------------------------------
-- Calendar
-- ----------------------------------------------------------------------------
create table public.calendar_events (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null,
  description        text,
  location           text,          -- room, address, or meeting URL
  starts_at          timestamptz not null,
  ends_at            timestamptz not null,
  organizer_id       uuid not null references public.profiles (id),
  client_id          uuid references public.clients (id) on delete set null,
  lead_id            uuid references public.leads (id) on delete set null,
  prospect_id        uuid references public.prospects (id) on delete set null,
  candidate_id       uuid references public.candidates (id) on delete set null,
  interview_round_id uuid references public.interview_rounds (id) on delete set null,
  cancelled_at       timestamptz,
  created_at         timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index calendar_events_time_idx on public.calendar_events (starts_at);

alter table public.email_log
  add constraint email_log_event_fk
  foreign key (calendar_event_id) references public.calendar_events (id) on delete set null;

create table public.calendar_attendees (
  event_id uuid not null references public.calendar_events (id) on delete cascade,
  user_id  uuid references public.profiles (id),
  email    text,
  name     text,
  response text not null default 'pending' check (response in ('pending', 'accepted', 'declined')),
  check (num_nonnulls(user_id, email) >= 1),
  -- one row per internal user / external email
  id bigint generated always as identity primary key
);

create index calendar_attendees_event_idx on public.calendar_attendees (event_id);
create index calendar_attendees_user_idx on public.calendar_attendees (user_id)
  where user_id is not null;

alter table public.calendar_events enable row level security;
alter table public.calendar_attendees enable row level security;

create or replace function public.can_see_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.calendar_events e
    where e.id = p_event_id
      and (e.organizer_id = auth.uid()
           or exists (select 1 from public.calendar_attendees a
                      where a.event_id = e.id and a.user_id = auth.uid())
           or exists (select 1 from public.user_roles
                      where user_id = auth.uid() and role in ('owner', 'admin'))));
$$;

create policy calendar_events_read on public.calendar_events
  for select using (public.can_see_event(id));
create policy calendar_events_organizer on public.calendar_events
  for all using (organizer_id = auth.uid()) with check (organizer_id = auth.uid());
create policy calendar_attendees_read on public.calendar_attendees
  for select using (public.can_see_event(event_id));
create policy calendar_attendees_organizer on public.calendar_attendees
  for all
  using (exists (select 1 from public.calendar_events e
                 where e.id = event_id and e.organizer_id = auth.uid()))
  with check (exists (select 1 from public.calendar_events e
                      where e.id = event_id and e.organizer_id = auth.uid()));
-- Attendees can answer their own invite.
create policy calendar_attendees_respond on public.calendar_attendees
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- schedule_event: event + attendees in one transaction. Internal attendees
-- get an in-app notification immediately; the ICS email leg is the Edge
-- Function's job (the frontend calls it right after with the event id).
-- Payload:
--   { "title": …, "description": …, "location": …,
--     "starts_at": ISO, "ends_at": ISO,
--     "attendee_user_ids": [uuid], "external": [{"email":…, "name":…}],
--     "client_id"|"lead_id"|"prospect_id"|"candidate_id"|"interview_round_id": uuid? }
-- ----------------------------------------------------------------------------
create or replace function public.schedule_event(p jsonb)
returns public.calendar_events
language plpgsql
security definer
set search_path = public
as $$
declare
  ev public.calendar_events%rowtype;
  uid uuid;
  ext jsonb;
begin
  insert into public.calendar_events
    (title, description, location, starts_at, ends_at, organizer_id,
     client_id, lead_id, prospect_id, candidate_id, interview_round_id)
  values
    (p ->> 'title',
     p ->> 'description',
     p ->> 'location',
     (p ->> 'starts_at')::timestamptz,
     (p ->> 'ends_at')::timestamptz,
     auth.uid(),
     nullif(p ->> 'client_id', '')::uuid,
     nullif(p ->> 'lead_id', '')::uuid,
     nullif(p ->> 'prospect_id', '')::uuid,
     nullif(p ->> 'candidate_id', '')::uuid,
     nullif(p ->> 'interview_round_id', '')::uuid)
  returning * into ev;

  for uid in
    select value::uuid from jsonb_array_elements_text(coalesce(p -> 'attendee_user_ids', '[]'::jsonb))
  loop
    insert into public.calendar_attendees (event_id, user_id)
    values (ev.id, uid);
    if uid <> auth.uid() then
      perform public.notify_user(uid, 'calendar_invite',
        'Invite: ' || ev.title,
        to_char(ev.starts_at, 'YYYY-MM-DD HH24:MI') || ' — from ' ||
          (select full_name from public.profiles where id = auth.uid()),
        '/calendar');
    end if;
  end loop;

  for ext in
    select value from jsonb_array_elements(coalesce(p -> 'external', '[]'::jsonb))
  loop
    insert into public.calendar_attendees (event_id, email, name)
    values (ev.id, ext ->> 'email', ext ->> 'name');
  end loop;

  -- interview rounds record their event time
  if ev.interview_round_id is not null then
    update public.interview_rounds set scheduled_at = ev.starts_at
    where id = ev.interview_round_id;
  end if;

  return ev;
end;
$$;

create or replace function public.cancel_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ev public.calendar_events%rowtype;
  att record;
begin
  select * into ev from public.calendar_events where id = p_event_id for update;
  if not found then
    raise exception 'Event not found';
  end if;
  if ev.organizer_id <> auth.uid() and not public.has_role('admin') then
    raise exception 'Only the organizer cancels an event' using errcode = '42501';
  end if;
  update public.calendar_events set cancelled_at = now() where id = ev.id;
  for att in
    select user_id from public.calendar_attendees
    where event_id = ev.id and user_id is not null and user_id <> auth.uid()
  loop
    perform public.notify_user(att.user_id, 'calendar_cancelled',
      'Cancelled: ' || ev.title,
      to_char(ev.starts_at, 'YYYY-MM-DD HH24:MI'), '/calendar');
  end loop;
end;
$$;
