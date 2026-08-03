begin;

alter table public.profiles
  add column if not exists username text,
  add column if not exists birth_date date,
  add column if not exists full_name text,
  add column if not exists email text;

create unique index if not exists profiles_username_unique_idx
  on public.profiles (lower(username))
  where username is not null;

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
    birth_date,
    full_name,
    email,
    bio,
    avatar_url
  )
  values (
    new.id,
    nullif(lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'username', ''), '^@+', '')), ''),
    nullif(new.raw_user_meta_data ->> 'birth_date', '')::date,
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
        birth_date = coalesce(excluded.birth_date, public.profiles.birth_date),
        full_name = coalesce(excluded.full_name, public.profiles.full_name),
        email = coalesce(excluded.email, public.profiles.email),
        bio = coalesce(excluded.bio, public.profiles.bio),
        avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
        updated_at = now();

  return new;
end;
$$;

commit;
