-- ============================================================================
-- 0023 PER-CLIENT INVOICE NUMBERING
-- Numbers follow {prefix}-{CLIENT_CODE}-{YYYY}-{NNNN} where NNNN counts
-- invoices PER CLIENT per year (e.g. INV-HWAC-2026-0001, INV-HWAC-2026-0002).
-- Clients without a code fall back to a company-wide counter and the plain
-- {prefix}-{YYYY}-{NNNN} format. Numbers are still claimed under row lock at
-- issue time and never reused.
-- ============================================================================

-- Sentinel row key for the company-wide (no client code) counter.
alter table public.invoice_counters
  add column client_id uuid not null default '00000000-0000-0000-0000-000000000000';

alter table public.invoice_counters drop constraint invoice_counters_pkey;
alter table public.invoice_counters add primary key (kind, year, client_id);

create or replace function public.issue_invoice(p_invoice_id uuid)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invoices%rowtype;
  cs  public.company_settings%rowtype;
  client_code text;
  counter_client uuid;
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
  select upper(code) into client_code from public.clients where id = inv.client_id;

  -- per-client sequence when the client has a code; company-wide otherwise
  counter_client := case when client_code is not null
                    then inv.client_id
                    else '00000000-0000-0000-0000-000000000000'::uuid end;

  insert into public.invoice_counters (kind, year, client_id, last_value)
  values (inv.kind, extract(year from now())::int, counter_client, 1)
  on conflict (kind, year, client_id)
    do update set last_value = public.invoice_counters.last_value + 1
  returning last_value into n;

  new_number :=
    case inv.kind when 'invoice' then cs.invoice_prefix else cs.credit_note_prefix end
    || coalesce('-' || client_code, '')
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

-- Credit notes follow the same per-client scheme (CN-HWAC-2026-0001).
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
  client_code text;
  counter_client uuid;
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
  select upper(code) into client_code from public.clients where id = orig.client_id;
  counter_client := case when client_code is not null
                    then orig.client_id
                    else '00000000-0000-0000-0000-000000000000'::uuid end;

  insert into public.invoices
    (kind, client_id, period_start, period_end, status, currency,
     credits_invoice_id, issued_at, issued_by, due_date, notes)
  values
    ('credit_note', orig.client_id, orig.period_start, orig.period_end, 'issued',
     orig.currency, orig.id, now(), auth.uid(), current_date,
     'Credit note for ' || orig.number)
  returning * into cn;

  insert into public.invoice_counters (kind, year, client_id, last_value)
  values ('credit_note', extract(year from now())::int, counter_client, 1)
  on conflict (kind, year, client_id)
    do update set last_value = public.invoice_counters.last_value + 1
  returning last_value into n;

  update public.invoices
  set number = cs.credit_note_prefix
               || coalesce('-' || client_code, '')
               || '-' || extract(year from now())::int
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
