begin;

create table if not exists public.audit_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.projects (id) on delete cascade,
  commit_sha text not null,
  score integer not null check (score between 0 and 100),
  score_delta integer not null,
  delta_summary text not null,
  created_at timestamptz not null default now()
);

create index if not exists audit_snapshots_workspace_created_idx
  on public.audit_snapshots (workspace_id, created_at desc);

alter table public.audit_snapshots enable row level security;

drop policy if exists "Users can read snapshots for their own workspaces"
  on public.audit_snapshots;
create policy "Users can read snapshots for their own workspaces"
  on public.audit_snapshots
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.projects
      where projects.id = audit_snapshots.workspace_id
        and projects.user_id = auth.uid()
    )
  );

commit;
