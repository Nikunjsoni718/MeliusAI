begin;

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  username text,
  birth_date date,
  bio text,
  skills text[],
  internal_keywords text[],
  extracted_experience text[],
  extracted_preferences text[],
  avatar_url text,
  age integer,
  current_status text,
  education text,
  qualifications jsonb not null default '[]'::jsonb,
  experience jsonb not null default '[]'::jsonb,
  hobbies jsonb not null default '[]'::jsonb,
  resume_projects jsonb not null default '[]'::jsonb,
  external_links jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists email text,
  add column if not exists full_name text,
  add column if not exists username text,
  add column if not exists birth_date date,
  add column if not exists bio text,
  add column if not exists skills text[],
  add column if not exists internal_keywords text[],
  add column if not exists extracted_experience text[],
  add column if not exists extracted_preferences text[],
  add column if not exists avatar_url text,
  add column if not exists age integer,
  add column if not exists current_status text,
  add column if not exists education text,
  add column if not exists qualifications jsonb not null default '[]'::jsonb,
  add column if not exists experience jsonb not null default '[]'::jsonb,
  add column if not exists hobbies jsonb not null default '[]'::jsonb,
  add column if not exists resume_projects jsonb not null default '[]'::jsonb,
  add column if not exists external_links jsonb not null default '[]'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_id_auth_users_fkey'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_id_auth_users_fkey
      foreign key (id) references auth.users (id) on delete cascade not valid;
  end if;
end $$;

create index if not exists profiles_username_lookup_idx
  on public.profiles (username)
  where username is not null;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  metadata_role text;
  profile_role public.user_role;
  profile_username text;
  profile_birth_date date;
  raw_birth_date text;
  profile_display_name text;
  profile_avatar_url text;
begin
  metadata_role := lower(coalesce(new.raw_user_meta_data ->> 'role', ''));
  profile_role := case
    when metadata_role in ('recruiter', 'corporate', 'organization', 'organisation') then 'recruiter'::public.user_role
    else 'talent'::public.user_role
  end;

  profile_username := nullif(
    left(
      lower(
        regexp_replace(
          regexp_replace(coalesce(new.raw_user_meta_data ->> 'username', ''), '^@+', ''),
          '[^a-zA-Z0-9_]',
          '',
          'g'
        )
      ),
      24
    ),
    ''
  );

  if profile_username is not null and length(profile_username) < 3 then
    profile_username := null;
  end if;

  raw_birth_date := nullif(new.raw_user_meta_data ->> 'birth_date', '');
  if raw_birth_date ~ '^\d{4}-\d{2}-\d{2}$' then
    profile_birth_date := raw_birth_date::date;
  else
    profile_birth_date := null;
  end if;

  profile_display_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    nullif(new.raw_user_meta_data ->> 'company_name', ''),
    split_part(coalesce(new.email, 'member'), '@', 1)
  );

  profile_avatar_url := coalesce(
    nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
    nullif(new.raw_user_meta_data ->> 'picture', '')
  );

  insert into public.users (
    id,
    role,
    role_selected_at,
    display_name,
    username,
    birth_date,
    headline,
    bio,
    avatar_url,
    github_username,
    company_name
  )
  values (
    new.id,
    profile_role,
    case
      when nullif(new.raw_user_meta_data ->> 'role_selected_at', '') is null then null
      else (new.raw_user_meta_data ->> 'role_selected_at')::timestamptz
    end,
    profile_display_name,
    profile_username,
    profile_birth_date,
    new.raw_user_meta_data ->> 'headline',
    new.raw_user_meta_data ->> 'bio',
    profile_avatar_url,
    new.raw_user_meta_data ->> 'github_username',
    new.raw_user_meta_data ->> 'company_name'
  )
  on conflict (id) do update
    set role = excluded.role,
        role_selected_at = coalesce(excluded.role_selected_at, public.users.role_selected_at),
        display_name = excluded.display_name,
        username = coalesce(excluded.username, public.users.username),
        birth_date = coalesce(excluded.birth_date, public.users.birth_date),
        headline = excluded.headline,
        bio = excluded.bio,
        avatar_url = excluded.avatar_url,
        github_username = excluded.github_username,
        company_name = excluded.company_name,
        updated_at = now();

  insert into public.profiles (
    id,
    email,
    full_name,
    username,
    birth_date,
    bio,
    avatar_url
  )
  values (
    new.id,
    new.email,
    profile_display_name,
    profile_username,
    profile_birth_date,
    new.raw_user_meta_data ->> 'bio',
    profile_avatar_url
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        username = coalesce(excluded.username, public.profiles.username),
        birth_date = coalesce(excluded.birth_date, public.profiles.birth_date),
        bio = coalesce(excluded.bio, public.profiles.bio),
        avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;

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

grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;

commit;
