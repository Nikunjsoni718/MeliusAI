begin;

alter table public.users
  add column if not exists username text,
  add column if not exists birth_date date;

create unique index if not exists users_username_unique_idx
  on public.users (lower(username))
  where username is not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_role public.user_role;
  profile_username text;
begin
  profile_role := coalesce(nullif(new.raw_user_meta_data ->> 'role', '')::public.user_role, 'talent');
  profile_username := nullif(lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'username', ''), '^@+', '')), '');

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
    nullif(new.raw_user_meta_data ->> 'role_selected_at', '')::timestamptz,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      split_part(coalesce(new.email, 'talent'), '@', 1)
    ),
    profile_username,
    nullif(new.raw_user_meta_data ->> 'birth_date', '')::date,
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
        username = coalesce(excluded.username, public.users.username),
        birth_date = coalesce(excluded.birth_date, public.users.birth_date),
        headline = excluded.headline,
        bio = excluded.bio,
        avatar_url = excluded.avatar_url,
        github_username = excluded.github_username,
        company_name = excluded.company_name,
        updated_at = now();

  return new;
end;
$$;

commit;
