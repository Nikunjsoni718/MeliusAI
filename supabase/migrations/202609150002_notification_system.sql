begin;

alter table public.projects
  add column if not exists last_commit_at timestamptz,
  add column if not exists last_audit_at timestamptz;

do $$
begin
  if to_regclass('public.project_folders') is not null then
    alter table public.project_folders
      add column if not exists last_commit_at timestamptz,
      add column if not exists last_audit_at timestamptz;
  end if;
end $$;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id text,
  type text not null check (type in (
    'session_cooldown_re_audit',
    'audit_completed',
    'stale_project_nudge',
    'system_security'
  )),
  title text not null,
  message text not null,
  action_url text not null,
  is_read boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_read_created_idx
  on public.notifications (user_id, is_read, created_at desc);
create index if not exists notifications_user_project_type_idx
  on public.notifications (user_id, project_id, type);
create unique index if not exists notifications_cooldown_commit_unique_idx
  on public.notifications (user_id, project_id, type, (metadata ->> 'qualifying_commit_at'))
  where type = 'session_cooldown_re_audit';
create unique index if not exists notifications_audit_unique_idx
  on public.notifications (user_id, type, (metadata ->> 'audit_id'))
  where type = 'audit_completed';

create table if not exists public.notification_cooldowns (
  user_id uuid not null references public.profiles(id) on delete cascade,
  repository text not null check (repository = lower(repository) and repository ~ '^[a-z0-9_.-]+/[a-z0-9_.-]+$'),
  lines_changed integer not null check (lines_changed >= 15),
  last_qualifying_commit_at timestamptz not null,
  scheduled_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, repository)
);
create index if not exists notification_cooldowns_scheduled_idx
  on public.notification_cooldowns (scheduled_at);

create table if not exists public.notification_email_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  window_started_at timestamptz not null,
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'suppressed', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz,
  provider_idempotency_key text not null unique,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  check (due_at > window_started_at)
);
create unique index if not exists notification_email_batches_open_user_idx
  on public.notification_email_batches (user_id)
  where status in ('pending', 'processing', 'failed');
create index if not exists notification_email_batches_due_idx
  on public.notification_email_batches (status, due_at, next_attempt_at);

alter table public.notifications enable row level security;
alter table public.notification_cooldowns enable row level security;
alter table public.notification_email_batches enable row level security;

revoke all on table public.notifications from anon, authenticated;
grant select on table public.notifications to authenticated;
grant update (is_read) on table public.notifications to authenticated;
grant all on table public.notifications to service_role;

drop policy if exists "Notification owners can read" on public.notifications;
create policy "Notification owners can read"
  on public.notifications for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Notification owners can mark read" on public.notifications;
create policy "Notification owners can mark read"
  on public.notifications for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Service role manages notifications" on public.notifications;
create policy "Service role manages notifications"
  on public.notifications for all to service_role
  using (true)
  with check (true);

revoke all on table public.notification_cooldowns, public.notification_email_batches from anon, authenticated;
grant all on table public.notification_cooldowns, public.notification_email_batches to service_role;

drop policy if exists "Service role manages notification cooldowns" on public.notification_cooldowns;
create policy "Service role manages notification cooldowns"
  on public.notification_cooldowns for all to service_role
  using (true)
  with check (true);

drop policy if exists "Service role manages notification batches" on public.notification_email_batches;
create policy "Service role manages notification batches"
  on public.notification_email_batches for all to service_role
  using (true)
  with check (true);

commit;
