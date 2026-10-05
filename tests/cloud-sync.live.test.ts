import 'fake-indexeddb/auto'
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'

vi.mock('../src/auth/supabase', async () => {
  const { createClient } = await import('@supabase/supabase-js')
  return {
    isSupabaseConfigured: true,
    supabase: createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  }
})
vi.stubGlobal('window', new EventTarget())
vi.stubGlobal('navigator', { onLine: true })

const enabled = Boolean(process.env.FIELD_LOG_TEST_PIN)
const createdIds = new Set<string>()
let db: typeof import('../src/db/database')['db']
let cloud: NonNullable<typeof import('../src/auth/supabase')['supabase']>
let peer: ReturnType<typeof createClient>
let visitId = ''
let photoPath = ''
let firstVersion = 0
const testActivity = `[TEST OTOMATIS] Sinkronisasi ${crypto.randomUUID()}`

beforeAll(async () => {
  if (!enabled) return
  db = (await import('../src/db/database')).db
  cloud = (await import('../src/auth/supabase')).supabase!
  peer = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  for (const [client, code] of [[cloud, 'vendra'], [peer, 'acan']] as const) {
    const login = await client.auth.signInWithPassword({
      email: `${code}@fieldlog.internal`, password: `field-log/${code}/${process.env.FIELD_LOG_TEST_PIN}`,
    })
    if (login.error) throw login.error
  }
}, 30000)

afterAll(async () => {
  if (!enabled || !cloud) return
  // Hanya bersihkan UUID yang dibuat pengujian, tidak menyentuh dokumentasi pengguna.
  for (const id of createdIds) {
    const { data } = await cloud.from('photos').select('storage_path').eq('visit_id', id)
    if (data?.length) await cloud.storage.from('field-photos').remove(data.map((photo) => photo.storage_path))
    await cloud.from('visits').delete().eq('id', id)
  }
  if (photoPath) await cloud.storage.from('field-photos').remove([photoPath])
  await cloud.auth.signOut()
  await peer?.auth.signOut()
  await db?.delete()
}, 30000)

test.skipIf(!enabled)('offline visit queues, syncs to private storage, and another member reads it', async () => {
  const { createVisit } = await import('../src/db/database')
  const { syncNow, getSyncStatus } = await import('../src/db/sync')
  vi.stubGlobal('navigator', { onLine: false })
  const visit = await createVisit({
    activityName: testActivity,
    primaryLocation: { type: 'toll_gate', typeLabel: 'Gerbang Tol', name: 'Lokasi uji', tollRoadName: 'Ruas uji' },
    notes: 'Data sintetis; akan dihapus setelah pengujian.', visitDate: new Date().toISOString(),
    photos: [{ blob: new Blob([new Uint8Array([255, 216, 255, 217])], { type: 'image/jpeg' }), note: 'Foto sintetis', additionalNote: '' }],
  })
  visitId = visit.id
  createdIds.add(visit.id)
  await syncNow()
  expect(getSyncStatus().pending).toBe(1)
  expect(await db.visits.get(visitId)).toBeDefined()

  vi.stubGlobal('navigator', { onLine: true })
  await syncNow()
  expect(getSyncStatus().error, getSyncStatus().message).toBe(false)
  expect(await db.syncJobs.count()).toBe(0)

  const remote = await peer.from('visits').select('*').eq('id', visitId).single()
  expect(remote.error).toBeNull()
  expect(remote.data.activity_name).toBe(visit.activityName)
  firstVersion = remote.data.sync_version
  const photo = await peer.from('photos').select('*').eq('visit_id', visitId).single()
  expect(photo.error).toBeNull()
  photoPath = photo.data.storage_path
  const download = await peer.storage.from('field-photos').download(photoPath)
  expect(download.error).toBeNull()
  expect(Array.from(new Uint8Array(await download.data!.arrayBuffer()))).toEqual([255, 216, 255, 217])
  const publicUrl = peer.storage.from('field-photos').getPublicUrl(photoPath).data.publicUrl
  expect((await fetch(publicUrl)).ok).toBe(false)
}, 60000)

test.skipIf(!enabled)('cloud edit conflicts with offline edit; local copy preserves both versions', async () => {
  const { updateVisit } = await import('../src/db/database')
  const { syncNow, getSyncStatus, resolveSyncConflict } = await import('../src/db/sync')
  const local = (await db.visits.get(visitId))!
  const photos = await db.photos.where('visitId').equals(visitId).toArray()
  const remotePhotos = await peer.from('photos').select('*').eq('visit_id', visitId)
  const remote = await peer.rpc('sync_field_visit', {
    visit_id: visitId, expected_version: firstVersion, request_id: crypto.randomUUID(), remove_visit: false,
    visit_payload: {
      activity_name: local.activityName, primary_location: local.primaryLocation,
      notes: 'Edit dari perangkat acan', visit_date: local.visitDate, created_at: local.createdAt,
    }, photo_payload: remotePhotos.data,
  })
  expect(remote.error).toBeNull()
  vi.stubGlobal('navigator', { onLine: false })
  await updateVisit(visitId, { ...local, notes: 'Edit offline vendra', photos }, local.updatedAt)
  vi.stubGlobal('navigator', { onLine: true })
  await syncNow()
  expect(getSyncStatus().conflictId).toBe(visitId)
  expect((await db.visits.get(visitId))?.notes).toBe('Edit offline vendra')
  await resolveSyncConflict(true)
  const allLocal = await db.visits.toArray()
  for (const visit of allLocal) {
    if (visit.activityName === `${testActivity} (salinan lokal)`) createdIds.add(visit.id)
  }
  expect(getSyncStatus().error, getSyncStatus().message).toBe(false)
  expect((await db.visits.get(visitId))?.notes).toBe('Edit dari perangkat acan')
  const copied = allLocal.find((visit) => visit.activityName === `${testActivity} (salinan lokal)`)
  expect(copied).toBeDefined()
  expect(await db.photos.where('visitId').equals(copied!.id).count()).toBe(1)
  const pulledPhoto = (await db.photos.where('visitId').equals(visitId).toArray())[0]
  expect(Array.from(new Uint8Array(await pulledPhoto.blob.arrayBuffer()))).toEqual([255, 216, 255, 217])
}, 60000)

test.skipIf(!enabled)('delete sync removes private file and leaves cloud tombstone', async () => {
  const { deleteVisit } = await import('../src/db/database')
  const { syncNow, getSyncStatus } = await import('../src/db/sync')
  await deleteVisit(visitId)
  await syncNow()
  expect(getSyncStatus().error, getSyncStatus().message).toBe(false)
  const row = await peer.from('visits').select('deleted_at').eq('id', visitId).single()
  expect(row.error).toBeNull()
  expect(row.data.deleted_at).not.toBeNull()
  const [folder, filename] = photoPath.split('/')
  const listing = await peer.storage.from('field-photos').list(folder)
  expect(listing.error).toBeNull()
  expect(listing.data!.some((file) => file.name === filename)).toBe(false)
  const { data: session } = await peer.auth.getSession()
  const uncached = await fetch(`${process.env.VITE_SUPABASE_URL}/storage/v1/object/authenticated/field-photos/${photoPath}?check=${crypto.randomUUID()}`, {
    headers: {
      apikey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
      Authorization: `Bearer ${session.session!.access_token}`,
    },
  })
  expect(uncached.ok).toBe(false)
}, 60000)
