import { db } from './database'
import type { DraftFields, DraftRecord, LoadedDraft } from '../types/draft'

export function draftId(owner: string, visitId?: string) {
  return `${owner}:${visitId ? `edit:${visitId}` : 'new'}`
}
export function notifyDrafts() { window.dispatchEvent(new Event('field-log-draft-change')) }
export function listDrafts(owner: string) {
  return db.drafts.where('owner').equals(owner).reverse().sortBy('updatedAt')
}
export async function loadDraft(id: string): Promise<LoadedDraft | undefined> {
  return db.transaction('r', db.drafts, db.draftPhotos, async () => {
    const row = await db.drafts.get(id)
    if (!row) return
    const photos = await Promise.all(row.fields.photos.map(async (photo) => {
      const file = await db.draftPhotos.get([id, photo.id])
      if (!file) throw new Error('Foto draft tidak lengkap.')
      return { ...photo, blob: file.blob }
    }))
    return { ...row, fields: { ...row.fields, photos } }
  })
}
export async function writeDraft(meta: Omit<DraftRecord, 'fields' | 'updatedAt'>, fields: DraftFields) {
  const revision = await db.transaction('rw', db.drafts, db.draftPhotos, async () => {
    const current = await db.drafts.get(meta.id)
    if ((current?.revision ?? 0) !== meta.revision || (current && current.newVisitId !== meta.newVisitId)) {
      throw new Error('Draft berubah di tab lain. Buka ulang form; isian di tab ini belum tersimpan.')
    }
    const ids = new Set(fields.photos.map((photo) => photo.id))
    for (const file of await db.draftPhotos.where('draftId').equals(meta.id).toArray()) {
      if (!ids.has(file.id)) await db.draftPhotos.delete([meta.id, file.id])
    }
    for (const photo of fields.photos) {
      if (!(await db.draftPhotos.get([meta.id, photo.id]))) {
        await db.draftPhotos.add({ draftId: meta.id, id: photo.id, blob: photo.blob })
      }
    }
    const next = meta.revision + 1
    await db.drafts.put({ ...meta, revision: next, updatedAt: new Date().toISOString(),
      fields: { ...fields, photos: fields.photos.map(({ id, note }) => ({ id, note })) } })
    return next
  })
  notifyDrafts()
  return revision
}
export async function discardDraft(id: string, expectedRevision: number, expectedNewVisitId: string) {
  await db.transaction('rw', db.drafts, db.draftPhotos, async () => {
    const current = await db.drafts.get(id)
    if (current && (current.revision !== expectedRevision || current.newVisitId !== expectedNewVisitId)) {
      throw new Error('Draft berubah di tab lain. Muat ulang sebelum membuangnya.')
    }
    await db.drafts.delete(id)
    await db.draftPhotos.where('draftId').equals(id).delete()
  })
  notifyDrafts()
}
