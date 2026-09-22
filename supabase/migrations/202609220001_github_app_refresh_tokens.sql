begin;

-- GitHub App user-to-server tokens expire after eight hours. Keep the refresh
-- credential server-only alongside the existing encrypted access token.
alter table public.github_connections
  add column if not exists refresh_token text,
  add column if not exists token_expires_at timestamptz,
  add column if not exists refresh_token_expires_at timestamptz;

comment on column public.github_connections.refresh_token is
  'AES-256-GCM ciphertext for the GitHub App OAuth refresh token. Never expose through client RLS policies or API responses.';

comment on column public.github_connections.token_expires_at is
  'UTC expiry for the encrypted GitHub App OAuth access token. Refresh five minutes before this time.';

comment on column public.github_connections.refresh_token_expires_at is
  'UTC expiry for the encrypted GitHub App OAuth refresh token, when supplied by GitHub.';

commit;
