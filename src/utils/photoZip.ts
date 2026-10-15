import { Zip, ZipPassThrough } from 'fflate'
import { db } from '../db/database'
import type { Visit } from '../types/visit'
import { createPhotoFilename, createStampedPhoto } from './image'
import { jakartaDate } from './visitFilters'

export type ExportVisit = Pick<Visit, 'id' | 'updatedAt'>
export type ExportProgress = { completed: number; total: number }
export type PhotoZip = { blob: Blob; filename: string; photoCount: number; visitCount: number }
const MAX_ZIP_BYTES = 100 * 1024 * 1024

function filenamePart(value: string) {
  return value.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
}
function checkCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Penyiapan ZIP dibatalkan.', 'AbortError')
}

export async function createPhotoZip(references: ExportVisit[], options: {
  signal?: AbortSignal
  onProgress?: (progress: ExportProgress) => void
} = {}): Promise<PhotoZip> {
  const { signal, onProgress } = options
  checkCancelled(signal)
  const unique = [...new Map(references.map((visit) => [visit.id, visit])).values()]
  if (!unique.length) throw new Error('Pilih kunjungan yang memiliki foto terlebih dahulu.')

  // Freeze metadata and blobs together, so a concurrent sync cannot mix versions.
  const snapshot = await db.transaction('r', db.visits, db.photos, async () => {
    const visits = await db.visits.bulkGet(unique.map((visit) => visit.id))
    const photos = await db.photos.where('visitId').anyOf(unique.map((visit) => visit.id)).toArray()
    return unique.map((reference, index) => {
      const visit = visits[index]
      if (!visit || visit.updatedAt !== reference.updatedAt) {
        throw new Error('Ada kunjungan yang berubah atau dihapus. Buka ulang halaman lalu siapkan ZIP lagi.')
      }
      return { visit, photos: photos.filter((photo) => photo.visitId === visit.id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)) }
    }).filter((entry) => entry.photos.length > 0)
  })
  checkCancelled(signal)
  const total = snapshot.reduce((count, entry) => count + entry.photos.length, 0)
  if (!total) throw new Error('Belum ada foto pada kunjungan yang dipilih.')
  onProgress?.({ completed: 0, total })

  const chunks: ArrayBuffer[] = []
  let size = 0
  let zipError: Error | undefined
  let finished = false
  const archive = new Zip((error, data, final) => {
    if (error) { zipError = error; return }
    size += data.byteLength
    if (size > MAX_ZIP_BYTES) {
      zipError = new Error('ZIP melebihi 100 MB. Persempit filter atau unduh per kunjungan.')
      return
    }
    chunks.push(new Uint8Array(data).buffer)
    finished = final
  })
  let completed = 0
  try {
    for (const [visitIndex, { visit, photos }] of snapshot.entries()) {
      const folder = [String(visitIndex + 1).padStart(3, '0'), jakartaDate(visit.visitDate),
        visit.primaryLocation.tollRoadName, visit.primaryLocation.name, visit.activityName]
        .filter(Boolean).map((part) => filenamePart(part!)).filter(Boolean).join('_')
      for (const [photoIndex, photo] of photos.entries()) {
        checkCancelled(signal)
        const stamped = await createStampedPhoto(photo.blob, visit, photo)
        checkCancelled(signal)
        const bytes = new Uint8Array(await stamped.arrayBuffer())
        checkCancelled(signal)
        // JPEG is already compressed; store it without an unnecessary compression pass.
        const file = new ZipPassThrough(`${folder}/${createPhotoFilename(visit, photoIndex)}`)
        archive.add(file)
        file.push(bytes, true)
        if (zipError) throw zipError
        completed++
        onProgress?.({ completed, total })
        await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0))
      }
    }
    checkCancelled(signal)
    archive.end()
    if (zipError) throw zipError
    if (!finished) throw new Error('ZIP belum berhasil diselesaikan. Coba lagi.')
    const dates = snapshot.map(({ visit }) => jakartaDate(visit.visitDate)).sort()
    const dateLabel = dates[0] === dates.at(-1) ? dates[0] : `${dates[0]}_${dates.at(-1)}`
    return { blob: new Blob(chunks, { type: 'application/zip' }),
      filename: `log-lapangan_${dateLabel}_${snapshot.length}-kunjungan.zip`,
      photoCount: total, visitCount: snapshot.length }
  } finally {
    archive.terminate()
    chunks.length = 0
  }
}
