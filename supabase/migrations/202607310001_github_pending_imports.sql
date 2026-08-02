begin;

alter table public.users
  add column if not exists github_user_id text;

with github_identities as (
  select distinct on (identity.user_id)
    identity.user_id,
    coalesce(
      nullif(identity.identity_data ->> 'provider_id', ''),
      nullif(identity.identity_data ->> 'sub', '')
    ) as github_user_id
  from auth.identities as identity
  where identity.provider = 'github'
  order by identity.user_id, identity.created_at desc
)
update public.users as app_user
set github_user_id = github_identity.github_user_id
from github_identities as github_identity
where app_user.id = github_identity.user_id
  and app_user.github_user_id is null
  and github_identity.github_user_id ~ '^[1-9][0-9]*$';

create unique index if not exists users_github_user_id_unique_idx
  on public.users (github_user_id)
  where github_user_id is not null;

create table if not exists public.pending_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  provider text not null default 'github',
  provider_repository_id text not null,
  repository_full_name text not null,
  repository_name text not null,
  html_url text,
  default_branch text,
  is_private boolean not null default false,
  status text not null default 'pending',
  webhook_delivery_id text,
  repository_payload jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pending_imports_provider_check check (provider = 'github'),
  constraint pending_imports_status_check check (status in ('pending', 'imported', 'dismissed')),
  constraint pending_imports_repository_name_check check (repository_full_name ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
  constraint pending_imports_provider_repository_unique unique (user_id, provider, provider_repository_id)
);

create index if not exists pending_imports_user_status_detected_idx
  on public.pending_imports (user_id, status, detected_at desc);

drop trigger if exists set_pending_imports_updated_at on public.pending_imports;
create trigger set_pending_imports_updated_at
before update on public.pending_imports
for each row execute function public.set_updated_at();

alter table public.pending_imports enable row level security;

drop policy if exists "Users can read their own pending imports" on public.pending_imports;
create policy "Users can read their own pending imports"
on public.pending_imports
for select
using (user_id = auth.uid());

drop policy if exists "Users can update their own pending imports" on public.pending_imports;
create policy "Users can update their own pending imports"
on public.pending_imports
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

grant select, update on public.pending_imports to authenticated;

comment on column public.users.github_user_id is
  'Stable numeric GitHub account ID captured from the linked Supabase identity.';

comment on table public.pending_imports is
  'Repositories detected from provider webhooks that still require an explicit user import decision.';

commit;
