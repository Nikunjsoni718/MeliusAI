begin;

create extension if not exists pgcrypto;

do $$
begin
  create type public.project_status as enum ('draft', 'submitted', 'reviewed', 'archived');
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

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text,
  full_name text,
  email text,
  avg_project_score double precision not null default 0,
  qualifications text[] not null default ARRAY[]::text[],
  skills text[] not null default ARRAY[]::text[],
  birth_date date,
  bio text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  github_url text not null,
  summary text,
  stack jsonb not null default '[]'::jsonb,
  status public.project_status not null default 'draft',
  score integer,
  logic_score integer,
  evaluation_score integer,
  score_reasoning text,
  audit_summary text,
  has_been_audited boolean not null default false,
  github_repository text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_github_url_check
    check (github_url ~* '^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(/)?(\.git)?$')
);

create unique index if not exists profiles_username_unique_idx
  on public.profiles (lower(username))
  where username is not null;
create index if not exists projects_user_id_idx on public.projects (user_id);
create index if not exists projects_status_idx on public.projects (status);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    username,
    full_name,
    email,
    bio,
    avatar_url
  )
  values (
    new.id,
    nullif(lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'username', ''), '^@+', '')), ''),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      split_part(coalesce(new.email, 'member'), '@', 1)
    ),
    new.email,
    new.raw_user_meta_data ->> 'bio',
    coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture'
    )
  )
  on conflict (id) do update
    set username = coalesce(excluded.username, public.profiles.username),
        full_name = coalesce(excluded.full_name, public.profiles.full_name),
        email = coalesce(excluded.email, public.profiles.email),
        bio = coalesce(excluded.bio, public.profiles.bio),
        avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
        updated_at = now();

  return new;
end;
$$;

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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

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
