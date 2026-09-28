begin;

drop table if exists public.pending_imports;

notify pgrst, 'reload schema';

commit;

select pg_notification_queue_usage();
