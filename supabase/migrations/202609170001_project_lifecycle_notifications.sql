begin;

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (type in (
    'session_cooldown_re_audit',
    'audit_completed',
    'stale_project_nudge',
    'system_security',
    'project_created',
    'project_deleted'
  ));

create or replace function public.create_project_folder_with_notification(
  p_user_id uuid,
  p_name text,
  p_source text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_name text := btrim(p_name);
  normalized_source text := lower(btrim(p_source));
  created_folder public.project_folders;
  created_notification public.notifications;
begin
  if normalized_name = '' then
    raise exception 'PROJECT_FOLDER_NAME_REQUIRED';
  end if;
  if normalized_source not in ('github', 'local') then
    raise exception 'PROJECT_FOLDER_SOURCE_INVALID';
  end if;

  insert into public.project_folders (user_id, name, source)
  values (p_user_id, normalized_name, normalized_source)
  returning * into created_folder;

  insert into public.notifications (
    user_id,
    project_id,
    type,
    title,
    message,
    action_url,
    metadata
  )
  values (
    p_user_id,
    created_folder.id::text,
    'project_created',
    'Project created',
    format('Project ''%s'' was successfully created.', normalized_name),
    format('/vault?folder=%s', created_folder.id),
    jsonb_build_object('project_name', normalized_name, 'project_kind', 'folder')
  )
  returning * into created_notification;

  return jsonb_build_object(
    'folder', to_jsonb(created_folder),
    'notification', to_jsonb(created_notification)
  );
end;
$$;

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
  created_notification public.notifications;
begin
  select * into deleted_folder
  from public.project_folders
  where id = p_folder_id and user_id = p_user_id
  for update;

  if not found then
    raise exception 'PROJECT_FOLDER_NOT_FOUND';
  end if;

  delete from public.projects
  where folder_id = p_folder_id and user_id = p_user_id;

  delete from public.project_folders
  where id = p_folder_id and user_id = p_user_id;

  insert into public.notifications (
    user_id,
    project_id,
    type,
    title,
    message,
    action_url,
    metadata
  )
  values (
    p_user_id,
    deleted_folder.id::text,
    'project_deleted',
    'Project deleted',
    format('Project ''%s'' has been deleted.', deleted_folder.name),
    '/vault',
    jsonb_build_object('project_name', deleted_folder.name, 'project_kind', 'folder')
  )
  returning * into created_notification;

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

  delete from public.projects
  where id = p_project_id and user_id = p_user_id;

  insert into public.notifications (
    user_id,
    project_id,
    type,
    title,
    message,
    action_url,
    metadata
  )
  values (
    p_user_id,
    deleted_project.id::text,
    'project_deleted',
    'Project deleted',
    format('Project ''%s'' has been deleted.', project_name),
    '/vault',
    jsonb_build_object('project_name', project_name, 'project_kind', 'asset')
  )
  returning * into created_notification;

  return jsonb_build_object(
    'project', to_jsonb(deleted_project),
    'notification', to_jsonb(created_notification)
  );
end;
$$;

revoke all on function public.create_project_folder_with_notification(uuid, text, text) from public, anon, authenticated;
revoke all on function public.delete_project_folder_with_notification(uuid, uuid) from public, anon, authenticated;
revoke all on function public.delete_project_with_notification(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_project_folder_with_notification(uuid, text, text) to service_role;
grant execute on function public.delete_project_folder_with_notification(uuid, uuid) to service_role;
grant execute on function public.delete_project_with_notification(uuid, uuid) to service_role;

commit;
