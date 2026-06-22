create table if not exists public.candidate_opportunity_dismissals (
  candidate_id uuid not null references public.profiles (id) on delete cascade,
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (candidate_id, opportunity_id)
);

create index if not exists candidate_opportunity_dismissals_candidate_idx
  on public.candidate_opportunity_dismissals (candidate_id, dismissed_at desc);

alter table public.candidate_opportunity_dismissals enable row level security;

drop policy if exists "Candidates can view their dismissed opportunities"
  on public.candidate_opportunity_dismissals;
create policy "Candidates can view their dismissed opportunities"
  on public.candidate_opportunity_dismissals
  for select
  to authenticated
  using (auth.uid() = candidate_id);

drop policy if exists "Candidates can dismiss opportunities"
  on public.candidate_opportunity_dismissals;
create policy "Candidates can dismiss opportunities"
  on public.candidate_opportunity_dismissals
  for insert
  to authenticated
  with check (auth.uid() = candidate_id);

drop policy if exists "Candidates can restore dismissed opportunities"
  on public.candidate_opportunity_dismissals;
create policy "Candidates can restore dismissed opportunities"
  on public.candidate_opportunity_dismissals
  for delete
  to authenticated
  using (auth.uid() = candidate_id);

grant select, insert, delete on public.candidate_opportunity_dismissals to authenticated;

notify pgrst, 'reload schema';
