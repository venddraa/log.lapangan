import Dexie, { type Table } from 'dexie'
import type {
  CreateVisitInput,
  Photo,
  Visit,
  VisitSummary,
} from '../types/visit'

class FieldLogDatabase extends Dexie {
  visits!: Table<Visit, string>
  photos!: Table<Photo, string>

  constructor() {
    super('field-log')
    this.version(1).stores({
      visits:
        'id, createdAt, visitDate, activityCategory, primaryLocation.type',
    })
    this.version(2).stores({
      visits:
        'id, createdAt, visitDate, activityCategory, primaryLocation.type',
      photos: 'id, visitId, createdAt',
    })
  }
}

export const db = new FieldLogDatabase()

export async function createVisit({ photos, ...input }: CreateVisitInput) {
  const now = new Date().toISOString()
  const visit: Visit = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  }

  const photoRecords: Photo[] = photos.map((photo) => ({
    ...photo,
    id: photo.id ?? crypto.randomUUID(),
    visitId: visit.id,
    createdAt: now,
  }))

  await db.transaction('rw', db.visits, db.photos, async () => {
    await db.visits.add(visit)
    if (photoRecords.length > 0) {
      await db.photos.bulkAdd(photoRecords)
    }
  })

  return visit
}

export async function updateVisit(id: string, input: CreateVisitInput) {
  const existingVisit = await db.visits.get(id)
  if (!existingVisit) throw new Error('Kunjungan tidak ditemukan.')

  const now = new Date().toISOString()
  const { photos, ...visitInput } = input
  const updatedVisit: Visit = {
    ...existingVisit,
    ...visitInput,
    id,
    createdAt: existingVisit.createdAt,
    updatedAt: now,
  }

  const existingPhotos = await db.photos.where('visitId').equals(id).toArray()
  const existingPhotosById = new Map(
    existingPhotos.map((photo) => [photo.id, photo]),
  )
  const keptPhotoIds = new Set(photos.flatMap((photo) => (photo.id ? [photo.id] : [])))
  const deletedPhotoIds = existingPhotos
    .filter((photo) => !keptPhotoIds.has(photo.id))
    .map((photo) => photo.id)
  const updatedPhotos: Photo[] = photos.map((photo) => ({
    ...photo,
    id: photo.id ?? crypto.randomUUID(),
    visitId: id,
    createdAt:
      (photo.id && existingPhotosById.get(photo.id)?.createdAt) || now,
  }))

  await db.transaction('rw', db.visits, db.photos, async () => {
    await db.visits.put(updatedVisit)
    if (deletedPhotoIds.length > 0) {
      await db.photos.bulkDelete(deletedPhotoIds)
    }
    if (updatedPhotos.length > 0) {
      await db.photos.bulkPut(updatedPhotos)
    }
  })

  return updatedVisit
}

export async function deleteVisit(id: string) {
  await db.transaction('rw', db.visits, db.photos, async () => {
    await db.photos.where('visitId').equals(id).delete()
    await db.visits.delete(id)
  })
}

export async function getRecentVisits(limit = 3): Promise<VisitSummary[]> {
  const visits = await db.visits
    .orderBy('createdAt')
    .reverse()
    .limit(limit)
    .toArray()
  const counts = await Promise.all(
    visits.map((visit) => db.photos.where('visitId').equals(visit.id).count()),
  )

  return visits.map((visit, index) => ({
    ...visit,
    photoCount: counts[index],
  }))
}

export async function getAllVisits(): Promise<VisitSummary[]> {
  const visits = await db.visits.orderBy('createdAt').reverse().toArray()
  const counts = await Promise.all(
    visits.map((visit) => db.photos.where('visitId').equals(visit.id).count()),
  )

  return visits.map((visit, index) => ({
    ...visit,
    photoCount: counts[index],
  }))
}

export function getVisit(id: string) {
  return db.visits.get(id)
}

export function getVisitPhotos(visitId: string) {
  return db.photos.where('visitId').equals(visitId).sortBy('createdAt')
}
