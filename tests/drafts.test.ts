import 'fake-indexeddb/auto'
import { afterAll, beforeEach, expect, test, vi } from 'vitest'
vi.mock('../src/auth/supabase', () => ({ isSupabaseConfigured: true, supabase: undefined }))
vi.stubGlobal('window', new EventTarget())
const { db, createVisit, updateVisit } = await import('../src/db/database')
const { draftId, writeDraft, loadDraft, discardDraft, listDrafts } = await import('../src/db/drafts')
const { DraftSession } = await import('../src/db/draftSession')
const { clearSyncedCache } = await import('../src/db/sync')
const fields = {
  startedAt: '2026-10-15T07:00:00Z', locationType: 'toll_gate' as const, tollRoadId: 'jagorawi',
  customTollRoad: '', locationName: 'Ciawi 1', locationDetail: 'Multi 02', gateChoice: 'Ciawi 1',
  direction: '', station: '', activityName: 'Survey RFID', activityCategory: '' as const,
  pendingNote: 'Belum difoto', photos: [{ id: 'photo-1', blob: new Blob(['photo']), note: 'Tiang' }],
}
const input = {
  activityName: fields.activityName, notes: '', visitDate: fields.startedAt,
  primaryLocation: { type: fields.locationType, typeLabel: 'Gerbang Tol', name: fields.locationName },
  photos: fields.photos.map((photo) => ({ ...photo, additionalNote: '' })),
}
const meta = { id: draftId('vendra'), owner: 'vendra', revision: 0, newVisitId: 'visit-from-draft' }
const commit = { id: meta.id, revision: 1, newVisitId: meta.newVisitId }
beforeEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(db.tables.map((table) => table.clear()))
})
afterAll(() => db.close())

test('drafts restore incomplete fields, pending note and photo blobs, isolated from visits/sync and other accounts', async () => {
  await writeDraft(meta, fields)
  const restored = await loadDraft(meta.id)
  expect(restored?.fields).toMatchObject({ activityName: 'Survey RFID', pendingNote: 'Belum difoto', photos: [{ note: 'Tiang' }] })
  expect(await restored?.fields.photos[0].blob.text()).toBe('photo')
  expect(await listDrafts('acan')).toEqual([])
  expect(await db.visits.count()).toBe(0)
  expect(await db.syncJobs.count()).toBe(0)
})

test('photo-note edits reuse blobs; removed photos are deleted with the draft', async () => {
  await writeDraft(meta, fields)
  const add = vi.spyOn(db.draftPhotos, 'add')
  await writeDraft({ ...meta, revision: 1 }, { ...fields, photos: [{ ...fields.photos[0], note: 'Baru' }] })
  expect(add).not.toHaveBeenCalled()
  await discardDraft(meta.id, 2, meta.newVisitId)
  expect(await db.draftPhotos.count()).toBe(0)
})

test('another tab cannot overwrite, discard or consume a newer draft', async () => {
  await writeDraft(meta, fields)
  await expect(writeDraft(meta, { ...fields, activityName: 'Stale' })).rejects.toThrow('tab lain')
  await expect(discardDraft(meta.id, 0, meta.newVisitId)).rejects.toThrow('tab lain')
  await expect(createVisit(input, { ...commit, revision: 0 })).rejects.toThrow('tab lain')
  expect((await loadDraft(meta.id))?.fields.activityName).toBe('Survey RFID')
  expect(await db.visits.count()).toBe(0)
})

test('saving consumes draft and photos atomically and cannot create a duplicate', async () => {
  await writeDraft(meta, fields)
  await createVisit(input, commit)
  expect(await db.visits.get(meta.newVisitId)).toBeDefined()
  expect(await db.syncJobs.get(meta.newVisitId)).toBeDefined()
  expect(await db.photos.count()).toBe(1)
  expect(await loadDraft(meta.id)).toBeUndefined()
  expect(await db.draftPhotos.count()).toBe(0)
  await expect(createVisit(input, commit)).rejects.toThrow('tab lain')
  expect(await db.visits.count()).toBe(1)
})

test('failed visit save rolls back draft consumption', async () => {
  await writeDraft(meta, fields)
  await db.photos.add({ ...input.photos[0], visitId: 'other', createdAt: fields.startedAt })
  await expect(createVisit(input, commit)).rejects.toThrow()
  expect(await loadDraft(meta.id)).toBeDefined()
  expect(await db.draftPhotos.count()).toBe(1)
  expect(await db.visits.count()).toBe(0)
})

test('stale edit retains draft and cannot overwrite a newer visit', async () => {
  const visit = await createVisit(input)
  const edit = { ...meta, id: draftId('vendra', visit.id), visitId: visit.id, baseUpdatedAt: visit.updatedAt }
  await writeDraft(edit, fields)
  await db.visits.update(visit.id, { updatedAt: '2026-10-15T08:00:00Z', activityName: 'Cloud baru' })
  await expect(updateVisit(visit.id, input, visit.updatedAt, { ...commit, id: edit.id })).rejects.toThrow('sudah berubah')
  expect((await db.visits.get(visit.id))?.activityName).toBe('Cloud baru')
  expect(await loadDraft(edit.id)).toBeDefined()
})

test('serialized autosave preserves latest typing and never revives a consumed draft', async () => {
  const session = new DraftSession(meta)
  session.observe({ ...fields, activityName: '' })
  session.observe({ ...fields, activityName: 'Survey' })
  session.observe({ ...fields, activityName: 'Survey terbaru' })
  const saved = await session.flush()
  expect((await loadDraft(meta.id))?.fields.activityName).toBe('Survey terbaru')
  await createVisit(input, saved)
  session.stop()
  session.observe({ ...fields, activityName: 'Late render' })
  expect(await loadDraft(meta.id)).toBeUndefined()
})

test('storage failure is visible and retry preserves latest unsaved input', async () => {
  vi.spyOn(db.drafts, 'put').mockRejectedValueOnce(new DOMException('Full', 'QuotaExceededError'))
  const session = new DraftSession(meta)
  session.observe({ ...fields, activityName: '' })
  session.observe(fields)
  await expect(session.flush()).rejects.toThrow('Full')
  expect(session.getStatus()).toMatchObject({ kind: 'error' })
  session.observe({ ...fields, activityName: 'Terbaru setelah gagal' })
  await session.retry()
  await session.flush()
  expect((await loadDraft(meta.id))?.fields.activityName).toBe('Terbaru setelah gagal')
})

test('logout refuses to silently erase or leave behind unfinished documentation', async () => {
  await writeDraft(meta, fields)
  await expect(clearSyncedCache()).rejects.toThrow('Masih ada draft')
  expect(await loadDraft(meta.id)).toBeDefined()
})


test('old tabs cannot overwrite or remove a replacement draft with the same revision', async () => {
  await writeDraft(meta, fields)
  await discardDraft(meta.id, 1, meta.newVisitId)
  await writeDraft({ ...meta, newVisitId: 'replacement' }, { ...fields, activityName: 'Pengganti' })
  await expect(writeDraft({ ...meta, revision: 1 }, fields)).rejects.toThrow('tab lain')
  await expect(discardDraft(meta.id, 1, meta.newVisitId)).rejects.toThrow('tab lain')
  await expect(createVisit(input, commit)).rejects.toThrow('tab lain')
  expect((await loadDraft(meta.id))?.fields.activityName).toBe('Pengganti')
})

test('successful edit preserves photo identity and consumes only that edit draft', async () => {
  const visit = await createVisit(input)
  const edit = { ...meta, id: draftId('vendra', visit.id), visitId: visit.id, baseUpdatedAt: visit.updatedAt }
  await writeDraft(edit, fields)
  await writeDraft(meta, fields)
  await updateVisit(visit.id, { ...input, activityName: 'Edit selesai' }, visit.updatedAt, { ...commit, id: edit.id })
  expect((await db.visits.get(visit.id))?.activityName).toBe('Edit selesai')
  expect((await db.photos.toArray())[0].id).toBe(fields.photos[0].id)
  expect(await loadDraft(edit.id)).toBeUndefined()
  expect(await loadDraft(meta.id)).toBeDefined()
})
