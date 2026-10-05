import 'fake-indexeddb/auto'
import { afterAll, beforeEach, expect, test, vi } from 'vitest'

vi.mock('../src/auth/supabase', () => ({ isSupabaseConfigured: true }))
vi.stubGlobal('window', new EventTarget())

const { db, createVisit, updateVisit, deleteVisit } = await import('../src/db/database')
const input = {
  activityName: 'Survey RFID',
  primaryLocation: { type: 'toll_gate' as const, typeLabel: 'Gerbang Tol', name: 'GT Cibubur' },
  notes: '', visitDate: '2026-10-05T07:00:00Z',
  photos: [{ blob: new Blob(['photo']), note: 'Awal', additionalNote: '' }],
}

beforeEach(async () => {
  await db.transaction('rw', db.visits, db.photos, db.syncJobs, db.syncRecords, async () => {
    await db.visits.clear(); await db.photos.clear(); await db.syncJobs.clear(); await db.syncRecords.clear()
  })
})

afterAll(async () => { db.close() })

test('create queues durable sync with photos in one transaction', async () => {
  const visit = await createVisit(input)
  expect(await db.syncJobs.get(visit.id)).toMatchObject({ operation: 'save' })
  expect(await db.photos.where('visitId').equals(visit.id).count()).toBe(1)
})

test('editing preserves photo identity and replaces the queue token', async () => {
  const visit = await createVisit(input)
  const token = (await db.syncJobs.get(visit.id))?.token
  const photos = await db.photos.where('visitId').equals(visit.id).toArray()
  await updateVisit(visit.id, { ...input, photos, notes: 'Baru' }, visit.updatedAt)
  expect((await db.photos.toArray())[0].id).toBe(photos[0].id)
  expect((await db.syncJobs.get(visit.id))?.token).not.toBe(token)
})

test('stale form cannot overwrite newer visit data', async () => {
  const visit = await createVisit(input)
  await db.visits.update(visit.id, { updatedAt: '2026-10-05T08:00:00Z', notes: 'Cloud terbaru' })
  await expect(updateVisit(visit.id, input, visit.updatedAt)).rejects.toThrow('sudah berubah')
  expect((await db.visits.get(visit.id))?.notes).toBe('Cloud terbaru')
})

test('delete retains its queue job after local visit and photos disappear', async () => {
  const visit = await createVisit(input)
  await deleteVisit(visit.id)
  expect(await db.visits.get(visit.id)).toBeUndefined()
  expect(await db.photos.count()).toBe(0)
  expect(await db.syncJobs.get(visit.id)).toMatchObject({ operation: 'delete' })
})
