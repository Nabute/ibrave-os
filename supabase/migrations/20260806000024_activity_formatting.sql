-- ============================================================================
-- 0024 FIX: account-timeline money formatting — the invoice→timeline trigger
-- printed numeric division at full precision ("11000.000000000000 USD").
-- Round at the emitter and clean the rows already written.
-- ============================================================================

create or replace function public.tg_invoice_account_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'issued' and old.status = 'draft' then
    insert into public.account_activities (client_id, kind, body, actor_id, source)
    values (new.client_id, 'doc',
            case new.kind when 'invoice' then 'Invoice ' else 'Credit note ' end
              || new.number || ' issued — '
              || round(new.total_minor / 100.0, 2) || ' ' || new.currency,
            auth.uid(), 'system');
  end if;
  return new;
end;
$$;

-- Repair rows already written with runaway precision.
update public.account_activities
set body = regexp_replace(body, '(\d+\.\d{2})\d+', '\1', 'g')
where body ~ '\d+\.\d{3,}';

update public.activity_feed
set summary = regexp_replace(summary, '(\d+\.\d{2})\d+', '\1', 'g')
where summary ~ '\d+\.\d{3,}';
