-- ----------------------------------------------------------------------------
-- Fix (found by workflow validation): the "pause dunning" toggle was dead —
-- the invoice freeze trigger rejected finance's direct dunning_paused update
-- on any issued invoice, so collections could never hold reminders on an
-- invoice under discussion. dunning_paused is a collections-workflow flag,
-- not a financial field, so a change that touches ONLY that flag (and the
-- updated_at bump) is now allowed through; everything else stays frozen.
-- ----------------------------------------------------------------------------
create or replace function public.tg_invoices_guard()
returns trigger
language plpgsql
as $$
declare
  via_rpc boolean := coalesce(current_setting('app.via_rpc', true), '') = 'on';
  only_dunning_flag boolean;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' or not via_rpc then
      raise exception 'Invoices are deleted only as drafts via delete_draft_invoice()';
    end if;
    return old;
  end if;

  only_dunning_flag :=
    (to_jsonb(new) - 'dunning_paused' - 'updated_at')
      = (to_jsonb(old) - 'dunning_paused' - 'updated_at');

  if old.status <> 'draft' and not via_rpc and not only_dunning_flag then
    raise exception 'Issued invoices are immutable; use a credit note';
  end if;
  if new.status is distinct from old.status and not via_rpc then
    raise exception 'Invoice status changes only through workflow actions';
  end if;
  -- Even a draft never changes identity fields client-side.
  if (new.number is distinct from old.number
      or new.kind is distinct from old.kind
      or new.client_id is distinct from old.client_id) and not via_rpc then
    raise exception 'Invoice number/kind/client are system-managed';
  end if;
  return new;
end;
$$;

-- Audit the pause/unpause so collections holds are traceable.
create or replace function public.tg_invoices_dunning_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.dunning_paused is distinct from old.dunning_paused then
    insert into public.audit_log (actor_id, action, entity_type, entity_id, diff)
    values (auth.uid(),
            case when new.dunning_paused then 'invoice.dunning_paused'
                 else 'invoice.dunning_resumed' end,
            'invoice', new.id::text,
            jsonb_build_object('number', new.number));
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_dunning_audit on public.invoices;
create trigger invoices_dunning_audit
  after update on public.invoices
  for each row execute function public.tg_invoices_dunning_audit();
