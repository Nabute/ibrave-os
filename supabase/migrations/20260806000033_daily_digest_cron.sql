-- ----------------------------------------------------------------------------
-- The reminders Edge Function now carries the notification email digest, so
-- it must run daily, not just Monday mornings. The SQL jobs inside it are
-- day-idempotent (automation_runs run_key) and the digest is exactly-once
-- (notifications.emailed_at), so the extra runs cannot double-send anything.
-- Monday 06:15 stays as the weekly timesheet-reminder anchor.
-- ----------------------------------------------------------------------------
select cron.schedule('edge-notify-digest', '0 7 * * *',
  $$select public.invoke_edge_function('reminders')$$);
