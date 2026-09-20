begin;

-- `audit_snapshots` has existed in more than one shape in deployed
-- environments. Keep the UUID aliases available and make project deletion a
-- database-enforced cleanup boundary, not a best-effort application concern.
create table if not exists public.audit_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.projects (id) on delete cascade,
  project_id uuid,
  score integer not null default 15,
  score_delta integer,
  report jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.audit_snapshots
  add column if not exists workspace_id uuid,
  add column if not exists project_id uuid;

-- Do not depend on an earlier migration having installed these constraints.
-- `not valid` keeps historical orphan repair non-blocking while enforcing all
-- new writes and cascading any active project delete.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.audit_snapshots'::regclass
      and conname = 'audit_snapshots_workspace_id_project_delete_fkey'
  ) then
    alter table public.audit_snapshots
      add constraint audit_snapshots_workspace_id_project_delete_fkey
      foreign key (workspace_id) references public.projects (id) on delete cascade not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.audit_snapshots'::regclass
      and conname = 'audit_snapshots_project_id_project_delete_fkey'
  ) then
    alter table public.audit_snapshots
      add constraint audit_snapshots_project_id_project_delete_fkey
      foreign key (project_id) references public.projects (id) on delete cascade not valid;
  end if;
end $$;

create index if not exists audit_snapshots_workspace_cleanup_idx
  on public.audit_snapshots (workspace_id);
create index if not exists audit_snapshots_project_cleanup_idx
  on public.audit_snapshots (project_id)
  where project_id is not null;

-- Production deployments may have normalized findings/directives/file records
-- into their own tables. Their exact rollout order varies, so remove rows only
-- when the table and a project, workspace, or snapshot key actually exist.
-- This also makes deleting a `projects` row through a direct REST call safe.
create or replace function public.purge_project_audit_artifacts(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot_ids uuid[] := array[]::uuid[];
  target_table text;
  predicates text[];
  finding_predicates text[];
  has_project_id boolean;
  has_workspace_id boolean;
  has_audit_snapshot_id boolean;
  has_snapshot_id boolean;
  has_finding_id boolean;
  findings_has_id boolean;
  findings_has_project_id boolean;
  findings_has_workspace_id boolean;
  findings_has_audit_snapshot_id boolean;
  findings_has_snapshot_id boolean;
begin
  select coalesce(array_agg(id), array[]::uuid[])
    into snapshot_ids
  from public.audit_snapshots
  where workspace_id = p_project_id or project_id = p_project_id;

  foreach target_table in array array['directives', 'findings', 'file_records'] loop
    if to_regclass(format('public.%I', target_table)) is null then
      continue;
    end if;

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = target_table and column_name = 'project_id'
    ) into has_project_id;
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = target_table and column_name = 'workspace_id'
    ) into has_workspace_id;
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = target_table
        and column_name = 'audit_snapshot_id'
    ) into has_audit_snapshot_id;
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = target_table
        and column_name = 'snapshot_id'
    ) into has_snapshot_id;
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = target_table and column_name = 'finding_id'
    ) into has_finding_id;

    predicates := array[]::text[];
    if has_project_id then
      predicates := predicates || 'project_id = $1';
    end if;
    if has_workspace_id then
      predicates := predicates || 'workspace_id = $1';
    end if;
    if has_audit_snapshot_id then
      predicates := predicates || 'audit_snapshot_id = any($2)';
    end if;
    if has_snapshot_id then
      predicates := predicates || 'snapshot_id = any($2)';
    end if;

    -- A directives table can be linked only through findings. Include that
    -- relationship when it is available, before the findings are removed.
    if target_table = 'directives' and has_finding_id and to_regclass('public.findings') is not null then
      select exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'findings' and column_name = 'id'
      ) into findings_has_id;
      select exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'findings' and column_name = 'project_id'
      ) into findings_has_project_id;
      select exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'findings' and column_name = 'workspace_id'
      ) into findings_has_workspace_id;
      select exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'findings'
          and column_name = 'audit_snapshot_id'
      ) into findings_has_audit_snapshot_id;
      select exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'findings'
          and column_name = 'snapshot_id'
      ) into findings_has_snapshot_id;

      finding_predicates := array[]::text[];
      if findings_has_project_id then
        finding_predicates := finding_predicates || 'project_id = $1';
      end if;
      if findings_has_workspace_id then
        finding_predicates := finding_predicates || 'workspace_id = $1';
      end if;
      if findings_has_audit_snapshot_id then
        finding_predicates := finding_predicates || 'audit_snapshot_id = any($2)';
      end if;
      if findings_has_snapshot_id then
        finding_predicates := finding_predicates || 'snapshot_id = any($2)';
      end if;
      if findings_has_id and cardinality(finding_predicates) > 0 then
        predicates := predicates || format(
          'finding_id in (select id from public.findings where %s)',
          array_to_string(finding_predicates, ' or ')
        );
      end if;
    end if;

    if cardinality(predicates) > 0 then
      execute format(
        'delete from public.%I where %s',
        target_table,
        array_to_string(predicates, ' or ')
      ) using p_project_id, snapshot_ids;
    end if;
  end loop;

  delete from public.audit_snapshots
  where workspace_id = p_project_id or project_id = p_project_id;
end;
$$;

create or replace function public.projects_purge_audit_artifacts_before_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.purge_project_audit_artifacts(old.id);
  return old;
end;
$$;

drop trigger if exists projects_purge_audit_artifacts_before_delete on public.projects;
create trigger projects_purge_audit_artifacts_before_delete
before delete on public.projects
for each row execute function public.projects_purge_audit_artifacts_before_delete();

create or replace function public.project_folders_purge_audit_artifacts_before_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Some normalized audit/file-record rollouts use the folder UUID as their
  -- workspace key. Clear those rows before the workspace itself disappears.
  perform public.purge_project_audit_artifacts(old.id);
  return old;
end;
$$;

drop trigger if exists project_folders_purge_audit_artifacts_before_delete on public.project_folders;
create trigger project_folders_purge_audit_artifacts_before_delete
before delete on public.project_folders
for each row execute function public.project_folders_purge_audit_artifacts_before_delete();

-- The application deletes Storage before the database rows. These manifests
-- provide all Vault paths recorded in a project or workspace without allowing
-- a name-based lookup, and tolerate installations that do not have the
-- optional `file_records` table yet.
create or replace function public.get_project_deletion_storage_manifest(
  p_user_id uuid,
  p_project_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_project public.projects;
  storage_paths jsonb := '[]'::jsonb;
  record_paths jsonb := '[]'::jsonb;
  path_column text;
  key_column text;
begin
  select * into target_project
  from public.projects
  where id = p_project_id and user_id = p_user_id
  for update;

  if not found then
    raise exception 'PROJECT_NOT_FOUND';
  end if;

  select coalesce(jsonb_agg(path), '[]'::jsonb) into storage_paths
  from (
    values
      (nullif(btrim(to_jsonb(target_project)->>'storage_path'), '')),
      (nullif(btrim(to_jsonb(target_project)->>'file_path'), '')),
      (nullif(btrim(to_jsonb(target_project)->>'object_path'), ''))
  ) as candidates(path)
  where path is not null;

  if to_regclass('public.file_records') is not null then
    select column_name into path_column
    from information_schema.columns
    where table_schema = 'public' and table_name = 'file_records'
      and column_name in ('storage_path', 'file_path', 'object_path', 'path')
    order by case column_name
      when 'storage_path' then 1
      when 'file_path' then 2
      when 'object_path' then 3
      else 4
    end
    limit 1;

    select column_name into key_column
    from information_schema.columns
    where table_schema = 'public' and table_name = 'file_records'
      and column_name in ('project_id', 'workspace_id')
    order by case column_name when 'project_id' then 1 else 2 end
    limit 1;

    if path_column is not null and key_column is not null then
      execute format(
        'select coalesce(jsonb_agg(%1$I::text) filter (where nullif(btrim(%1$I::text), '''') is not null), ''[]''::jsonb) from public.file_records where %2$I = $1',
        path_column,
        key_column
      ) into record_paths using p_project_id;
      storage_paths := storage_paths || coalesce(record_paths, '[]'::jsonb);
    end if;
  end if;

  return jsonb_build_object('storage_paths', storage_paths);
end;
$$;

create or replace function public.get_project_folder_deletion_storage_manifest(
  p_user_id uuid,
  p_folder_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  storage_paths jsonb := '[]'::jsonb;
  record_paths jsonb := '[]'::jsonb;
  path_column text;
  key_column text;
begin
  if not exists (
    select 1 from public.project_folders
    where id = p_folder_id and user_id = p_user_id
  ) then
    raise exception 'PROJECT_FOLDER_NOT_FOUND';
  end if;

  select coalesce(jsonb_agg(path), '[]'::jsonb) into storage_paths
  from (
    select nullif(btrim(to_jsonb(project)->>'storage_path'), '') as path
    from public.projects as project
    where project.folder_id = p_folder_id and project.user_id = p_user_id
  ) as project_paths
  where path is not null;

  if to_regclass('public.file_records') is not null then
    select column_name into path_column
    from information_schema.columns
    where table_schema = 'public' and table_name = 'file_records'
      and column_name in ('storage_path', 'file_path', 'object_path', 'path')
    order by case column_name
      when 'storage_path' then 1
      when 'file_path' then 2
      when 'object_path' then 3
      else 4
    end
    limit 1;

    select column_name into key_column
    from information_schema.columns
    where table_schema = 'public' and table_name = 'file_records'
      and column_name in ('folder_id', 'workspace_id')
    order by case column_name when 'folder_id' then 1 else 2 end
    limit 1;

    if path_column is not null and key_column is not null then
      execute format(
        'select coalesce(jsonb_agg(%1$I::text) filter (where nullif(btrim(%1$I::text), '''') is not null), ''[]''::jsonb) from public.file_records where %2$I = $1',
        path_column,
        key_column
      ) into record_paths using p_folder_id;
      storage_paths := storage_paths || coalesce(record_paths, '[]'::jsonb);
    end if;
  end if;

  return jsonb_build_object('storage_paths', storage_paths);
end;
$$;

-- Keep lifecycle RPCs explicit even when a caller bypasses the trigger.
-- Folder deletion loops through its immutable child UUIDs; it never uses the
-- repository/folder name to identify audit history.
create or replace function public.delete_project_folder_with_notification(
  p_user_id uuid,
  p_folder_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_folder public.project_folders;
  deleted_project record;
  created_notification public.notifications;
begin
  select * into deleted_folder
  from public.project_folders
  where id = p_folder_id and user_id = p_user_id
  for update;

  if not found then
    raise exception 'PROJECT_FOLDER_NOT_FOUND';
  end if;

  perform public.purge_project_audit_artifacts(p_folder_id);

  for deleted_project in
    select id from public.projects
    where folder_id = p_folder_id and user_id = p_user_id
    for update
  loop
    perform public.purge_project_audit_artifacts(deleted_project.id);
  end loop;

  delete from public.projects
  where folder_id = p_folder_id and user_id = p_user_id;

  delete from public.project_folders
  where id = p_folder_id and user_id = p_user_id;

  insert into public.notifications (
    user_id, project_id, type, title, message, action_url, metadata
  ) values (
    p_user_id,
    deleted_folder.id::text,
    'project_deleted',
    'Project deleted',
    format('Project ''%s'' has been deleted.', deleted_folder.name),
    '/vault',
    jsonb_build_object('project_name', deleted_folder.name, 'project_kind', 'folder')
  ) returning * into created_notification;

  return jsonb_build_object(
    'folder', to_jsonb(deleted_folder),
    'notification', to_jsonb(created_notification)
  );
end;
$$;

create or replace function public.delete_project_with_notification(
  p_user_id uuid,
  p_project_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_project public.projects;
  project_name text;
  created_notification public.notifications;
begin
  select * into deleted_project
  from public.projects
  where id = p_project_id and user_id = p_user_id
  for update;

  if not found then
    raise exception 'PROJECT_NOT_FOUND';
  end if;

  project_name := coalesce(
    nullif(btrim(deleted_project.title), ''),
    nullif(btrim(deleted_project.name), ''),
    nullif(btrim(deleted_project.file_name), ''),
    'Project asset'
  );

  perform public.purge_project_audit_artifacts(deleted_project.id);

  delete from public.projects
  where id = p_project_id and user_id = p_user_id;

  insert into public.notifications (
    user_id, project_id, type, title, message, action_url, metadata
  ) values (
    p_user_id,
    deleted_project.id::text,
    'project_deleted',
    'Project deleted',
    format('Project ''%s'' has been deleted.', project_name),
    '/vault',
    jsonb_build_object('project_name', project_name, 'project_kind', 'asset')
  ) returning * into created_notification;

  return jsonb_build_object(
    'project', to_jsonb(deleted_project),
    'notification', to_jsonb(created_notification)
  );
end;
$$;

revoke all on function public.purge_project_audit_artifacts(uuid) from public, anon, authenticated;
revoke all on function public.projects_purge_audit_artifacts_before_delete() from public, anon, authenticated;
revoke all on function public.project_folders_purge_audit_artifacts_before_delete() from public, anon, authenticated;
revoke all on function public.get_project_deletion_storage_manifest(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_project_folder_deletion_storage_manifest(uuid, uuid) from public, anon, authenticated;
revoke all on function public.delete_project_folder_with_notification(uuid, uuid) from public, anon, authenticated;
revoke all on function public.delete_project_with_notification(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_project_deletion_storage_manifest(uuid, uuid) to service_role;
grant execute on function public.get_project_folder_deletion_storage_manifest(uuid, uuid) to service_role;
grant execute on function public.delete_project_folder_with_notification(uuid, uuid) to service_role;
grant execute on function public.delete_project_with_notification(uuid, uuid) to service_role;

commit;
