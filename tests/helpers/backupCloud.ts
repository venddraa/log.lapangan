import type { BackupCloud, CloudDocument, RestoreRequest, Revision } from '../../src/backup/types'

export const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333']
export const photoIds = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']
export class MemoryBackupCloud implements BackupCloud {
  origin = 'https://backup-test.supabase.co'
  docs = new Map<string, CloudDocument>()
  files = new Map<string, Blob>()
  commits = 0
  uploads = 0
  listCalls = 0
  authorized = true
  loseReply = false
  beforeCommit?: (request: RestoreRequest) => void
  onUpload?: () => void
  onList?: () => void
  async authorize() { if (!this.authorized) throw new Error('Tidak diizinkan') }
  async listActive(): Promise<Revision[]> {
    this.listCalls++; this.onList?.()
    return [...this.docs.values()].filter((doc) => !doc.revision.deletedAt).map((doc) => structuredClone(doc.revision)).sort((a, b) => a.id.localeCompare(b.id))
  }
  async revision(id: string) { return structuredClone(this.docs.get(id)?.revision) }
  async document(id: string) { return structuredClone(this.docs.get(id)) }
  async download(path: string) { const file = this.files.get(path); if (!file) throw new Error('Foto hilang'); return file }
  async upload(path: string, blob: Blob): Promise<'created' | 'exists'> {
    this.onUpload?.()
    if (this.files.has(path)) return 'exists'
    this.uploads++; this.files.set(path, blob); return 'created'
  }
  async commit(request: RestoreRequest) {
    this.beforeCommit?.(request)
    const previous = this.docs.get(request.id)
    if (previous?.revision.requestId === request.requestId) return
    if ((previous?.revision.version ?? 0) !== request.expectedVersion) throw new Error('SYNC_CONFLICT')
    this.commits++
    this.docs.set(request.id, { visit: { ...structuredClone(request.visit), updatedAt: new Date().toISOString() }, photos: structuredClone(request.photos),
      revision: { id: request.id, version: request.expectedVersion + 1, requestId: request.requestId, deletedAt: null } })
    if (this.loseReply) { this.loseReply = false; throw new Error('Respons hilang setelah commit') }
  }
}
export function fixtureCloud() {
  const cloud = new MemoryBackupCloud()
  ids.forEach((id, index) => {
    const date = '2026-10-15T03:00:00.000Z'
    const photos = index === 0 ? photoIds.map((photoId, photoIndex) => ({ id: photoId, visitId: id, path: `${id}/${photoId}.jpg`,
      note: `Catatan ${photoIndex}`, additionalNote: photoIndex ? 'Catatan lama tetap ada' : '', createdAt: date })) : []
    for (const photo of photos) cloud.files.set(photo.path, new Blob([new Uint8Array([255, 216, 1, 2, 3, 4, 255, 217])], { type: 'image/jpeg' }))
    cloud.docs.set(id, { visit: { id, activityName: `Survey ${index}`, notes: 'Ringkasan lama', visitDate: date, createdAt: date, updatedAt: date,
      primaryLocation: { type: 'toll_gate', typeLabel: 'Gerbang Tol', tollRoadId: 'jagorawi', tollRoadName: 'Jagorawi', name: 'Ciawi 1' } },
      photos, revision: { id, version: 1, deletedAt: null, requestId: null } })
  })
  return cloud
}
