import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, expect, test } from 'vitest'

const database = new PGlite()
const memberId = '11111111-1111-4111-8111-111111111111'
const visitId = '22222222-2222-4222-8222-222222222222'
const requestId = '33333333-3333-4333-8333-333333333333'

beforeAll(async () => {
  await database.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create schema storage;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
    grant usage on schema auth, public, storage to anon, authenticated;
    create table storage.buckets (id text primary key, name text, public boolean,
      file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key, bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant select, insert, update, delete on storage.objects to authenticated;
  `)
  await database.exec(await readFile('supabase/field-log-schema.sql', 'utf8'))
  await database.exec(await readFile('supabase/field-log-sync.sql', 'utf8'))
  await database.exec(`
    insert into auth.users values ('${memberId}');
    insert into public.team_members (user_id, member_code) values ('${memberId}', 'vendra');
    set role authenticated;
    select set_config('request.jwt.claim.sub', '${memberId}', false);
  `)
}, 30000)

afterAll(async () => { await database.close() })

const payload = {
  activity_name: 'Survey RFID', primary_location: { type: 'toll_gate', name: 'GT Cibubur' },
  notes: 'Catatan awal', visit_date: '2026-10-05T07:00:00Z', created_at: '2026-10-05T07:00:00Z',
}

async function commit(expected: number, request: string, remove = false, photos: object[] = []) {
  return database.query<{ sync_field_visit: number }>(
    'select public.sync_field_visit($1, $2, $3::jsonb, $4::jsonb, $5, $6)',
    [visitId, expected, JSON.stringify(payload), JSON.stringify(photos), request, remove],
  )
}

test('member can save atomically, retry safely, and conflicts preserve server data', async () => {
  expect((await commit(0, requestId)).rows[0].sync_field_visit).toBe(1)
  expect((await commit(0, requestId)).rows[0].sync_field_visit).toBe(1)
  await expect(commit(0, '44444444-4444-4444-8444-444444444444')).rejects.toThrow('SYNC_CONFLICT')
  expect((await database.query('select sync_version from visits')).rows).toEqual([{ sync_version: 1 }])
})

test('failed photo metadata rolls back visit changes', async () => {
  await expect(commit(1, '55555555-5555-4555-8555-555555555555', false, [{ id: 'invalid' }])).rejects.toThrow()
  expect((await database.query('select sync_version from visits')).rows).toEqual([{ sync_version: 1 }])
})

test('delete leaves a tombstone and retry is idempotent', async () => {
  const token = '66666666-6666-4666-8666-666666666666'
  expect((await commit(1, token, true)).rows[0].sync_field_visit).toBe(2)
  expect((await commit(1, token, true)).rows[0].sync_field_visit).toBe(2)
  const row = (await database.query('select deleted_at from visits')).rows[0]
  expect(row.deleted_at).not.toBeNull()
})

test('unknown authenticated account cannot read or mutate team data', async () => {
  await database.query('select set_config($1, $2, false)', ['request.jwt.claim.sub', '77777777-7777-4777-8777-777777777777'])
  expect((await database.query('select id from visits')).rows).toEqual([])
  await expect(commit(2, '88888888-8888-4888-8888-888888888888')).rejects.toThrow('Anggota tidak diizinkan')
})

test('anonymous access is denied', async () => {
  await database.exec('reset role; set role anon;')
  await expect(database.query('select id from visits')).rejects.toThrow('permission denied')
  await expect(commit(2, requestId)).rejects.toThrow('permission denied')
})
