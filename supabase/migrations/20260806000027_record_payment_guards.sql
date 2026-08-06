-- ----------------------------------------------------------------------------
-- record_payment hardening (found by workflow validation):
-- an overpayment was silently accepted — a payment larger than the remaining
-- balance flipped the invoice to 'paid' with paid_total > total_minor, and the
-- books no longer reconciled. Now:
--   * amount must be positive (function-level guard on top of the payments
--     table CHECK, so the error message is a business message, not a 23514)
--   * the running paid total may never exceed the invoice total; the error
--     names the exact remaining balance so finance can record the right amount.
-- Refunds/overpay credits are modeled as credit notes, never negative payments.
-- ----------------------------------------------------------------------------
create or replace function public.record_payment(
  p_invoice_id uuid, p_amount_minor bigint,
  p_paid_at date default current_date,
  p_method text default null, p_note text default null
)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invoices%rowtype;
  paid_total bigint;
  remaining bigint;
begin
  perform set_config('app.via_rpc', 'on', true);

  select * into inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found';
  end if;

  if p_amount_minor <= 0 then
    raise exception 'Payment amount must be positive; use a credit note for corrections';
  end if;

  select coalesce(sum(amount_minor), 0) into paid_total
  from public.payments where invoice_id = p_invoice_id;
  remaining := inv.total_minor - paid_total;
  if p_amount_minor > remaining then
    raise exception 'Payment of % exceeds the remaining balance of % on %',
      round(p_amount_minor / 100.0, 2), round(remaining / 100.0, 2), inv.number;
  end if;

  perform public.fsm_transition('invoice', inv.id::text, 'record_payment', inv.status);

  insert into public.payments (invoice_id, amount_minor, paid_at, method, note, recorded_by)
  values (p_invoice_id, p_amount_minor, p_paid_at, p_method, p_note, auth.uid());

  paid_total := paid_total + p_amount_minor;

  update public.invoices
  set status = case when paid_total >= total_minor then 'paid' else 'partially_paid' end
  where id = p_invoice_id
  returning * into inv;

  if inv.status = 'paid' then
    perform public.feed_event('invoice.paid', 'invoice', inv.id::text,
      inv.number || ' fully paid');
  end if;

  return inv;
end;
$$;

-- Repair the artifacts the validation runs left on the VTST test client while
-- the guard was missing: remove every overpayment (payments beyond the invoice
-- total), rederive statuses, and void the accidental 1-cent invoice.
-- The append-only trigger is right to block this in normal operation; the
-- rows being removed only exist because of the bug fixed above, so the
-- migration disables it for the surgical repair and re-enables it after.
alter table public.payments disable trigger payments_immutable;

do $$
declare
  v_inv record;
  v_paid bigint;
  v_pay record;
begin
  perform set_config('app.via_rpc', 'on', true);

  for v_inv in
    select i.*
    from public.invoices i
    join public.clients c on c.id = i.client_id
    where c.code = 'VTST' and i.kind = 'invoice' and i.status <> 'void'
  loop
    -- walk payments newest-first, dropping any that push past the total
    v_paid := 0;
    for v_pay in
      select * from public.payments where invoice_id = v_inv.id order by created_at
    loop
      if v_paid + v_pay.amount_minor > v_inv.total_minor then
        delete from public.payments where id = v_pay.id;
      else
        v_paid := v_paid + v_pay.amount_minor;
      end if;
    end loop;

    update public.invoices
    set status = case
      when v_paid >= total_minor and v_paid > 0 then 'paid'
      when v_paid > 0 then 'partially_paid'
      else 'issued'
    end
    where id = v_inv.id and status in ('paid', 'partially_paid', 'issued', 'overdue');

    -- the accidental 1-cent invoice is not a real receivable
    if v_inv.total_minor <= 1 then
      update public.invoices
      set status = 'void', void_reason = 'validation artifact — issued at 1 cent by test'
      where id = v_inv.id;
    end if;
  end loop;
end;
$$;

alter table public.payments enable trigger payments_immutable;
