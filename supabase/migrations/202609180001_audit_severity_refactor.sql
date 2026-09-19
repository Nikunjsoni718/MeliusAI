begin;

-- The earlier snapshot migration may not have reached every environment. Create
-- the canonical table first, then make an already-existing table complete without
-- discarding historical snapshot data. `workspace_id` is the canonical key used by
-- the audit services; `project_id` is retained as a compatibility alias.
create table if not exists public.audit_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.projects (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  commit_sha text not null,
  score integer not null default 15,
  score_delta integer,
  report jsonb not null default '{}'::jsonb,
  delta_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.audit_snapshots
  add column if not exists id uuid,
  add column if not exists workspace_id uuid,
  add column if not exists project_id uuid,
  add column if not exists commit_sha text,
  add column if not exists score integer,
  add column if not exists score_delta integer,
  add column if not exists report jsonb,
  add column if not exists delta_summary text,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

-- Complete nullable legacy rows before adding defaults and non-null guarantees to
-- fields created by this migration. Existing score_delta values remain readable,
-- but new reports write it as null.
update public.audit_snapshots
  set id = gen_random_uuid()
  where id is null;

update public.audit_snapshots
  set score = 15
  where score is null;

update public.audit_snapshots
  set report = '{}'::jsonb
  where report is null;

update public.audit_snapshots
  set created_at = now()
  where created_at is null;

update public.audit_snapshots
  set updated_at = created_at
  where updated_at is null;

-- Some older environments used project_id rather than workspace_id. Keep both
-- aliases populated so application writes and historical reads remain compatible.
update public.audit_snapshots
  set workspace_id = coalesce(workspace_id, project_id),
      project_id = coalesce(project_id, workspace_id)
  where workspace_id is null or project_id is null;

alter table public.audit_snapshots
  alter column id set default gen_random_uuid(),
  alter column id set not null,
  alter column score set default 15,
  alter column score set not null,
  alter column report set default '{}'::jsonb,
  alter column report set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null,
  alter column score_delta drop not null;

-- Preserve a pre-existing primary key if one exists. Fresh or incomplete tables
-- receive the canonical id primary key after the UUID backfill above.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.audit_snapshots'::regclass
      and contype = 'p'
  ) then
    alter table public.audit_snapshots
      add constraint audit_snapshots_pkey primary key (id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.audit_snapshots'::regclass
      and conname = 'audit_snapshots_workspace_id_fkey'
  ) then
    alter table public.audit_snapshots
      add constraint audit_snapshots_workspace_id_fkey
      foreign key (workspace_id) references public.projects (id) on delete cascade not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.audit_snapshots'::regclass
      and conname = 'audit_snapshots_project_id_fkey'
  ) then
    alter table public.audit_snapshots
      add constraint audit_snapshots_project_id_fkey
      foreign key (project_id) references public.projects (id) on delete cascade not valid;
  end if;
end $$;

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

-- Apply the severity-refactor score ceiling only after the snapshot schema is
-- guaranteed to exist. Historical data is capped in place, while source code and
-- the RPC enforce the 15-point floor for all newly-created engineering audits.
update public.projects
  set score = least(score, 98),
      evaluation_score = least(evaluation_score, 98),
      logic_score = least(logic_score, 98)
  where score > 98 or evaluation_score > 98 or logic_score > 98;

update public.project_folders
  set score = least(score, 98),
      evaluation_score = least(evaluation_score, 98)
  where score > 98 or evaluation_score > 98;

update public.audit_snapshots
  set score = least(score, 98)
  where score > 98;

alter table public.projects
  drop constraint if exists projects_audit_score_ceiling,
  add constraint projects_audit_score_ceiling
    check (
      (score is null or score <= 98)
      and (evaluation_score is null or evaluation_score <= 98)
      and (logic_score is null or logic_score <= 98)
    );

alter table public.project_folders
  drop constraint if exists project_folders_audit_score_ceiling,
  add constraint project_folders_audit_score_ceiling
    check (
      (score is null or score <= 98)
      and (evaluation_score is null or evaluation_score <= 98)
    );

alter table public.audit_snapshots
  drop constraint if exists audit_snapshots_score_check,
  add constraint audit_snapshots_score_check check (score between 0 and 98);

create or replace function public.finalize_verified_audit(
  p_diff_id uuid,
  p_user_id uuid,
  p_expected_version bigint,
  p_report jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.workspace_repository_states;
  d public.workspace_diffs;
  score_value integer;
  projection public.project_folders;
begin
  select s0.* into s
  from public.workspace_repository_states s0
  join public.workspace_diffs d0 on d0.repository_state_id = s0.id
  where d0.id = p_diff_id and s0.user_id = p_user_id
  for update of s0;

  if not found or not exists (
    select 1
    from public.project_folders
    where id = s.workspace_id and user_id = p_user_id
  ) then
    raise exception 'WORKSPACE_NOT_FOUND';
  end if;

  select * into strict d
  from public.workspace_diffs
  where id = p_diff_id
  for update;

  if d.status = 'verified' then
    if s.baseline_version <> d.baseline_version + 1
       or s.last_verified_commit_sha <> d.head_sha then
      raise exception 'VERIFY_CONFLICT';
    end if;
    return d.audit_report;
  end if;

  if d.baseline_version <> p_expected_version
     or s.baseline_version <> p_expected_version
     or s.last_verified_commit_sha <> d.base_sha then
    raise exception 'VERIFY_CONFLICT';
  end if;

  if jsonb_typeof(p_report) is distinct from 'object'
     or jsonb_typeof(p_report->'score') is distinct from 'number'
     or jsonb_typeof(p_report->'pros') is distinct from 'array'
     or jsonb_typeof(p_report->'cons') is distinct from 'array'
     or jsonb_typeof(p_report->'recommendations') is distinct from 'array'
     or jsonb_typeof(p_report->'finding_impacts') is distinct from 'object'
     or jsonb_typeof(p_report->'executive_summary') is distinct from 'string'
     or jsonb_typeof(p_report->'delta_summary') is distinct from 'string'
     or p_report ? 'score_delta'
     or p_report ? 'scoreDelta' then
    raise exception 'INVALID_DIFF';
  end if;

  score_value := (p_report->>'score')::integer;
  if score_value < 15 or score_value > 98 then
    raise exception 'INVALID_DIFF';
  end if;

  projection := jsonb_populate_record(null::public.project_folders, p_report);

  update public.project_folders
    set evaluation_score = score_value,
        score_delta = null,
        delta_summary = p_report->>'delta_summary',
        executive_summary = p_report->>'executive_summary',
        pros = projection.pros,
        cons = projection.cons,
        recommendations = projection.recommendations,
        audit_findings = p_report->'finding_impacts',
        has_been_audited = true
    where id = s.workspace_id and user_id = p_user_id;

  if not found then
    raise exception 'WORKSPACE_NOT_FOUND';
  end if;

  update public.workspace_diffs
    set audit_report = p_report,
        status = 'verified',
        error_code = null,
        verified_at = now(),
        updated_at = now()
    where id = d.id;

  update public.workspace_repository_states
    set last_verified_commit_sha = d.head_sha,
        baseline_version = baseline_version + 1,
        previous_verified_report = p_report,
        verified_at = now(),
        updated_at = now()
    where id = s.id;

  return p_report;
end;
$$;

revoke all on function public.finalize_verified_audit(uuid, uuid, bigint, jsonb)
  from public, anon, authenticated;
grant execute on function public.finalize_verified_audit(uuid, uuid, bigint, jsonb)
  to service_role;

commit;
