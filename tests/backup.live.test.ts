import { readFile } from 'node:fs/promises'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { makeBackupCloud } from '../src/backup/cloud'
import { createCloudBackup, documentDigest, previewRestore, restoreDocuments } from '../src/backup/operations'
import { readBackup, stableId } from '../src/backup/archive'
import type { BackupCloud } from '../src/backup/types'

vi.stubGlobal('navigator', { onLine: true })
const enabled = Boolean(process.env.FIELD_LOG_TEST_PIN)
const marker = `[TEST OTOMATIS BACKUP ${crypto.randomUUID()}]`
const sourceIds = [crypto.randomUUID(), crypto.randomUUID()]
const allowed = new Set<string>(sourceIds)
const created = new Set<string>()
const paths = new Set<string>()
const url = process.env.VITE_SUPABASE_URL!
const client = enabled ? createClient(url, process.env.VITE_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } }) : undefined
let cloud: BackupCloud

beforeAll(async () => {
  if (!enabled || !client) return
  const login = await client.auth.signInWithPassword({ email: 'vendra@fieldlog.internal', password: `field-log/vendra/${process.env.FIELD_LOG_TEST_PIN}` })
  if (login.error) throw login.error
  const base = makeBackupCloud(client, url)
  const guard = (id: string) => { if (!allowed.has(id)) throw new Error('Pengujian menolak UUID di luar fixture.') }
  cloud = { ...base,
    async listActive() {
      const result = await client.from('visits').select('id,sync_version,deleted_at,sync_request').in('id', sourceIds).is('deleted_at', null).order('id')
      if (result.error) throw result.error
      return result.data.map((row) => ({ id: row.id, version: row.sync_version, deletedAt: row.deleted_at, requestId: row.sync_request }))
    },
    async document(id) { guard(id); return base.document(id) },
    async revision(id) { guard(id); return base.revision(id) },
    async upload(path, blob) { guard(path.split('/')[0]); paths.add(path); return base.upload(path, blob) },
    async commit(request) { guard(request.id); await base.commit(request); created.add(request.id) },
  }
  const blob = new Blob([new Uint8Array(await readFile(new URL('../external/barca.jpeg', import.meta.url)))], { type: 'image/jpeg' })
  for (const [index, id] of sourceIds.entries()) {
    const date = new Date().toISOString()
    const photoId = crypto.randomUUID(), path = `${id}/${photoId}.jpg`
    const photos = index === 0 ? [{ id: photoId, visitId: id, path, note: 'Catatan uji pemulihan', additionalNote: '', createdAt: date }] : []
    if (photos.length) await cloud.upload(path, blob)
    await cloud.commit({ id, expectedVersion: 0, requestId: crypto.randomUUID(),
      visit: { id, activityName: `${marker} ${index}`, notes: 'Data sintetis, akan dibersihkan.', visitDate: date, createdAt: date, updatedAt: date,
        primaryLocation: { type: 'other', typeLabel: 'Lokasi Lain', name: 'Lokasi uji backup' } }, photos })
  }
}, 30000)

afterAll(async () => {
  if (!client) return
  for (const id of created) {
    const row = await client.from('visits').select('activity_name').eq('id', id).maybeSingle()
    if (row.data?.activity_name.startsWith(marker)) await client.from('visits').delete().eq('id', id)
  }
  if (paths.size) await client.storage.from('field-photos').remove([...paths])
  await client.auth.signOut()
}, 30000)

test.skipIf(!enabled)('actual private cloud backup restores a deleted visit, preserves a changed one, and retries without duplicates', async () => {
  const backup = await createCloudBackup(cloud)
  const archive = await readBackup(backup.blob)
  expect(archive.manifest.visits).toHaveLength(2)
  expect(archive.manifest.photos).toHaveLength(1)
  for (const visit of archive.manifest.visits) {
    const digest = await documentDigest(visit, archive.manifest.photos.filter((photo) => photo.visitId === visit.id))
    allowed.add(await stableId(`log-lapangan/restore-copy/v1/${visit.id}/${digest}`))
  }
  expect((await previewRestore(cloud, archive)).every((row) => row.kind === 'same')).toBe(true)
  const deleted = await client!.rpc('sync_field_visit', { visit_id: sourceIds[0], expected_version: 1, request_id: crypto.randomUUID(), remove_visit: true, visit_payload: {}, photo_payload: [] })
  expect(deleted.error).toBeNull()
  await client!.storage.from('field-photos').remove([...paths])
  const peer = (await cloud.document(sourceIds[1]))!
  await cloud.commit({ id: sourceIds[1], expectedVersion: 1, requestId: crypto.randomUUID(), visit: { ...peer.visit, notes: 'Versi cloud baru harus dipertahankan' }, photos: [] })
  const preview = await previewRestore(cloud, archive)
  expect(preview.find((row) => row.id === sourceIds[0])?.kind).toBe('deleted')
  expect(preview.find((row) => row.id === sourceIds[1])?.kind).toBe('changed')
  const restored = await restoreDocuments(cloud, archive, preview)
  expect(restored.every((row) => row.status === 'restored'), JSON.stringify(restored)).toBe(true)
  const original = (await cloud.document(sourceIds[0]))!
  expect(original.photos).toHaveLength(1)
  expect(await (await cloud.download(original.photos[0].path)).arrayBuffer()).toEqual(await archive.files.get(archive.manifest.photos[0].id)!.arrayBuffer())
  expect((await cloud.document(sourceIds[1]))!.visit.notes).toBe('Versi cloud baru harus dipertahankan')
  const copy = preview.find((row) => row.kind === 'changed')!
  expect((await cloud.document(copy.targetId))!.visit.notes).toBe('Data sintetis, akan dibersihkan.')
  expect((await restoreDocuments(cloud, archive, preview)).every((row) => row.status === 'already')).toBe(true)
  const checked = await previewRestore(cloud, archive)
  expect(checked.find((row) => row.id === sourceIds[0])?.kind).toBe('same')
  expect(checked.find((row) => row.id === sourceIds[1])?.kind).toBe('copy-exists')
}, 60000)
