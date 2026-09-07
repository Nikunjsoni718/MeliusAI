begin;

alter table public.projects
  add column if not exists audit_findings jsonb not null default '{"pros": [], "cons": [], "recommendations": []}'::jsonb;

alter table public.project_folders
  add column if not exists audit_findings jsonb not null default '{"pros": [], "cons": [], "recommendations": []}'::jsonb;

create or replace function public.finalize_verified_audit(p_diff_id uuid, p_user_id uuid, p_expected_version bigint, p_report jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.workspace_repository_states; d public.workspace_diffs; score_value integer; projection public.project_folders;
begin
  select s0.* into s from public.workspace_repository_states s0 join public.workspace_diffs d0 on d0.repository_state_id = s0.id
    where d0.id = p_diff_id and s0.user_id = p_user_id for update of s0;
  if not found or not exists(select 1 from public.project_folders where id = s.workspace_id and user_id = p_user_id) then
    raise exception 'WORKSPACE_NOT_FOUND';
  end if;
  select * into strict d from public.workspace_diffs where id = p_diff_id for update;
  if d.status = 'verified' then
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
    or jsonb_typeof(p_report->'finding_impacts') is distinct from 'object'
    or jsonb_typeof(p_report->'executive_summary') is distinct from 'string'
    or jsonb_typeof(p_report->'score_delta') is distinct from 'number'
    or jsonb_typeof(p_report->'delta_summary') is distinct from 'string' then raise exception 'INVALID_DIFF'; end if;
  score_value := (p_report->>'score')::integer;
  if score_value < 0 or score_value > 100 then raise exception 'INVALID_DIFF'; end if;
  projection := jsonb_populate_record(null::public.project_folders, p_report);
  update public.project_folders set evaluation_score = score_value, score_delta = (p_report->>'score_delta')::integer,
    delta_summary = p_report->>'delta_summary', executive_summary = p_report->>'executive_summary',
    pros = projection.pros, cons = projection.cons, recommendations = projection.recommendations,
    audit_findings = p_report->'finding_impacts', has_been_audited = true
    where id = s.workspace_id and user_id = p_user_id;
  if not found then raise exception 'WORKSPACE_NOT_FOUND'; end if;
  update public.workspace_diffs set audit_report = p_report, status = 'verified', error_code = null,
    verified_at = now(), updated_at = now() where id = d.id;
  update public.workspace_repository_states set last_verified_commit_sha = d.head_sha, baseline_version = baseline_version + 1,
    previous_verified_report = p_report, verified_at = now(), updated_at = now() where id = s.id;
  return p_report;
end $$;

commit;
