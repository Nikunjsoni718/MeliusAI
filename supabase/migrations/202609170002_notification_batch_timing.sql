begin;

-- Existing open batches keep their identity, retry state, and Resend idempotency
-- key. Only their fixed window deadline changes from four hours to 150 minutes.
update public.notification_email_batches
set
  due_at = window_started_at + interval '150 minutes',
  updated_at = now()
where status in ('pending', 'processing', 'failed')
  and due_at is distinct from window_started_at + interval '150 minutes';

commit;
