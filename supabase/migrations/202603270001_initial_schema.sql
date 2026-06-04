begin;

create extension if not exists pgcrypto;

do $$
begin
  create type public.user_role as enum ('talent', 'recruiter');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.project_status as enum ('draft', 'submitted', 'reviewed', 'archived');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.score_source as enum ('gemini', 'manual');
exception
  when duplicate_object then null;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null,
  display_name text not null,
  headline text,
  bio text,
  avatar_url text,
  github_username text,
  company_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users (id) on delete cascade,
  title text not null,
  github_url text not null,
  summary text,
  stack jsonb not null default '[]'::jsonb,
  status public.project_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_github_url_check
    check (github_url ~* '^https://github\\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(/)?(\\.git)?$')
);

create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  scored_by uuid references public.users (id) on delete set null,
  source public.score_source not null default 'manual',
  score smallint not null check (score between 1 and 100),
  summary text,
  improvement_tips jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scores_improvement_tips_check
    check (jsonb_typeof(improvement_tips) = 'array')
);

create index if not exists users_role_idx on public.users (role);
create index if not exists projects_owner_id_idx on public.projects (owner_id);
create index if not exists projects_status_idx on public.projects (status);
create index if not exists scores_project_id_idx on public.scores (project_id);
create index if not exists scores_scored_by_idx on public.scores (scored_by);

drop trigger if exists set_users_updated_at on public.users;
create trigger set_users_updated_at
before update on public.users
for each row execute function public.set_updated_at();

drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

drop trigger if exists set_scores_updated_at on public.scores;
create trigger set_scores_updated_at
before update on public.scores
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_role public.user_role;
begin
  profile_role := coalesce(nullif(new.raw_user_meta_data ->> 'role', '')::public.user_role, 'talent');

  insert into public.users (
    id,
    role,
    display_name,
    headline,
    bio,
    avatar_url,
    github_username,
    company_name
  )
  values (
    new.id,
    profile_role,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      split_part(coalesce(new.email, 'talent'), '@', 1)
    ),
    new.raw_user_meta_data ->> 'headline',
    new.raw_user_meta_data ->> 'bio',
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'github_username',
    new.raw_user_meta_data ->> 'company_name'
  )
  on conflict (id) do update
    set role = excluded.role,
        display_name = excluded.display_name,
        headline = excluded.headline,
        bio = excluded.bio,
        avatar_url = excluded.avatar_url,
        github_username = excluded.github_username,
        company_name = excluded.company_name,
        updated_at = now();

  return new;
end;
$$;

create or replace function public.current_user_role()
returns public.user_role
language sql
security definer
set search_path = public
as $$
  select u.role
  from public.users as u
  where u.id = auth.uid()
  limit 1;
$$;

create or replace function public.is_recruiter()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.current_user_role() = 'recruiter';
$$;

create or replace function public.is_talent()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.current_user_role() = 'talent';
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.users enable row level security;
alter table public.projects enable row level security;
alter table public.scores enable row level security;

drop policy if exists "Users can read their own profile" on public.users;
create policy "Users can read their own profile"
on public.users
for select
using (id = auth.uid());

drop policy if exists "Recruiters can read talent profiles" on public.users;
create policy "Recruiters can read talent profiles"
on public.users
for select
using (public.is_recruiter() and role = 'talent');

drop policy if exists "Users can update their own profile" on public.users;
create policy "Users can update their own profile"
on public.users
for update
using (id = auth.uid())
with check (id = auth.uid() and role = public.current_user_role());

drop policy if exists "Users can insert their own profile" on public.users;
create policy "Users can insert their own profile"
on public.users
for insert
with check (id = auth.uid());

drop policy if exists "Project owners and recruiters can read projects" on public.projects;
create policy "Project owners and recruiters can read projects"
on public.projects
for select
using (owner_id = auth.uid() or public.is_recruiter());

drop policy if exists "Talent can create their own projects" on public.projects;
create policy "Talent can create their own projects"
on public.projects
for insert
with check (owner_id = auth.uid() and public.is_talent());

drop policy if exists "Project owners can update their own projects" on public.projects;
create policy "Project owners can update their own projects"
on public.projects
for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "Project owners can delete their own projects" on public.projects;
create policy "Project owners can delete their own projects"
on public.projects
for delete
using (owner_id = auth.uid());

drop policy if exists "Talent, scorers, and recruiters can read scores" on public.scores;
create policy "Talent, scorers, and recruiters can read scores"
on public.scores
for select
using (
  public.is_recruiter()
  or scored_by = auth.uid()
  or exists (
    select 1
    from public.projects as p
    where p.id = scores.project_id
      and p.owner_id = auth.uid()
  )
);

drop policy if exists "Recruiters can create scores" on public.scores;
create policy "Recruiters can create scores"
on public.scores
for insert
with check (public.is_recruiter() and scored_by = auth.uid());

drop policy if exists "Score authors can update their own scores" on public.scores;
create policy "Score authors can update their own scores"
on public.scores
for update
using (scored_by = auth.uid())
with check (scored_by = auth.uid());

drop policy if exists "Score authors can delete their own scores" on public.scores;
create policy "Score authors can delete their own scores"
on public.scores
for delete
using (scored_by = auth.uid());

commit;
