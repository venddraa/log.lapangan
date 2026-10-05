create table if not exists public.team_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  member_code text not null unique check (
    member_code in ('vendra', 'acan', 'hudda', 'adit', 'henry')
  ),
  created_at timestamptz not null default now()
);

create table if not exists public.visits (
  id uuid primary key,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  activity_name text not null,
  activity_category text,
  primary_location jsonb not null,
  notes text not null default '',
  visit_date timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.photos (
  id uuid primary key,
  visit_id uuid not null references public.visits(id) on delete cascade,
  storage_path text not null unique,
  note text not null default '',
  additional_note text not null default '',
  created_at timestamptz not null default now()
);

alter table public.team_members enable row level security;
alter table public.visits enable row level security;
alter table public.photos enable row level security;

revoke all on table public.team_members from anon;
revoke all on table public.visits from anon;
revoke all on table public.photos from anon;
grant select on table public.team_members to authenticated;
grant select, insert, update, delete on table public.visits to authenticated;
grant select, insert, update, delete on table public.photos to authenticated;

drop policy if exists "members read own membership" on public.team_members;
create policy "members read own membership"
  on public.team_members for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "field team reads visits" on public.visits;
create policy "field team reads visits"
  on public.visits for select to authenticated
  using (
    exists (
      select 1 from public.team_members
      where user_id = (select auth.uid())
    )
  );

drop policy if exists "field team creates visits" on public.visits;
create policy "field team creates visits"
  on public.visits for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.team_members
      where user_id = (select auth.uid())
    )
  );

drop policy if exists "field team updates visits" on public.visits;
create policy "field team updates visits"
  on public.visits for update to authenticated
  using (
    exists (
      select 1 from public.team_members
      where user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.team_members
      where user_id = (select auth.uid())
    )
  );

drop policy if exists "field team deletes visits" on public.visits;
create policy "field team deletes visits"
  on public.visits for delete to authenticated
  using (
    exists (
      select 1 from public.team_members
      where user_id = (select auth.uid())
    )
  );

drop policy if exists "field team reads photo metadata" on public.photos;
create policy "field team reads photo metadata"
  on public.photos for select to authenticated
  using (
    exists (
      select 1 from public.team_members
      where user_id = (select auth.uid())
    )
  );

drop policy if exists "field team creates photo metadata" on public.photos;
create policy "field team creates photo metadata"
  on public.photos for insert to authenticated
  with check (
    exists (
      select 1 from public.team_members
      where user_id = (select auth.uid())
    )
  );

drop policy if exists "field team updates photo metadata" on public.photos;
create policy "field team updates photo metadata"
  on public.photos for update to authenticated
  using (
    exists (
      select 1 from public.team_members
      where user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.team_members
      where user_id = (select auth.uid())
    )
  );

drop policy if exists "field team deletes photo metadata" on public.photos;
create policy "field team deletes photo metadata"
  on public.photos for delete to authenticated
  using (
    exists (
      select 1 from public.team_members
      where user_id = (select auth.uid())
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('field-photos', 'field-photos', false, 10485760, array['image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "field team reads private photos" on storage.objects;
create policy "field team reads private photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'field-photos'
    and exists (
      select 1 from public.team_members
      where user_id = (select auth.uid())
    )
  );

drop policy if exists "field team uploads private photos" on storage.objects;
create policy "field team uploads private photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'field-photos'
    and exists (
      select 1 from public.team_members
      where user_id = (select auth.uid())
    )
  );

drop policy if exists "field team updates private photos" on storage.objects;
create policy "field team updates private photos"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'field-photos'
    and exists (
      select 1 from public.team_members
      where user_id = (select auth.uid())
    )
  )
  with check (
    bucket_id = 'field-photos'
    and exists (
      select 1 from public.team_members
      where user_id = (select auth.uid())
    )
  );

drop policy if exists "field team deletes private photos" on storage.objects;
create policy "field team deletes private photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'field-photos'
    and exists (
      select 1 from public.team_members
      where user_id = (select auth.uid())
    )
  );
