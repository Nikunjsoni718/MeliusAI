begin;

alter table public.profiles
  add column if not exists username text,
  add column if not exists full_name text,
  add column if not exists email text,
  add column if not exists avg_project_score double precision not null default 0,
  add column if not exists qualifications text[] not null default ARRAY[]::text[],
  add column if not exists skills text[] not null default ARRAY[]::text[];

alter table public.projects
  add column if not exists user_id uuid,
  add column if not exists score integer,
  add column if not exists logic_score integer,
  add column if not exists evaluation_score integer,
  add column if not exists score_reasoning text,
  add column if not exists audit_summary text,
  add column if not exists has_been_audited boolean not null default false,
  add column if not exists github_repository text;

do $$
begin
  if to_regclass('public.users') is not null then
    insert into public.profiles (
      id,
      username,
      full_name,
      email,
      bio,
      avatar_url
    )
    select
      legacy_profile.id,
      legacy_profile.username,
      legacy_profile.display_name,
      auth_profile.email,
      legacy_profile.bio,
      legacy_profile.avatar_url
    from public.users as legacy_profile
    left join auth.users as auth_profile on auth_profile.id = legacy_profile.id
    on conflict (id) do update
      set username = coalesce(public.profiles.username, excluded.username),
          full_name = coalesce(public.profiles.full_name, excluded.full_name),
          email = coalesce(public.profiles.email, excluded.email),
          bio = coalesce(public.profiles.bio, excluded.bio),
          avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
          updated_at = now();
  end if;

  if to_regclass('public.scores') is not null then
    with latest_project_scores as (
      select distinct on (project_id)
        project_id,
        score,
        summary
      from public.scores
      order by project_id, created_at desc
    )
    update public.projects as project
    set score = coalesce(project.score, latest_score.score),
        logic_score = coalesce(project.logic_score, latest_score.score),
        evaluation_score = coalesce(project.evaluation_score, latest_score.score),
        score_reasoning = coalesce(project.score_reasoning, latest_score.summary),
        audit_summary = coalesce(project.audit_summary, latest_score.summary),
        has_been_audited = true
    from latest_project_scores as latest_score
    where project.id = latest_score.project_id;
  end if;
end $$;

update public.profiles as profile
set avg_project_score = project_scores.average_score
from (
  select user_id, avg(score)::double precision as average_score
  from public.projects
  where score is not null
  group by user_id
) as project_scores
where profile.id = project_scores.user_id;

alter table public.projects
  drop constraint if exists projects_user_id_fkey,
  add constraint projects_user_id_fkey
    foreign key (user_id) references public.profiles (id) on delete cascade;

do $$
begin
  if to_regclass('public.project_folders') is not null then
    alter table public.project_folders
      add column if not exists user_id uuid,
      add column if not exists score integer,
      add column if not exists logic_score integer,
      add column if not exists evaluation_score integer,
      add column if not exists score_reasoning text,
      add column if not exists audit_summary text,
      add column if not exists has_been_audited boolean not null default false;

    alter table public.project_folders
      drop constraint if exists project_folders_user_id_fkey,
      add constraint project_folders_user_id_fkey
        foreign key (user_id) references public.profiles (id) on delete cascade;
  end if;

  if to_regclass('public.pending_imports') is not null then
    alter table public.pending_imports
      drop constraint if exists pending_imports_user_id_fkey,
      add constraint pending_imports_user_id_fkey
        foreign key (user_id) references public.profiles (id) on delete cascade;
  end if;
end $$;

create index if not exists projects_user_id_idx on public.projects (user_id);

-- Remove legacy storage after every active foreign key has been rebound to profiles.
drop table if exists public.scores cascade;
drop table if exists public.users cascade;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(auth.jwt() -> 'user_metadata' ->> 'role', 'talent'));
$$;

create or replace function public.is_recruiter()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() in ('recruiter', 'corporate', 'organization', 'organisation');
$$;

create or replace function public.is_talent()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not public.is_recruiter();
$$;

alter table public.profiles enable row level security;
alter table public.projects enable row level security;

drop policy if exists "Profiles are readable" on public.profiles;
create policy "Profiles are readable"
on public.profiles
for select
using (true);

drop policy if exists "Users can insert their own app profile" on public.profiles;
create policy "Users can insert their own app profile"
on public.profiles
for insert
with check (id = auth.uid());

drop policy if exists "Users can update their own app profile" on public.profiles;
create policy "Users can update their own app profile"
on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "Project owners and recruiters can read projects" on public.projects;
create policy "Project owners and recruiters can read projects"
on public.projects
for select
using (user_id = auth.uid() or public.is_recruiter());

drop policy if exists "Talent can create their own projects" on public.projects;
create policy "Talent can create their own projects"
on public.projects
for insert
with check (user_id = auth.uid() and public.is_talent());

drop policy if exists "Project owners can update their own projects" on public.projects;
create policy "Project owners can update their own projects"
on public.projects
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Project owners can delete their own projects" on public.projects;
create policy "Project owners can delete their own projects"
on public.projects
for delete
using (user_id = auth.uid());

commit;
