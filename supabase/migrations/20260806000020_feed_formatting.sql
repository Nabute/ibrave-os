-- ============================================================================
-- 0020 FIX: activity-feed money formatting — numeric division printed with
-- full precision ("5000.0000000000000000 USD"). Round to 2 dp at the emitter.
-- Re-declares the three functions whose feed/notification strings show money.
-- ============================================================================

create or replace function public.issue_invoice(p_invoice_id uuid)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invoices%rowtype;
  cs  public.company_settings%rowtype;
  n   int;
  new_number text;
begin
  perform set_config('app.via_rpc', 'on', true);

  select * into inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found';
  end if;

  perform public.fsm_transition('invoice', inv.id::text, 'issue', inv.status);

  if not exists (select 1 from public.invoice_lines where invoice_id = inv.id) then
    raise exception 'Cannot issue an empty invoice';
  end if;

  select * into cs from public.company_settings;

  insert into public.invoice_counters (kind, year, last_value)
  values (inv.kind, extract(year from now())::int, 1)
  on conflict (kind, year)
    do update set last_value = public.invoice_counters.last_value + 1
  returning last_value into n;

  new_number :=
    case inv.kind when 'invoice' then cs.invoice_prefix else cs.credit_note_prefix end
    || '-' || extract(year from now())::int
    || '-' || lpad(n::text, 4, '0');

  update public.invoices
  set status = 'issued',
      number = new_number,
      issued_at = now(),
      issued_by = auth.uid(),
      due_date = current_date + (
        select payment_terms_days from public.clients where id = inv.client_id)
  where id = inv.id
  returning * into inv;

  update public.time_entries te
  set invoice_id = inv.id
  from public.invoice_line_entries ile
  join public.invoice_lines il on il.id = ile.invoice_line_id
  where il.invoice_id = inv.id
    and te.id = ile.time_entry_id;

  perform public.feed_event('invoice.issued', 'invoice', inv.id::text,
    inv.number || ' issued to ' ||
    (select name from public.clients where id = inv.client_id) ||
    ' for ' || round(inv.total_minor / 100.0, 2) || ' ' || inv.currency);

  return inv;
end;
$$;

create or replace function public.create_credit_note(
  p_invoice_id uuid, p_amount_minor bigint, p_description text
)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  orig public.invoices%rowtype;
  cn   public.invoices%rowtype;
  cs   public.company_settings%rowtype;
  n    int;
begin
  perform set_config('app.via_rpc', 'on', true);

  select * into orig from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found';
  end if;
  if p_amount_minor <= 0 then
    raise exception 'Credit amount must be positive (it is applied as negative)';
  end if;

  perform public.fsm_transition('invoice', orig.id::text, 'credit_note', orig.status);

  select * into cs from public.company_settings;

  insert into public.invoices
    (kind, client_id, period_start, period_end, status, currency,
     credits_invoice_id, issued_at, issued_by, due_date, notes)
  values
    ('credit_note', orig.client_id, orig.period_start, orig.period_end, 'issued',
     orig.currency, orig.id, now(), auth.uid(), current_date,
     'Credit note for ' || orig.number)
  returning * into cn;

  insert into public.invoice_counters (kind, year, last_value)
  values ('credit_note', extract(year from now())::int, 1)
  on conflict (kind, year)
    do update set last_value = public.invoice_counters.last_value + 1
  returning last_value into n;

  update public.invoices
  set number = cs.credit_note_prefix || '-' || extract(year from now())::int
               || '-' || lpad(n::text, 4, '0')
  where id = cn.id;

  insert into public.invoice_lines
    (invoice_id, kind, description, quantity, unit_price_minor, amount_minor, tax_rate_pct, position)
  values
    (cn.id, 'manual', p_description, 1, -p_amount_minor, -p_amount_minor,
     (select tax_rate_pct from public.clients where id = orig.client_id), 1);

  perform public.recompute_invoice_totals(cn.id);
  perform public.feed_event('invoice.credit_note', 'invoice', cn.id::text,
    'Credit note against ' || orig.number || ' for '
      || round(p_amount_minor / 100.0, 2) || ' ' || cn.currency);

  select * into cn from public.invoices where id = cn.id;
  return cn;
end;
$$;

create or replace function public.confirm_payout_statement(p_statement_id uuid)
returns public.payout_statements
language plpgsql
security definer
set search_path = public
as $$
declare
  st public.payout_statements%rowtype;
begin
  perform set_config('app.via_rpc', 'on', true);
  select * into st from public.payout_statements where id = p_statement_id for update;
  if not found then
    raise exception 'Statement not found';
  end if;

  perform public.fsm_transition('payout_statement', st.id::text, 'confirm', st.status);

  update public.payout_statements
  set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now()
  where id = st.id
  returning * into st;

  perform public.notify_user(st.user_id, 'payout_confirmed',
    'Payout statement confirmed',
    to_char(st.period_start, 'YYYY-MM-DD') || ' → ' || to_char(st.period_end, 'YYYY-MM-DD')
      || ' · ' || round(st.total_minor / 100.0, 2) || ' ' || st.currency,
    '/payouts/' || st.id);
  perform public.feed_event('payout.confirmed', 'payout_statement', st.id::text,
    'Payout confirmed for ' ||
    (select full_name from public.profiles where id = st.user_id));

  return st;
end;
$$;
