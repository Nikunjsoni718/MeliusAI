begin;

alter table public.users
  add column if not exists role_selected_at timestamptz;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'projects'
      and column_name = 'github_url'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'projects'
      and column_name = 'file_url'
  ) then
    alter table public.projects rename column github_url to file_url;
  end if;
end $$;

alter table public.projects
  add column if not exists file_type text not null default 'github',
  add column if not exists profession text not null default 'Developer',
  add column if not exists target_company text,
  add column if not exists auto_apply_enabled boolean not null default false;

alter table public.projects
  drop constraint if exists projects_github_url_check;

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
    role_selected_at,
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
    nullif(new.raw_user_meta_data ->> 'role_selected_at', '')::timestamptz,
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
        role_selected_at = coalesce(excluded.role_selected_at, public.users.role_selected_at),
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

drop policy if exists "Users can update their own profile" on public.users;
create policy "Users can update their own profile"
on public.users
for update
using (id = auth.uid())
with check (id = auth.uid());

commit;
