import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '../auth/supabase'
import type { BackupCloud, CloudDocument, RemotePhoto, Revision } from './types'
import type { Visit } from '../types/visit'

type VisitRow = { id: string; activity_name: string; activity_category: Visit['activityCategory'] | null; primary_location: Visit['primaryLocation'];
  notes: string; visit_date: string; created_at: string; updated_at: string; sync_version: number; deleted_at: string | null; sync_request: string | null }
type PhotoRow = { id: string; visit_id: string; storage_path: string; note: string; additional_note: string; created_at: string }
const revision = (row: Pick<VisitRow, 'id' | 'sync_version' | 'deleted_at' | 'sync_request'>): Revision => ({ id: row.id,
  version: row.sync_version, deletedAt: row.deleted_at, requestId: row.sync_request })
export function makeBackupCloud(client: SupabaseClient | undefined = supabase, origin = import.meta.env.VITE_SUPABASE_URL): BackupCloud {
  if (!client || !origin) throw new Error('Backup membutuhkan koneksi Supabase dan akun tim.')
  const cloud = client
  return {
    origin: new URL(origin).origin,
    async authorize() {
      if (!navigator.onLine) throw new Error('Hubungkan internet untuk membuat atau memulihkan backup.')
      const user = await cloud.auth.getUser()
      if (user.error || !user.data.user) throw new Error('Masuk kembali untuk mengakses dokumentasi bersama.')
      const member = await cloud.from('team_members').select('member_code').single()
      if (member.error || !member.data) throw new Error('Akun tidak diizinkan mengakses dokumentasi bersama.')
    },
    async listActive() {
      const rows: Revision[] = []
      for (let offset = 0; ; offset += 100) {
        const result = await cloud.from('visits').select('id,sync_version,deleted_at,sync_request').is('deleted_at', null).order('id').range(offset, offset + 99)
        if (result.error) throw result.error
        rows.push(...result.data.map(revision))
        if (result.data.length < 100) break
      }
      return rows
    },
    async revision(id) {
      const result = await cloud.from('visits').select('id,sync_version,deleted_at,sync_request').eq('id', id).maybeSingle()
      if (result.error) throw result.error
      return result.data ? revision(result.data) : undefined
    },
    async document(id): Promise<CloudDocument | undefined> {
      const result = await cloud.from('visits').select('*').eq('id', id).maybeSingle()
      if (result.error) throw result.error
      if (!result.data) return
      const row = result.data as VisitRow
      const photos: RemotePhoto[] = []
      if (!row.deleted_at) {
        for (let offset = 0; ; offset += 100) {
          const files = await cloud.from('photos').select('*').eq('visit_id', id).order('id').range(offset, offset + 99)
          if (files.error) throw files.error
          photos.push(...(files.data as PhotoRow[]).map((photo) => ({ id: photo.id, visitId: id, path: photo.storage_path,
            note: photo.note, additionalNote: photo.additional_note, createdAt: photo.created_at })))
          if (files.data.length < 100) break
        }
      }
      return { revision: revision(row), photos, visit: { id, activityName: row.activity_name, activityCategory: row.activity_category ?? undefined,
        primaryLocation: row.primary_location, notes: row.notes, visitDate: row.visit_date, createdAt: row.created_at, updatedAt: row.updated_at } }
    },
    async download(path) {
      const result = await cloud.storage.from('field-photos').download(path)
      if (result.error) {
        if (['400', '404'].includes(String(result.error.statusCode)) && /not found/i.test(result.error.message)) {
          const missing = new Error('Foto cloud tidak tersedia.'); missing.name = 'CloudPhotoMissing'; throw missing
        }
        throw result.error
      }
      return result.data
    },
    async upload(path, blob) {
      const result = await cloud.storage.from('field-photos').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '0', upsert: false })
      if (result.error) {
        if (String(result.error.statusCode) === '409' || result.error.message.includes('already exists')) return 'exists'
        throw result.error
      }
      return 'created'
    },
    async commit(request) {
      const visit = request.visit
      const result = await cloud.rpc('sync_field_visit', { visit_id: request.id, expected_version: request.expectedVersion, request_id: request.requestId,
        remove_visit: false, visit_payload: { activity_name: visit.activityName, activity_category: visit.activityCategory ?? null,
          primary_location: visit.primaryLocation, notes: visit.notes, visit_date: visit.visitDate, created_at: visit.createdAt },
        photo_payload: request.photos.map((photo) => ({ id: photo.id, visit_id: request.id, storage_path: photo.path, note: photo.note,
          additional_note: photo.additionalNote, created_at: photo.createdAt })) })
      if (result.error) throw result.error
    },
  }
}
