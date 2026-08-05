-- ============================================================================
-- 0022 INVOICE TEMPLATE FIELDS + PER-CLIENT NUMBERING
-- Everything the branded invoice template needs, as data:
--   company: tagline, TIN, registration no., intro line, payment instructions,
--            VAT note, contact note
--   client:  short code (numbering), org no., VAT no.
-- Numbering becomes {prefix}-{CLIENT_CODE}-{YYYY}-{NNNN} when the client has a
-- code (e.g. IBR-HWAC-2026-0001), falling back to {prefix}-{YYYY}-{NNNN}.
-- ============================================================================

alter table public.company_settings
  add column tagline text not null default 'Software Engineering & Outsourcing Services',
  add column tin text,
  add column registration_no text,
  add column invoice_intro text not null default
    'Professional software engineering services delivered in accordance with the submitted monthly time reports.',
  add column payment_instructions text not null default
    'Payoneer payment request / international transfer details to be provided separately.',
  add column vat_note text not null default
    'Cross-border B2B service. VAT is not charged by the supplier; the customer accounts for applicable VAT under the reverse-charge mechanism.',
  add column contact_note text not null default
    'Invoice correspondence: via agreed client channel',
  add column issuer_name text,
  add column issuer_title text;

alter table public.clients
  add column code text unique,
  add column org_no text,
  add column vat_no text;

-- issue_invoice with client-coded numbering (replaces 0020's version; body
-- otherwise identical).
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

  insert into public.invoice_counters (kind, year, last_value)
  values (inv.kind, extract(year from now())::int, 1)
  on conflict (kind, year)
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
