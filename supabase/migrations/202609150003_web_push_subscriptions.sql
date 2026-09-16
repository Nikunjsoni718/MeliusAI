begin;

create table if not exists public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null check (endpoint ~ '^https://'),
  p256dh text not null check (length(p256dh) > 0),
  auth text not null check (length(auth) > 0),
  expiration_time bigint,
  user_agent text,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (endpoint)
);

create index if not exists web_push_subscriptions_user_idx
  on public.web_push_subscriptions (user_id, updated_at desc);

create table if not exists public.web_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subscription_id uuid not null references public.web_push_subscriptions(id) on delete cascade,
  notification_id uuid references public.notifications(id) on delete cascade,
  email_batch_id uuid references public.notification_email_batches(id) on delete cascade,
  event_key text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'expired', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((notification_id is null) <> (email_batch_id is null)),
  unique (subscription_id, event_key)
);

create index if not exists web_push_deliveries_due_idx
  on public.web_push_deliveries (status, next_attempt_at, created_at);
create index if not exists web_push_deliveries_user_idx
  on public.web_push_deliveries (user_id, status, created_at desc);

alter table public.web_push_subscriptions enable row level security;
alter table public.web_push_deliveries enable row level security;

revoke all on table public.web_push_subscriptions, public.web_push_deliveries from anon;
revoke all on table public.web_push_subscriptions, public.web_push_deliveries from authenticated;

grant select, insert, update, delete on table public.web_push_subscriptions to authenticated;
grant all on table public.web_push_subscriptions, public.web_push_deliveries to service_role;

drop policy if exists "Push subscription owners manage their devices" on public.web_push_subscriptions;
create policy "Push subscription owners manage their devices"
  on public.web_push_subscriptions for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Service role manages web push subscriptions" on public.web_push_subscriptions;
create policy "Service role manages web push subscriptions"
  on public.web_push_subscriptions for all to service_role
  using (true)
  with check (true);

drop policy if exists "Service role manages web push deliveries" on public.web_push_deliveries;
create policy "Service role manages web push deliveries"
  on public.web_push_deliveries for all to service_role
  using (true)
  with check (true);

commit;
