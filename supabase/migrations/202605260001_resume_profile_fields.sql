begin;

alter table public.profiles
  add column if not exists age integer,
  add column if not exists current_status text,
  add column if not exists education text,
  add column if not exists qualifications jsonb not null default '[]'::jsonb,
  add column if not exists experience jsonb not null default '[]'::jsonb,
  add column if not exists hobbies jsonb not null default '[]'::jsonb;

alter table public.profiles
  drop constraint if exists profiles_age_check,
  add constraint profiles_age_check check (age is null or age between 0 and 150),
  drop constraint if exists profiles_current_status_check,
  add constraint profiles_current_status_check
    check (current_status is null or current_status in ('Studying', 'Working', 'Looking for an Opportunity'));

commit;
