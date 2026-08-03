begin;

alter table public.profiles
  alter column qualifications drop default,
  alter column qualifications set default ARRAY[]::text[];

commit;
