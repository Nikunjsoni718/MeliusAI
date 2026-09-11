begin;

do $$
declare
  realtime_publishes_all_tables boolean := false;
begin
  select puballtables
    into realtime_publishes_all_tables
    from pg_publication
   where pubname = 'supabase_realtime';

  if found
    and not realtime_publishes_all_tables
    and not exists (
      select 1
        from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'project_folders'
    ) then
    execute 'alter publication supabase_realtime add table public.project_folders';
  end if;
end
$$;

commit;
