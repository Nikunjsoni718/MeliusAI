begin;

alter table public.opportunities
  add column if not exists candidate_id uuid references public.profiles (id) on delete cascade,
  add column if not exists recruiter_name text,
  add column if not exists role_title text,
  add column if not exists match_score integer,
  add column if not exists status text default 'active';

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'opportunities' and column_name = 'job_title'
  ) then
    alter table public.opportunities alter column job_title drop not null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'opportunities' and column_name = 'target_role'
  ) then
    alter table public.opportunities alter column target_role drop not null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'opportunities' and column_name = 'job_description'
  ) then
    alter table public.opportunities alter column job_description drop not null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'opportunities' and column_name = 'title'
  ) then
    alter table public.opportunities alter column title drop not null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'opportunities' and column_name = 'description'
  ) then
    alter table public.opportunities alter column description drop not null;
  end if;
end $$;

alter table public.opportunities
  drop constraint if exists opportunities_match_score_check,
  add constraint opportunities_match_score_check
    check (match_score is null or match_score between 0 and 100);

create index if not exists opportunities_candidate_id_idx
  on public.opportunities (candidate_id);

commit;
