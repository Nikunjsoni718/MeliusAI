begin;

create table public.workspace_repository_states (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.project_folders(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  repository text not null check (repository = lower(repository) and repository ~ '^[a-z0-9_.-]+/[a-z0-9_.-]+$'),
  branch text not null check (length(btrim(branch)) > 0),
  last_verified_commit_sha text not null check (last_verified_commit_sha ~ '^([0-9a-f]{40}|[0-9a-f]{64})$'),
  baseline_version bigint not null default 0 check (baseline_version >= 0),
  previous_verified_report jsonb,
  initialized_at timestamptz not null default now(),
  verified_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.workspace_diffs (
  id uuid primary key default gen_random_uuid(),
  repository_state_id uuid not null references public.workspace_repository_states(id) on delete cascade,
  baseline_version bigint not null check (baseline_version >= 0),
  base_sha text not null check (base_sha ~ '^([0-9a-f]{40}|[0-9a-f]{64})$'),
  head_sha text not null check (head_sha ~ '^([0-9a-f]{40}|[0-9a-f]{64})$'),
  audit_kind text not null check (audit_kind in ('baseline', 'incremental')),
  total_insertions bigint not null check (total_insertions >= 0),
  total_deletions bigint not null check (total_deletions >= 0),
  files jsonb not null check (jsonb_typeof(files) = 'array'),
  status text not null default 'pending' check (status in ('pending', 'verified', 'failed')),
  audit_report jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  verified_at timestamptz,
  unique(repository_state_id, baseline_version, base_sha, head_sha)
);
create index workspace_diffs_history_idx on public.workspace_diffs(repository_state_id, created_at desc);

alter table public.workspace_repository_states enable row level security;
alter table public.workspace_diffs enable row level security;
revoke all on public.workspace_repository_states, public.workspace_diffs from anon, authenticated;
grant select on public.workspace_repository_states, public.workspace_diffs to authenticated;
grant all on public.workspace_repository_states, public.workspace_diffs to service_role;
create policy "Owners read repository state" on public.workspace_repository_states for select to authenticated
  using (user_id = auth.uid() and exists(select 1 from public.project_folders f where f.id = workspace_id and f.user_id = auth.uid()));
create policy "Owners read repository diffs" on public.workspace_diffs for select to authenticated
  using (exists(select 1 from public.workspace_repository_states s where s.id = repository_state_id and s.user_id = auth.uid()));

create function public.initialize_repository_baseline(p_workspace_id uuid, p_user_id uuid, p_repository text, p_branch text, p_commit_sha text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.workspace_repository_states;
begin
  perform 1 from public.project_folders where id = p_workspace_id and user_id = p_user_id for update;
  if not found then raise exception 'WORKSPACE_NOT_FOUND'; end if;
  insert into public.workspace_repository_states(workspace_id, user_id, repository, branch, last_verified_commit_sha)
    values(p_workspace_id, p_user_id, p_repository, p_branch, p_commit_sha) on conflict(workspace_id) do nothing;
  select * into strict s from public.workspace_repository_states where workspace_id = p_workspace_id;
  if s.user_id <> p_user_id or s.repository <> p_repository or s.branch <> p_branch then
    raise exception 'REPOSITORY_BINDING_CONFLICT';
  end if;
  return to_jsonb(s);
end $$;

create function public.save_workspace_diff(p_state_id uuid, p_user_id uuid, p_expected_version bigint,
  p_base_sha text, p_head_sha text, p_delta jsonb, p_audit_kind text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.workspace_repository_states; d public.workspace_diffs; f jsonb; a bigint := 0; r bigint := 0;
begin
  select * into s from public.workspace_repository_states where id = p_state_id and user_id = p_user_id for update;
  if not found or not exists(select 1 from public.project_folders where id = s.workspace_id and user_id = p_user_id) then
    raise exception 'WORKSPACE_NOT_FOUND';
  end if;
  if s.baseline_version <> p_expected_version or s.last_verified_commit_sha <> p_base_sha then
    raise exception 'VERIFY_CONFLICT';
  end if;
  if jsonb_typeof(p_delta->'files') is distinct from 'array' then raise exception 'INVALID_DIFF'; end if;
  for f in select value from jsonb_array_elements(p_delta->'files') loop
    if jsonb_typeof(f->'filename') is distinct from 'string' or length(f->>'filename') = 0
      or jsonb_typeof(f->'insertions') is distinct from 'number' or jsonb_typeof(f->'deletions') is distinct from 'number'
      or (f->>'insertions')::numeric < 0 or (f->>'deletions')::numeric < 0
      or (f->>'insertions')::numeric <> trunc((f->>'insertions')::numeric)
      or (f->>'deletions')::numeric <> trunc((f->>'deletions')::numeric)
      or not (f ? 'patch') or jsonb_typeof(f->'patch') not in ('string', 'null') then
      raise exception 'INVALID_DIFF';
    end if;
    a := a + (f->>'insertions')::bigint; r := r + (f->>'deletions')::bigint;
  end loop;
  if a is distinct from (p_delta->>'total_insertions')::bigint or r is distinct from (p_delta->>'total_deletions')::bigint
    or (select count(*) <> count(distinct value->>'filename') from jsonb_array_elements(p_delta->'files')) then
    raise exception 'INVALID_DIFF';
  end if;
  insert into public.workspace_diffs(repository_state_id, baseline_version, base_sha, head_sha, audit_kind, total_insertions, total_deletions, files)
    values(s.id, p_expected_version, p_base_sha, p_head_sha, p_audit_kind, a, r, p_delta->'files')
    on conflict(repository_state_id, baseline_version, base_sha, head_sha) do nothing;
  select * into strict d from public.workspace_diffs where repository_state_id = s.id and baseline_version = p_expected_version
    and base_sha = p_base_sha and head_sha = p_head_sha;
  if d.status = 'pending' and d.audit_kind <> p_audit_kind then raise exception 'VERIFY_CONFLICT'; end if;
  if p_audit_kind <> 'baseline' and (d.total_insertions <> a or d.total_deletions <> r or d.files <> p_delta->'files') then
    raise exception 'INVALID_DIFF';
  end if;
  -- Retain a failed incremental payload when a full baseline is required.
  if d.status <> 'verified' then
    update public.workspace_diffs set status = 'pending', error_code = null, audit_kind = p_audit_kind, updated_at = now()
      where id = d.id returning * into d;
  end if;
  return to_jsonb(d);
end $$;

create function public.finalize_verified_audit(p_diff_id uuid, p_user_id uuid, p_expected_version bigint, p_report jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.workspace_repository_states; d public.workspace_diffs; score_value integer; projection public.project_folders;
begin
  -- State-before-diff lock order matches save_workspace_diff.
  select s0.* into s from public.workspace_repository_states s0 join public.workspace_diffs d0 on d0.repository_state_id = s0.id
    where d0.id = p_diff_id and s0.user_id = p_user_id for update of s0;
  if not found or not exists(select 1 from public.project_folders where id = s.workspace_id and user_id = p_user_id) then
    raise exception 'WORKSPACE_NOT_FOUND';
  end if;
  select * into strict d from public.workspace_diffs where id = p_diff_id for update;
  if d.status = 'verified' then
    -- A lost HTTP response may be retried, but never replay an obsolete result.
    if s.baseline_version <> d.baseline_version + 1 or s.last_verified_commit_sha <> d.head_sha then
      raise exception 'VERIFY_CONFLICT';
    end if;
    return d.audit_report;
  end if;
  if d.baseline_version <> p_expected_version or s.baseline_version <> p_expected_version or s.last_verified_commit_sha <> d.base_sha then
    raise exception 'VERIFY_CONFLICT';
  end if;
  if jsonb_typeof(p_report) is distinct from 'object' or jsonb_typeof(p_report->'score') is distinct from 'number'
    or jsonb_typeof(p_report->'pros') is distinct from 'array' or jsonb_typeof(p_report->'cons') is distinct from 'array'
    or jsonb_typeof(p_report->'recommendations') is distinct from 'array'
    or jsonb_typeof(p_report->'executive_summary') is distinct from 'string'
    or jsonb_typeof(p_report->'score_delta') is distinct from 'number'
    or jsonb_typeof(p_report->'delta_summary') is distinct from 'string' then raise exception 'INVALID_DIFF'; end if;
  score_value := (p_report->>'score')::integer;
  if score_value < 0 or score_value > 100 then raise exception 'INVALID_DIFF'; end if;
  -- Convert JSON arrays using the deployed folder column types (text[] or jsonb).
  projection := jsonb_populate_record(null::public.project_folders, p_report);
  update public.project_folders set evaluation_score = score_value, score_delta = (p_report->>'score_delta')::integer,
    delta_summary = p_report->>'delta_summary', executive_summary = p_report->>'executive_summary',
    pros = projection.pros, cons = projection.cons, recommendations = projection.recommendations, has_been_audited = true
    where id = s.workspace_id and user_id = p_user_id;
  if not found then raise exception 'WORKSPACE_NOT_FOUND'; end if;
  update public.workspace_diffs set audit_report = p_report, status = 'verified', error_code = null,
    verified_at = now(), updated_at = now() where id = d.id;
  update public.workspace_repository_states set last_verified_commit_sha = d.head_sha, baseline_version = baseline_version + 1,
    previous_verified_report = p_report, verified_at = now(), updated_at = now() where id = s.id;
  return p_report;
end $$;

create function public.mark_workspace_diff_failed(p_diff_id uuid, p_user_id uuid, p_error_code text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.workspace_diffs d set status = 'failed', error_code = p_error_code, updated_at = now()
    where d.id = p_diff_id and d.status <> 'verified' and exists(select 1 from public.workspace_repository_states s
      join public.project_folders f on f.id = s.workspace_id where s.id = d.repository_state_id and s.user_id = p_user_id and f.user_id = p_user_id);
end $$;

revoke all on function public.initialize_repository_baseline(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.save_workspace_diff(uuid, uuid, bigint, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.finalize_verified_audit(uuid, uuid, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.mark_workspace_diff_failed(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.initialize_repository_baseline(uuid, uuid, text, text, text) to service_role;
grant execute on function public.save_workspace_diff(uuid, uuid, bigint, text, text, jsonb, text) to service_role;
grant execute on function public.finalize_verified_audit(uuid, uuid, bigint, jsonb) to service_role;
grant execute on function public.mark_workspace_diff_failed(uuid, uuid, text) to service_role;

create function public.protect_workspace_diff_payload() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.repository_state_id, new.baseline_version, new.base_sha, new.head_sha, new.total_insertions, new.total_deletions, new.files)
    is distinct from (old.repository_state_id, old.baseline_version, old.base_sha, old.head_sha, old.total_insertions, old.total_deletions, old.files)
    or (old.status = 'verified' and new is distinct from old) then
    raise exception 'IMMUTABLE_DIFF';
  end if;
  return new;
end $$;
create trigger protect_workspace_diff_payload before update on public.workspace_diffs
  for each row execute function public.protect_workspace_diff_payload();
revoke all on function public.protect_workspace_diff_payload() from public, anon, authenticated;

commit;
