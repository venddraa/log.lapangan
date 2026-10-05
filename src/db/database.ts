import Dexie, { type Table } from 'dexie'
import { isSupabaseConfigured } from '../auth/supabase'
import type {
  CreateVisitInput,
  Photo,
  Visit,
  VisitSummary,
} from '../types/visit'

export type SyncJob = {
  id: string
  token: string
  operation: 'save' | 'delete'
}

export type SyncRecord = {
  id: string
  version: number
}

export type SyncCleanup = { path: string; visitId: string }

class FieldLogDatabase extends Dexie {
  visits!: Table<Visit, string>
  photos!: Table<Photo, string>
  syncJobs!: Table<SyncJob, string>
  syncRecords!: Table<SyncRecord, string>
  syncCleanup!: Table<SyncCleanup, string>

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
    this.version(3).stores({
      visits: 'id, createdAt, visitDate, activityCategory, primaryLocation.type',
      photos: 'id, visitId, createdAt',
      syncJobs: 'id',
      syncRecords: 'id',
    })
    this.version(4).stores({
      visits: 'id, createdAt, visitDate, activityCategory, primaryLocation.type',
      photos: 'id, visitId, createdAt',
      syncJobs: 'id', syncRecords: 'id', syncCleanup: 'path, visitId',
    })
  }
}

export const db = new FieldLogDatabase()

async function queueSync(id: string, operation: SyncJob['operation']) {
  if (!isSupabaseConfigured) return
  await db.syncJobs.put({ id, operation, token: crypto.randomUUID() })
}

function notifyChange() {
  window.dispatchEvent(new Event('field-log-change'))
}

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

  await db.transaction('rw', db.visits, db.photos, db.syncJobs, async () => {
    await db.visits.add(visit)
    if (photoRecords.length > 0) {
      await db.photos.bulkAdd(photoRecords)
    }
    await queueSync(visit.id, 'save')
  })
  notifyChange()

  return visit
}

export async function updateVisit(id: string, input: CreateVisitInput, expectedUpdatedAt?: string) {
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

  await db.transaction('rw', db.visits, db.photos, db.syncJobs, async () => {
    const currentVisit = await db.visits.get(id)
    if (!currentVisit || (expectedUpdatedAt && currentVisit.updatedAt !== expectedUpdatedAt)) {
      throw new Error('Kunjungan sudah berubah di perangkat lain. Salin isianmu, lalu buka ulang form edit.')
    }
    await db.visits.put(updatedVisit)
    if (deletedPhotoIds.length > 0) {
      await db.photos.bulkDelete(deletedPhotoIds)
    }
    if (updatedPhotos.length > 0) {
      await db.photos.bulkPut(updatedPhotos)
    }
    await queueSync(id, 'save')
  })
  notifyChange()

  return updatedVisit
}

export async function deleteVisit(id: string) {
  await db.transaction('rw', db.visits, db.photos, db.syncJobs, async () => {
    await queueSync(id, 'delete')
    await db.photos.where('visitId').equals(id).delete()
    await db.visits.delete(id)
  })
  notifyChange()
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
