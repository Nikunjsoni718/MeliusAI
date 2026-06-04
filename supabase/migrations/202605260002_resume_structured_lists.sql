begin;

alter table public.profiles
  add column if not exists qualifications jsonb not null default '[]'::jsonb,
  add column if not exists hobbies jsonb not null default '[]'::jsonb;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'experience'
      and data_type = 'text'
  ) then
    alter table public.profiles
      alter column experience type jsonb
      using case
        when experience is null or btrim(experience) = '' then '[]'::jsonb
        else jsonb_build_array(experience)
      end;
  elsif not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'experience'
  ) then
    alter table public.profiles
      add column experience jsonb not null default '[]'::jsonb;
  end if;
end $$;

alter table public.profiles
  alter column qualifications set default '[]'::jsonb,
  alter column experience set default '[]'::jsonb,
  alter column hobbies set default '[]'::jsonb;

commit;
