import { db } from '../db/database'
import type { Photo, Visit } from '../types/visit'

export type ExportVisit = Pick<Visit, 'id' | 'updatedAt'>
export type ExportProgress = { completed: number; total: number }
export function checkExportCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Penyiapan dibatalkan.', 'AbortError')
}

// Read metadata and photos in a single transaction to keep every export consistent.
export async function readExportSnapshot(references: ExportVisit[]) {
  const unique = [...new Map(references.map((visit) => [visit.id, visit])).values()]
  if (!unique.length) throw new Error('Pilih kunjungan terlebih dahulu.')
  return db.transaction('r', db.visits, db.photos, async () => {
    const visits = await db.visits.bulkGet(unique.map((visit) => visit.id))
    const photos = await db.photos.where('visitId').anyOf(unique.map((visit) => visit.id)).toArray()
    const grouped = new Map<string, Photo[]>()
    for (const photo of photos) {
      const group = grouped.get(photo.visitId) ?? []
      group.push(photo)
      grouped.set(photo.visitId, group)
    }
    return unique.map((reference, index) => {
      const visit = visits[index]
      if (!visit || visit.updatedAt !== reference.updatedAt) {
        throw new Error('Ada kunjungan yang berubah atau dihapus. Buka ulang halaman lalu siapkan ekspor lagi.')
      }
      return { visit, photos: (grouped.get(visit.id) ?? [])
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)) }
    })
  })
}
