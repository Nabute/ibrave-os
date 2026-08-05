-- ============================================================================
-- 0002 WORKFLOW FSM INFRASTRUCTURE
-- Declarative finite-state machines: transitions are data, not scattered ifs.
--   * workflow_transitions — the allowed (entity_type, action, from → to) map,
--     with the role required to perform each action.
--   * fsm_transition()     — the single guard every state-changing RPC calls:
--     validates the action exists, the from-state matches, and the caller
--     holds the required role; records history; returns the target state.
--   * workflow_history     — append-only trail of every transition.
--   * fsm_actions()        — HATEOAS: the actions available to the current
--     user on an entity in a given state, returned as a `_links`-style jsonb
--     object the frontend renders buttons from.
-- ============================================================================

create table public.workflow_transitions (
  entity_type      text not null,
  action           text not null,
  from_state       text not null,
  to_state         text not null,
  required_role    public.app_role not null,
  requires_comment boolean not null default false,
  label            text not null,
  is_destructive   boolean not null default false,
  sort_order       int not null default 0,
  primary key (entity_type, action, from_state)
);

alter table public.workflow_transitions enable row level security;

create policy workflow_transitions_read on public.workflow_transitions
  for select using (auth.uid() is not null);
-- Definition changes happen via migrations only: no write policies.

create table public.workflow_history (
  id          bigint generated always as identity primary key,
  entity_type text not null,
  entity_id   text not null,
  action      text not null,
  from_state  text not null,
  to_state    text not null,
  actor_id    uuid references auth.users (id),
  comment     text,
  at          timestamptz not null default now()
);

create index workflow_history_entity_idx
  on public.workflow_history (entity_type, entity_id, at desc);

alter table public.workflow_history enable row level security;

create policy workflow_history_read on public.workflow_history
  for select using (auth.uid() is not null);

create trigger workflow_history_immutable
  before update or delete on public.workflow_history
  for each row execute function public.tg_forbid_change();

-- ----------------------------------------------------------------------------
-- The FSM guard. Called from inside state-changing RPCs (which are SECURITY
-- DEFINER), so it re-checks the caller's role itself rather than relying on
-- RLS.
-- ----------------------------------------------------------------------------
create or replace function public.fsm_transition(
  p_entity_type text,
  p_entity_id   text,
  p_action      text,
  p_from_state  text,
  p_comment     text default null
)
returns text  -- the target state
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.workflow_transitions%rowtype;
begin
  select * into t
  from public.workflow_transitions
  where entity_type = p_entity_type
    and action = p_action
    and from_state = p_from_state;

  if not found then
    -- Distinguish "unknown action" from "wrong state" for a useful error.
    if exists (select 1 from public.workflow_transitions
               where entity_type = p_entity_type and action = p_action) then
      raise exception 'Cannot % a % in state "%"', p_action, p_entity_type, p_from_state
        using errcode = 'P0002';
    end if;
    raise exception 'Unknown action "%" for %', p_action, p_entity_type
      using errcode = 'P0002';
  end if;

  if not public.has_role(t.required_role::text) then
    raise exception 'Role "%" required to % a %', t.required_role, p_action, p_entity_type
      using errcode = '42501';
  end if;

  if t.requires_comment and (p_comment is null or btrim(p_comment) = '') then
    raise exception 'A comment is required to % a %', p_action, p_entity_type
      using errcode = 'P0003';
  end if;

  insert into public.workflow_history
    (entity_type, entity_id, action, from_state, to_state, actor_id, comment)
  values
    (p_entity_type, p_entity_id, p_action, p_from_state, t.to_state, auth.uid(), p_comment);

  perform public.write_audit(
    p_entity_type || '.' || p_action,
    p_entity_type,
    p_entity_id,
    jsonb_build_object('from', p_from_state, 'to', t.to_state, 'comment', p_comment)
  );

  return t.to_state;
end;
$$;

-- ----------------------------------------------------------------------------
-- HATEOAS: actions available on an entity in a given state, for the current
-- user. Entity-specific RPCs may add per-row guards on top (e.g. "PM of this
-- project"), which they pass in as p_allowed_actions to intersect with.
-- Returns e.g.:
--   { "submit": { "action": "submit", "to_state": "submitted",
--                 "label": "Submit week", "requires_comment": false,
--                 "destructive": false } }
-- ----------------------------------------------------------------------------
create or replace function public.fsm_actions(
  p_entity_type text,
  p_state       text,
  p_allowed_actions text[] default null  -- null = no extra restriction
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_object_agg(
      t.action,
      jsonb_build_object(
        'action', t.action,
        'to_state', t.to_state,
        'label', t.label,
        'requires_comment', t.requires_comment,
        'destructive', t.is_destructive
      )
      order by t.sort_order
    ),
    '{}'::jsonb
  )
  from public.workflow_transitions t
  where t.entity_type = p_entity_type
    and t.from_state = p_state
    and public.has_role(t.required_role::text)
    and (p_allowed_actions is null or t.action = any (p_allowed_actions));
$$;

-- ----------------------------------------------------------------------------
-- FSM definitions for the Phase 1–2 entities.
-- time_entry: draft → submitted → approved | rejected(→draft)
-- invoice:    draft → issued → paid | partially_paid | overdue | void
-- payout_statement (Phase 3, defined now for completeness): draft → confirmed → paid
-- ----------------------------------------------------------------------------
insert into public.workflow_transitions
  (entity_type, action, from_state, to_state, required_role, requires_comment, label, is_destructive, sort_order)
values
  -- time entries
  ('time_entry', 'submit',  'draft',     'submitted', 'employee', false, 'Submit',              false, 1),
  ('time_entry', 'approve', 'submitted', 'approved',  'pm',       false, 'Approve',             false, 1),
  ('time_entry', 'reject',  'submitted', 'draft',     'pm',       true,  'Reject',              true,  2),
  -- invoices
  ('invoice', 'issue',          'draft',          'issued',         'finance', false, 'Issue invoice',    false, 1),
  ('invoice', 'delete_draft',   'draft',          'deleted',        'finance', false, 'Delete draft',     true,  9),
  ('invoice', 'record_payment', 'issued',         'issued',         'finance', false, 'Record payment',   false, 1),
  ('invoice', 'record_payment', 'partially_paid', 'partially_paid', 'finance', false, 'Record payment',   false, 1),
  ('invoice', 'record_payment', 'overdue',        'overdue',        'finance', false, 'Record payment',   false, 1),
  ('invoice', 'void',           'issued',         'void',           'finance', true,  'Void invoice',     true,  8),
  ('invoice', 'void',           'overdue',        'void',           'finance', true,  'Void invoice',     true,  8),
  ('invoice', 'void',           'partially_paid', 'void',           'finance', true,  'Void invoice',     true,  8),
  ('invoice', 'credit_note',    'issued',         'issued',         'finance', false, 'Create credit note', false, 5),
  ('invoice', 'credit_note',    'paid',           'paid',           'finance', false, 'Create credit note', false, 5),
  ('invoice', 'credit_note',    'partially_paid', 'partially_paid', 'finance', false, 'Create credit note', false, 5),
  ('invoice', 'credit_note',    'overdue',        'overdue',        'finance', false, 'Create credit note', false, 5),
  -- payout statements (Phase 3)
  ('payout_statement', 'confirm',   'draft',     'confirmed', 'finance', false, 'Confirm statement', false, 1),
  ('payout_statement', 'mark_paid', 'confirmed', 'paid',      'finance', false, 'Mark paid',         false, 1);
