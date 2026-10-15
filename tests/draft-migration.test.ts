import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { expect, test, vi } from 'vitest'
vi.mock('../src/auth/supabase', () => ({ isSupabaseConfigured: false }))
const { db } = await import('../src/db/database')
test('upgrade from v4 preserves existing visits, photos and sync queue', async () => {
  const legacy = new Dexie('field-log')
  legacy.version(4).stores({
    visits: 'id, createdAt, visitDate, activityCategory, primaryLocation.type', photos: 'id, visitId, createdAt',
    syncJobs: 'id', syncRecords: 'id', syncCleanup: 'path, visitId',
  })
  await legacy.table('visits').put({ id: 'existing', activityName: 'Data lama' })
  await legacy.table('photos').put({ id: 'photo', visitId: 'existing', blob: new Blob(['original']) })
  await legacy.table('syncJobs').put({ id: 'existing', token: 'pending', operation: 'save' })
  legacy.close()
  await db.open()
  expect((await db.visits.get('existing'))?.activityName).toBe('Data lama')
  expect(await (await db.photos.get('photo'))?.blob.text()).toBe('original')
  expect((await db.syncJobs.get('existing'))?.token).toBe('pending')
  expect(await db.drafts.count()).toBe(0)
  expect(await db.draftPhotos.count()).toBe(0)
  db.close()
})
