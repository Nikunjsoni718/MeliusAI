begin;

create table if not exists public.github_connections (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  token_ciphertext text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint github_connections_ciphertext_not_empty check (length(trim(token_ciphertext)) > 0)
);

drop trigger if exists set_github_connections_updated_at on public.github_connections;
create trigger set_github_connections_updated_at
before update on public.github_connections
for each row execute function public.set_updated_at();

alter table public.github_connections enable row level security;

revoke all on table public.github_connections from anon, authenticated;

comment on table public.github_connections is
  'Server-only encrypted GitHub OAuth credentials. Tokens are never exposed through RLS policies or client responses.';

comment on column public.github_connections.token_ciphertext is
  'AES-256-GCM ciphertext using user_id-bound additional authenticated data.';

commit;
