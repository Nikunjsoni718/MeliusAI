begin;

alter table public.profiles
  add column if not exists username text;

update public.profiles
set username = null
where username is not null
  and trim(username) = '';

update public.profiles
set username = lower(trim(username))
where username is not null
  and username <> lower(trim(username));

with ranked_usernames as (
  select
    id,
    row_number() over (
      partition by lower(username)
      order by created_at nulls last, id
    ) as username_rank
  from public.profiles
  where username is not null
)
update public.profiles as profile
set username = concat(
  left(regexp_replace(profile.username, '_+$', ''), 15),
  '_',
  left(replace(profile.id::text, '-', ''), 8)
)
from ranked_usernames
where profile.id = ranked_usernames.id
  and ranked_usernames.username_rank > 1;

create unique index if not exists profiles_username_unique_idx
  on public.profiles (lower(username))
  where username is not null;

commit;
