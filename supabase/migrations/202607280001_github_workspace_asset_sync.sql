begin;

alter table public.projects
  add column if not exists storage_path text,
  add column if not exists github_repository text,
  add column if not exists github_file_path text,
  add column if not exists github_ref text,
  add column if not exists github_commit_sha text,
  add column if not exists github_sync_status text not null default 'untracked',
  add column if not exists github_synced_at timestamptz,
  add column if not exists github_sync_error text;

alter table public.projects
  drop constraint if exists projects_github_sync_status_check;

alter table public.projects
  add constraint projects_github_sync_status_check
  check (github_sync_status in ('untracked', 'synced', 'deleted', 'error'));

create index if not exists projects_github_repository_path_idx
  on public.projects (github_repository, github_file_path)
  where github_repository is not null
    and github_file_path is not null;

comment on column public.projects.storage_path is
  'Relative object path in the Supabase workspace storage bucket.';

comment on column public.projects.github_repository is
  'Lowercase GitHub owner/repository identifier used to match push webhooks.';

comment on column public.projects.github_file_path is
  'Repository-relative source path used to match push webhook file changes.';

comment on column public.projects.github_sync_status is
  'Webhook synchronization state: untracked, synced, deleted, or error.';

commit;
