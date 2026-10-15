import 'fake-indexeddb/auto'
import { readFile } from 'node:fs/promises'
import { afterAll, beforeEach, expect, test, vi } from 'vitest'
vi.mock('../src/auth/supabase', () => ({ isSupabaseConfigured: false }))
const { db } = await import('../src/db/database')
const { createVisitReport } = await import('../src/utils/visitReport')
const date = '2026-10-14T18:00:00Z'
const visits = ['a', 'b', 'empty'].map((id) => ({
  id, activityName: `Survey ${id}`, notes: '', visitDate: date, createdAt: date, updatedAt: date,
  primaryLocation: { type: 'toll_gate' as const, typeLabel: 'Gerbang Tol', tollRoadName: 'Jagorawi', name: 'Ciawi 1' },
}))
const jpeg = new Blob([new Uint8Array(await readFile(new URL('../external/barca.jpeg', import.meta.url)))], { type: 'image/jpeg' })
beforeEach(async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: URL) => {
    const data = await readFile(url)
    return new Response(new Uint8Array(data))
  }))
  await db.visits.clear(); await db.photos.clear()
  await db.visits.bulkPut(visits)
  await db.photos.bulkPut(['a', 'b'].map((visitId) => ({ id: `photo-${visitId}`, visitId, blob: jpeg,
    note: `Catatan ${visitId}`, additionalNote: '', createdAt: date })))
})
afterAll(() => { vi.unstubAllGlobals(); db.close() })

test('complete PDF includes zero-photo visits in summary and adds photo documentation pages', async () => {
  const report = await createVisitReport(visits)
  expect(report).toMatchObject({ visitCount: 3, photoCount: 2, pageCount: 3, filename: 'rekap-lapangan_2026-10-15_3-kunjungan_lengkap.pdf' })
  expect(report.blob.type).toBe('application/pdf')
  expect(new TextDecoder().decode((await report.blob.arrayBuffer()).slice(0, 5))).toBe('%PDF-')
  expect(await db.visits.count()).toBe(3)
  expect(await db.photos.count()).toBe(2)
})

test('summary mode exports only the filtered selection without photo pages', async () => {
  const report = await createVisitReport([visits[0], visits[0]], { includePhotos: false, selectionLabel: 'Ruas: Jagorawi' })
  expect(report).toMatchObject({ visitCount: 1, photoCount: 1, pageCount: 1 })
})

test('long table cells and photo notes flow across pages', async () => {
  await db.visits.update('a', { activityName: 'Kegiatan panjang '.repeat(150) })
  await db.photos.update('photo-a', { note: 'Catatan panjang jalur kabel '.repeat(200) })
  const report = await createVisitReport([visits[0]])
  expect(report.pageCount).toBeGreaterThan(4)
  expect(report.visitCount).toBe(1)
})

test('stale references and empty selections fail before creating a misleading PDF', async () => {
  await db.visits.update('a', { updatedAt: '2026-10-15T08:00:00Z' })
  await expect(createVisitReport([visits[0]])).rejects.toThrow('berubah atau dihapus')
  await expect(createVisitReport([])).rejects.toThrow('Pilih kunjungan')
})

test('cancellation during summary processing returns no partial report', async () => {
  const controller = new AbortController()
  await expect(createVisitReport(visits, { signal: controller.signal, onProgress: ({ completed }) => {
    if (completed === 1) controller.abort()
  } })).rejects.toMatchObject({ name: 'AbortError' })
})

test('font loading failure is reported instead of producing unreadable text', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
  await expect(createVisitReport(visits)).rejects.toThrow('Font laporan belum bisa dimuat')
})

test('a corrupt photo fails full documentation, while summary remains available', async () => {
  await db.photos.update('photo-a', { blob: new Blob(['not an image']) })
  await expect(createVisitReport([visits[0]])).rejects.toThrow('foto')
  expect((await createVisitReport([visits[0]], { includePhotos: false })).pageCount).toBe(1)
})
