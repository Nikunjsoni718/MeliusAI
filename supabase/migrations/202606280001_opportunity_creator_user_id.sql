alter table public.opportunities
  add column if not exists user_id uuid;

create index if not exists opportunities_user_id_idx
  on public.opportunities (user_id);
