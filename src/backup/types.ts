import type { Visit } from '../types/visit'

export type Revision = { id: string; version: number; deletedAt: string | null; requestId: string | null }
export type RemotePhoto = { id: string; visitId: string; path: string; note: string; additionalNote: string; createdAt: string }
export type CloudDocument = { visit: Visit; revision: Revision; photos: RemotePhoto[] }
export type RestoreRequest = { id: string; expectedVersion: number; requestId: string; visit: Visit; photos: RemotePhoto[] }
export interface BackupCloud {
  origin: string
  authorize(): Promise<void>
  listActive(): Promise<Revision[]>
  revision(id: string): Promise<Revision | undefined>
  document(id: string): Promise<CloudDocument | undefined>
  download(path: string): Promise<Blob>
  upload(path: string, blob: Blob): Promise<'created' | 'exists'>
  commit(request: RestoreRequest): Promise<void>
}
export type BackupPhoto = Omit<RemotePhoto, 'path'> & { file: string; bytes: number; sha256: string }
export type Manifest = { format: 'log-lapangan-backup'; version: 1; id: string; createdAt: string; source: string; visits: Visit[]; photos: BackupPhoto[] }
export type Archive = { manifest: Manifest; files: Map<string, Blob> }
export type Progress = { message: string; completed: number; total: number }
export type ProgressOptions = { signal?: AbortSignal; onProgress?: (progress: Progress) => void }
export type RestoreRow = {
  id: string; visit: Visit; kind: 'same' | 'missing' | 'deleted' | 'changed' | 'copy-exists' | 'blocked'
  targetId: string; expectedVersion: number; digest: string; requestId: string
}
export type RestoreResult = { id: string; status: 'restored' | 'already' | 'conflict' | 'failed'; message: string }
