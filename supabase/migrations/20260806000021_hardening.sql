-- ============================================================================
-- 0021 PHASE 10 — HARDENING
--   * Accounting export (D-5): double-entry journal view of issued invoices,
--     credit notes and payments, mapped to configurable account codes.
--   * Client digests (C-3): monthly hours summary per client, drafted for the
--     account owner to review and send through the in-app composer.
--   * Slack notifications: activity-feed events mirrored to a Slack incoming
--     webhook (URL in Vault: select vault.create_secret('<url>', 'slack_webhook_url')).
-- ============================================================================

-- Account codes for the journal export — map once to your accountant's chart.
alter table public.company_settings
  add column acct_ar text not null default '1200',
  add column acct_bank text not null default '1000',
  add column acct_revenue text not null default '4000',
  add column acct_tax text not null default '2200';

-- ----------------------------------------------------------------------------
-- Accounting export (D-5). Balanced journal lines:
--   issue invoice:  debit AR total / credit revenue subtotal, credit tax
--   credit note:    reversed
--   payment:        debit bank / credit AR
-- RLS of the underlying tables applies (finance-only).
-- ----------------------------------------------------------------------------
create view public.v_accounting_export
with (security_invoker = true) as
with cs as (select * from public.company_settings limit 1)
select * from (
  -- invoice issue: AR debit
  select i.issued_at::date as entry_date, i.number as doc_number,
         cl.name as party, cs.acct_ar as account, 'Accounts receivable' as account_name,
         i.total_minor as debit_minor, 0::bigint as credit_minor, i.currency
  from public.invoices i
  join public.clients cl on cl.id = i.client_id
  cross join cs
  where i.status in ('issued', 'paid', 'partially_paid', 'overdue', 'void')
    and i.number is not null
  union all
  -- revenue credit (subtotal; negative for credit notes flips sides naturally)
  select i.issued_at::date, i.number, cl.name, cs.acct_revenue, 'Revenue',
         case when i.subtotal_minor < 0 then -i.subtotal_minor else 0 end,
         case when i.subtotal_minor >= 0 then i.subtotal_minor else 0 end,
         i.currency
  from public.invoices i
  join public.clients cl on cl.id = i.client_id
  cross join cs
  where i.status in ('issued', 'paid', 'partially_paid', 'overdue', 'void')
    and i.number is not null
  union all
  -- tax credit
  select i.issued_at::date, i.number, cl.name, cs.acct_tax, 'Tax payable',
         case when i.tax_total_minor < 0 then -i.tax_total_minor else 0 end,
         case when i.tax_total_minor >= 0 then i.tax_total_minor else 0 end,
         i.currency
  from public.invoices i
  join public.clients cl on cl.id = i.client_id
  cross join cs
  where i.status in ('issued', 'paid', 'partially_paid', 'overdue', 'void')
    and i.number is not null and i.tax_total_minor <> 0
  union all
  -- payments: bank debit / AR credit
  select p.paid_at, i.number || '-PMT', cl.name, cs.acct_bank, 'Bank',
         p.amount_minor, 0, i.currency
  from public.payments p
  join public.invoices i on i.id = p.invoice_id
  join public.clients cl on cl.id = i.client_id
  cross join cs
  union all
  select p.paid_at, i.number || '-PMT', cl.name, cs.acct_ar, 'Accounts receivable',
         0, p.amount_minor, i.currency
  from public.payments p
  join public.invoices i on i.id = p.invoice_id
  join public.clients cl on cl.id = i.client_id
  cross join cs
) j;

-- ----------------------------------------------------------------------------
-- Client digest (C-3): approved hours for a month, by person and task.
-- The account owner reviews and sends it via the in-app composer.
-- ----------------------------------------------------------------------------
create or replace function public.client_digest(p_client_id uuid, p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  month_start date := date_trunc('month', p_month)::date;
  month_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
begin
  if not (public.has_role('account_owner') or public.has_role('sales')
          or public.has_role('finance') or public.has_role('pm')) then
    raise exception 'Not permitted' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'month', to_char(month_start, 'FMMonth YYYY'),
    'total_hours', (
      select coalesce(sum(te.hours), 0)
      from public.time_entries te
      join public.projects pr on pr.id = te.project_id
      where pr.client_id = p_client_id and te.status = 'approved'
        and te.work_date between month_start and month_end),
    'rows', (
      select coalesce(jsonb_agg(r order by r -> 'project', r -> 'person'), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'project', pr.name,
          'person', pf.full_name,
          'task', coalesce(t.name, '—'),
          'hours', sum(te.hours)) as r
        from public.time_entries te
        join public.projects pr on pr.id = te.project_id
        join public.profiles pf on pf.id = te.user_id
        left join public.tasks t on t.id = te.task_id
        where pr.client_id = p_client_id and te.status = 'approved'
          and te.work_date between month_start and month_end
        group by pr.name, pf.full_name, t.name
      ) x)
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- Slack mirror: feed events post to the webhook when one is configured.
-- Non-blocking (pg_net is async); absent webhook = silent no-op.
-- ----------------------------------------------------------------------------
create or replace function public.notify_slack(p_text text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  url text;
begin
  select decrypted_secret into url
  from vault.decrypted_secrets where name = 'slack_webhook_url';
  if url is null then
    return;
  end if;
  perform net.http_post(
    url := url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object('text', p_text)
  );
exception when others then
  null;  -- notifications must never break the transaction that emitted them
end;
$$;

create or replace function public.feed_event(
  p_event_type text, p_entity_type text, p_entity_id text, p_summary text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.activity_feed (event_type, entity_type, entity_id, summary, actor_id)
  values (p_event_type, p_entity_type, p_entity_id, p_summary, auth.uid());
  perform public.notify_slack('[' || p_event_type || '] ' || p_summary);
end;
$$;
