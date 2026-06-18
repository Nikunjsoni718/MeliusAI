begin;

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  organization_name text not null,
  job_title text not null,
  target_role text not null,
  job_description text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists opportunities_target_role_idx
  on public.opportunities (target_role);

create index if not exists opportunities_status_created_at_idx
  on public.opportunities (status, created_at desc);

drop trigger if exists set_opportunities_updated_at on public.opportunities;
create trigger set_opportunities_updated_at
before update on public.opportunities
for each row execute function public.set_updated_at();

commit;
