begin;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'projects'
      and column_name = 'user_id'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'projects'
      and column_name = 'owner_id'
  ) then
    execute 'drop policy if exists "Project owners and recruiters can read projects" on public.projects';
    execute 'create policy "Project owners and recruiters can read projects"
      on public.projects
      for select
      using (owner_id = auth.uid() or user_id = auth.uid() or public.is_recruiter())';

    execute 'drop policy if exists "Talent can create their own projects" on public.projects';
    execute 'create policy "Talent can create their own projects"
      on public.projects
      for insert
      with check ((owner_id = auth.uid() or user_id = auth.uid()) and public.is_talent())';

    execute 'drop policy if exists "Project owners can update their own projects" on public.projects';
    execute 'create policy "Project owners can update their own projects"
      on public.projects
      for update
      using (owner_id = auth.uid() or user_id = auth.uid())
      with check (owner_id = auth.uid() or user_id = auth.uid())';

    execute 'drop policy if exists "Project owners can delete their own projects" on public.projects';
    execute 'create policy "Project owners can delete their own projects"
      on public.projects
      for delete
      using (owner_id = auth.uid() or user_id = auth.uid())';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'storage'
      and table_name = 'buckets'
  ) then
    insert into storage.buckets (id, name, public)
    values ('vault', 'vault', true)
    on conflict (id) do update
    set public = excluded.public;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'storage'
      and table_name = 'objects'
  ) then
    execute 'drop policy if exists "Vault owners can delete own files" on storage.objects';
    execute 'create policy "Vault owners can delete own files"
      on storage.objects
      for delete
      to authenticated
      using (bucket_id = ''vault'' and (storage.foldername(name))[1] = auth.uid()::text)';
  end if;
end $$;

commit;
