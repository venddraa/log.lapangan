-- Jalankan setelah field-log-schema.sql. Aman dijalankan ulang.
alter table public.visits add column if not exists sync_version bigint not null default 1;
alter table public.visits add column if not exists deleted_at timestamptz;
alter table public.visits add column if not exists sync_request uuid;

-- Semua perubahan metadata dilakukan atomik lewat fungsi ini.
-- expected_version mencegah perangkat menimpa edit yang belum pernah dilihatnya.
create or replace function public.sync_field_visit(
  visit_id uuid,
  expected_version bigint,
  visit_payload jsonb,
  photo_payload jsonb,
  request_id uuid,
  remove_visit boolean default false
)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_version bigint;
  next_version bigint;
  previous_request uuid;
begin
  if not exists (select 1 from public.team_members where user_id = auth.uid()) then
    raise exception 'Anggota tidak diizinkan' using errcode = '42501';
  end if;

  -- Mengunci juga kasus ketika baris belum ada.
  perform pg_advisory_xact_lock(hashtextextended(visit_id::text, 0));
  select sync_version, sync_request into current_version, previous_request
    from public.visits where id = visit_id for update;

  if previous_request = request_id then return current_version; end if;

  if coalesce(current_version, 0) <> expected_version then
    raise exception 'SYNC_CONFLICT' using errcode = 'P0001';
  end if;

  if remove_visit then
    if current_version is null then return 0; end if;
    next_version := current_version + 1;
    update public.visits set deleted_at = now(), updated_at = now(),
      sync_version = next_version, sync_request = request_id where id = visit_id;
    delete from public.photos where photos.visit_id = sync_field_visit.visit_id;
    return next_version;
  end if;

  next_version := coalesce(current_version, 0) + 1;
  insert into public.visits (
    id, activity_name, activity_category, primary_location, notes,
    visit_date, created_at, updated_at, sync_version, deleted_at, sync_request
  ) values (
    visit_id, visit_payload->>'activity_name', visit_payload->>'activity_category',
    visit_payload->'primary_location', coalesce(visit_payload->>'notes', ''),
    (visit_payload->>'visit_date')::timestamptz,
    (visit_payload->>'created_at')::timestamptz, now(), next_version, null, request_id
  ) on conflict (id) do update set
    activity_name = excluded.activity_name,
    activity_category = excluded.activity_category,
    primary_location = excluded.primary_location,
    notes = excluded.notes, visit_date = excluded.visit_date,
    updated_at = excluded.updated_at, sync_version = excluded.sync_version,
    deleted_at = null, sync_request = request_id;

  delete from public.photos where photos.visit_id = sync_field_visit.visit_id;
  insert into public.photos (id, visit_id, storage_path, note, additional_note, created_at)
    select (p->>'id')::uuid, visit_id, p->>'storage_path',
      coalesce(p->>'note', ''), coalesce(p->>'additional_note', ''),
      (p->>'created_at')::timestamptz
    from jsonb_array_elements(coalesce(photo_payload, '[]'::jsonb)) p;
  return next_version;
end;
$$;

revoke all on function public.sync_field_visit(uuid, bigint, jsonb, jsonb, uuid, boolean) from public, anon;
grant execute on function public.sync_field_visit(uuid, bigint, jsonb, jsonb, uuid, boolean) to authenticated;
