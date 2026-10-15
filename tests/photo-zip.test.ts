import 'fake-indexeddb/auto'
import { afterAll, beforeEach, expect, test, vi } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
vi.mock('../src/auth/supabase', () => ({ isSupabaseConfigured: false }))
vi.mock('../src/utils/image', async (original) => ({
  ...await original<typeof import('../src/utils/image')>(),
  createStampedPhoto: vi.fn(async (_blob, visit, photo) => new Blob([JSON.stringify({ activity: visit.activityName,
    road: visit.primaryLocation.tollRoadName, note: photo.note, extra: photo.additionalNote })])),
}))
const { db } = await import('../src/db/database')
const { createPhotoZip } = await import('../src/utils/photoZip')
const { createStampedPhoto } = await import('../src/utils/image')
const date = '2026-10-14T18:00:00Z'
const visits = ['a', 'b', 'empty'].map((id) => ({
  id, activityName: 'Survey / ../../ RFID', notes: '', visitDate: date, createdAt: date, updatedAt: date,
  primaryLocation: { type: 'toll_gate' as const, typeLabel: 'Gerbang Tol', tollRoadName: 'Jagorawi', name: 'Ciawi 1' },
}))
const photos = ['a', 'a', 'b'].map((visitId, index) => ({
  id: `photo-${index}`, visitId, blob: new Blob(['original']), note: `Catatan ${index}`, additionalNote: '', createdAt: date,
}))
beforeEach(async () => {
  vi.clearAllMocks()
  await db.visits.clear(); await db.photos.clear()
  await db.visits.bulkPut(visits); await db.photos.bulkPut(photos)
})
afterAll(() => db.close())
async function contents(result: { blob: Blob }) { return unzipSync(new Uint8Array(await result.blob.arrayBuffer())) }

test('ZIP contains every stamped photo in distinct safe folders, including visits with the same names', async () => {
  const result = await createPhotoZip(visits)
  const files = await contents(result)
  expect(Object.keys(files)).toHaveLength(3)
  expect(new Set(Object.keys(files).map((path) => path.split('/')[0])).size).toBe(2)
  expect(Object.keys(files).every((path) => !path.includes('..') && path.split('/').length === 2 && path.endsWith('.jpg'))).toBe(true)
  expect(Object.values(files).map((bytes) => JSON.parse(strFromU8(bytes)).note)).toEqual(['Catatan 0', 'Catatan 1', 'Catatan 2'])
  expect(result).toMatchObject({ photoCount: 3, visitCount: 2, filename: 'log-lapangan_2026-10-15_2-kunjungan.zip' })
  expect(await (await db.photos.get('photo-0'))?.blob.text()).toBe('original')
})

test('only the supplied filtered visits are exported, with duplicate references removed', async () => {
  const result = await createPhotoZip([visits[1], visits[1]])
  const files = await contents(result)
  expect(Object.keys(files)).toHaveLength(1)
  expect(JSON.parse(strFromU8(Object.values(files)[0])).note).toBe('Catatan 2')
})

test('missing or changed visits fail explicitly rather than exporting stale selections', async () => {
  await db.visits.update('a', { updatedAt: '2026-10-15T08:00:00Z' })
  await expect(createPhotoZip([visits[0]])).rejects.toThrow('berubah atau dihapus')
  await db.visits.delete('b')
  await expect(createPhotoZip([visits[1]])).rejects.toThrow('berubah atau dihapus')
  expect(createStampedPhoto).not.toHaveBeenCalled()
})

test('empty selections do not produce misleading empty ZIP downloads', async () => {
  await expect(createPhotoZip([])).rejects.toThrow('Pilih kunjungan')
  await expect(createPhotoZip([visits[2]])).rejects.toThrow('Belum ada foto')
})

test('cancelled exports stop before the next photo and never return a partial archive', async () => {
  const controller = new AbortController()
  await expect(createPhotoZip(visits, { signal: controller.signal, onProgress: ({ completed }) => {
    if (completed === 1) controller.abort()
  } })).rejects.toMatchObject({ name: 'AbortError' })
  expect(createStampedPhoto).toHaveBeenCalledTimes(1)
})

test('one failed image aborts the archive instead of silently omitting a photo', async () => {
  vi.mocked(createStampedPhoto).mockRejectedValueOnce(new Error('Foto rusak'))
  await expect(createPhotoZip(visits)).rejects.toThrow('Foto rusak')
})

test('snapshot stays consistent when another tab updates notes during export', async () => {
  vi.mocked(createStampedPhoto).mockImplementationOnce(async (_blob, visit, photo) => {
    await db.photos.update('photo-1', { note: 'Perubahan berikutnya' })
    return new Blob([JSON.stringify({ activity: visit.activityName, note: photo.note })])
  })
  const files = await contents(await createPhotoZip([visits[0]]))
  expect(Object.values(files).map((bytes) => JSON.parse(strFromU8(bytes)).note)).toEqual(['Catatan 0', 'Catatan 1'])
  expect((await db.photos.get('photo-1'))?.note).toBe('Perubahan berikutnya')
})
