import { supabase } from '../auth/supabase'
import type { Photo, Visit } from '../types/visit'
import { db, type SyncJob } from './database'

type CloudVisit = {
  id: string
  activity_name: string
  activity_category: Visit['activityCategory']
  primary_location: Visit['primaryLocation']
  notes: string
  visit_date: string
  created_at: string
  updated_at: string
  sync_version: number
  deleted_at: string | null
}

type CloudPhoto = {
  id: string
  visit_id: string
  storage_path: string
  note: string
  additional_note: string
  created_at: string
}

export type SyncStatus = {
  busy: boolean
  pending: number
  message: string
  error: boolean
  conflictId?: string
  conflictOperation?: SyncJob['operation']
}

let running: Promise<void> | undefined
let status: SyncStatus = { busy: false, pending: 0, message: '', error: false }
const listeners = new Set<() => void>()

export function getSyncStatus() { return status }
export function subscribeSync(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

async function setStatus(update: Partial<SyncStatus>) {
  status = { ...status, ...update, pending: await db.syncJobs.count() }
  listeners.forEach((listener) => listener())
}

function requireCloud() {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi.')
  return supabase
}

async function pushJob(job: SyncJob) {
  const cloud = requireCloud()
  const snapshot = await db.transaction('r', db.visits, db.photos, db.syncRecords, async () => ({
    visit: await db.visits.get(job.id),
    photos: await db.photos.where('visitId').equals(job.id).toArray(),
    expectedVersion: (await db.syncRecords.get(job.id))?.version ?? 0,
  }))
  if (job.operation === 'save' && !snapshot.visit) return

  const oldPhotos = await cloud.from('photos').select('storage_path').eq('visit_id', job.id)
  if (oldPhotos.error) throw oldPhotos.error

  const photoPayload: CloudPhoto[] = []
  for (const photo of snapshot.photos) {
    // ID foto tetap ketika catatan diedit. Blob foto bersifat immutable.
    const path = `${job.id}/${photo.id}.jpg`
    const existing = oldPhotos.data.some((item) => item.storage_path === path)
    if (!existing) {
      const { error } = await cloud.storage.from('field-photos').upload(path, photo.blob, {
        contentType: 'image/jpeg', cacheControl: '0', upsert: false,
      })
      // Upload dapat berhasil sebelum koneksi terputus. Retry menerima objek yang sama.
      if (error && String(error.statusCode) !== '409'
        && error.message !== 'The resource already exists'
        && !error.message.includes('already exists')) throw error
    }
    photoPayload.push({
      id: photo.id, visit_id: job.id, storage_path: path,
      note: photo.note, additional_note: photo.additionalNote ?? '',
      created_at: photo.createdAt,
    })
  }

  const visit = snapshot.visit
  const activePaths = new Set(photoPayload.map((photo) => photo.storage_path))
  const removedPaths = oldPhotos.data
    .map((photo) => photo.storage_path)
    .filter((path) => job.operation === 'delete' || !activePaths.has(path))
  // Catat sebelum RPC agar retry tetap mengetahui file lama jika respons server hilang.
  await db.syncCleanup.bulkPut(removedPaths.map((path) => ({ path, visitId: job.id })))
  const { data: version, error } = await cloud.rpc('sync_field_visit', {
    visit_id: job.id,
    request_id: job.token,
    expected_version: snapshot.expectedVersion,
    remove_visit: job.operation === 'delete',
    visit_payload: visit ? {
      activity_name: visit.activityName, activity_category: visit.activityCategory ?? null,
      primary_location: visit.primaryLocation, notes: visit.notes,
      visit_date: visit.visitDate, created_at: visit.createdAt,
    } : {},
    photo_payload: photoPayload,
  })
  if (error) {
    if (error.message.includes('SYNC_CONFLICT')) {
      await setStatus({ conflictId: job.id, conflictOperation: job.operation })
      throw new Error('Ada perubahan dari perangkat lain. Salin catatan lokal sebelum menyelesaikan konflik.')
    }
    throw error
  }

  await db.transaction('rw', db.syncJobs, db.syncRecords, async () => {
    await db.syncRecords.put({ id: job.id, version: Number(version) })
    if ((await db.syncJobs.get(job.id))?.token === job.token) {
      await db.syncJobs.delete(job.id)
    }
  })

}

async function cleanOldPhotos() {
  const cloud = requireCloud()
  for (const item of await db.syncCleanup.toArray()) {
    if (await db.syncJobs.get(item.visitId)) continue
    const references = await cloud.from('photos').select('id').eq('storage_path', item.path).limit(1)
    if (references.error) throw references.error
    if (!references.data.length) {
      const result = await cloud.storage.from('field-photos').remove([item.path])
      if (result.error) throw new Error('Data tersinkron, tetapi pembersihan file lama belum berhasil. Coba lagi.')
    }
    await db.syncCleanup.delete(item.path)
  }
}

async function pullVisits() {
  const cloud = requireCloud()
  let offset = 0
  while (true) {
    const { data, error } = await cloud.from('visits').select('*')
      .order('id').range(offset, offset + 99)
    if (error) throw error
    const visits = data as CloudVisit[]
    for (const remote of visits) {
      if (await db.syncJobs.get(remote.id)) continue
      const known = await db.syncRecords.get(remote.id)
      if (known?.version === remote.sync_version) continue

      const photos: Photo[] = []
      if (!remote.deleted_at) {
        const result = await cloud.from('photos').select('*').eq('visit_id', remote.id)
        if (result.error) throw result.error
        for (const photo of result.data as CloudPhoto[]) {
          const download = await cloud.storage.from('field-photos').download(photo.storage_path)
          if (download.error) throw download.error
          photos.push({
            id: photo.id, visitId: remote.id, blob: download.data,
            note: photo.note, additionalNote: photo.additional_note,
            createdAt: photo.created_at,
          })
        }
      }

      const latest = await cloud.from('visits').select('sync_version').eq('id', remote.id).single()
      if (latest.error) throw latest.error
      if (latest.data.sync_version !== remote.sync_version) continue

      await db.transaction('rw', db.visits, db.photos, db.syncRecords, db.syncJobs, async () => {
        // Pengguna mungkin sedang mengedit saat unduhan berlangsung.
        if (await db.syncJobs.get(remote.id)) return
        await db.photos.where('visitId').equals(remote.id).delete()
        if (remote.deleted_at) {
          await db.visits.delete(remote.id)
        } else {
          await db.visits.put({
            id: remote.id, activityName: remote.activity_name,
            activityCategory: remote.activity_category ?? undefined,
            primaryLocation: remote.primary_location, notes: remote.notes,
            visitDate: remote.visit_date, createdAt: remote.created_at, updatedAt: remote.updated_at,
          })
          await db.photos.bulkPut(photos)
        }
        await db.syncRecords.put({ id: remote.id, version: remote.sync_version })
      })
    }
    if (visits.length < 100) break
    offset += 100
  }
  window.dispatchEvent(new Event('field-log-cloud-change'))
}

export async function clearSyncedCache(owner?: string) {
  const unfinished = owner ? await db.drafts.where('owner').equals(owner).count() : await db.drafts.count()
  if (unfinished) throw new Error('Masih ada draft di perangkat ini. Lanjutkan dan simpan, atau buang draft dari beranda sebelum keluar.')
  await syncNow()
  if (status.error || await db.syncJobs.count() || await db.syncCleanup.count()) {
    throw new Error('Sinkronkan catatan yang belum terkirim sebelum keluar.')
  }
  await db.transaction('rw', db.visits, db.photos, db.syncJobs, db.syncRecords, async () => {
    await db.visits.clear()
    await db.photos.clear()
    await db.syncRecords.clear()
    await db.syncJobs.clear()
  })
}

async function sync() {
  if (!supabase) return
  if (!navigator.onLine) {
    await setStatus({ busy: false, message: 'Offline · tersimpan di perangkat', error: false })
    return
  }
  await setStatus({ busy: true, message: 'Menyinkronkan…', error: false })
  try {
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) throw new Error('Sesi login perlu diperbarui. Masuk kembali saat online.')
    const membership = await supabase.from('team_members').select('member_code').single()
    if (membership.error || !membership.data) throw new Error('Akun tidak diizinkan mengakses divisi.')

    // Impor data lokal lama sekali; data cloud yang pernah ditarik memiliki syncRecord.
    await db.transaction('rw', db.visits, db.syncRecords, db.syncJobs, async () => {
      for (const visit of await db.visits.toArray()) {
        if (!(await db.syncRecords.get(visit.id)) && !(await db.syncJobs.get(visit.id))) {
          await db.syncJobs.put({ id: visit.id, operation: 'save', token: crypto.randomUUID() })
        }
      }
    })
    for (const job of await db.syncJobs.toArray()) await pushJob(job)
    await cleanOldPhotos()
    await pullVisits()
    await setStatus({ busy: false, message: 'Sudah tersinkron', error: false, conflictId: undefined, conflictOperation: undefined })
  } catch (error) {
    const message = error instanceof Error ? error.message
      : typeof error === 'object' && error && 'message' in error
        ? String(error.message) : 'Sinkronisasi belum berhasil. Coba lagi.'
    await setStatus({ busy: false, message, error: true })
  }
}

export async function resolveSyncConflict(keepLocalCopy: boolean) {
  if (running) await running
  const id = status.conflictId
  if (!id) return
  await db.transaction('rw', db.visits, db.photos, db.syncJobs, db.syncRecords, async () => {
    const visit = await db.visits.get(id)
    if (keepLocalCopy && visit) {
      const copiedId = crypto.randomUUID()
      const now = new Date().toISOString()
      await db.visits.add({ ...visit, id: copiedId, activityName: `${visit.activityName} (salinan lokal)`, updatedAt: now })
      const photos = await db.photos.where('visitId').equals(id).toArray()
      await db.photos.bulkAdd(photos.map((photo) => ({ ...photo, id: crypto.randomUUID(), visitId: copiedId })))
      await db.syncJobs.add({ id: copiedId, operation: 'save', token: crypto.randomUUID() })
    }
    await db.syncJobs.delete(id)
    await db.syncRecords.delete(id)
    await db.visits.delete(id)
    await db.photos.where('visitId').equals(id).delete()
  })
  await setStatus({ conflictId: undefined, conflictOperation: undefined, error: false })
  await syncNow()
}

export function syncNow() {
  if (!running) running = sync().finally(() => { running = undefined })
  return running
}
