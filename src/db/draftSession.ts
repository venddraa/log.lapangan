import { writeDraft } from './drafts'
import type { DraftCommit, DraftFields, DraftRecord } from '../types/draft'

type Status = { kind: 'idle' | 'saving' | 'saved' | 'error'; message: string }
function signature(fields: DraftFields) {
  return JSON.stringify({ ...fields, photos: fields.photos.map(({ id, note }) => ({ id, note })) })
}

// Serial writes coalesce typing; photo blobs are stored separately and only once.
export class DraftSession {
  private meta: Omit<DraftRecord, 'fields' | 'updatedAt'>
  private latest?: DraftFields
  private pending?: DraftFields
  private lastSignature?: string
  private running?: Promise<void>
  private failure?: Error
  private stopped = false
  private listeners = new Set<() => void>()
  private status: Status

  constructor(meta: Omit<DraftRecord, 'fields' | 'updatedAt'>) {
    this.meta = { ...meta }
    this.status = { kind: meta.revision ? 'saved' : 'idle', message: meta.revision
      ? 'Draft dipulihkan · tersimpan di perangkat ini' : 'Isian dan foto akan disimpan otomatis di perangkat ini.' }
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  getStatus = () => this.status
  private setStatus(status: Status) { this.status = status; this.listeners.forEach((listener) => listener()) }
  observe(fields: DraftFields) {
    if (this.stopped) return
    this.latest = fields
    const next = signature(fields)
    if (this.lastSignature === undefined) { this.lastSignature = next; return }
    if (next === this.lastSignature) return
    this.lastSignature = next
    this.pending = fields
    void this.pump()
  }
  private pump(): Promise<void> {
    if (this.running) return this.running
    if (this.failure || this.stopped) return Promise.resolve()
    this.running = (async () => {
      while (this.pending && !this.stopped) {
        const fields = this.pending
        this.pending = undefined
        this.setStatus({ kind: 'saving', message: 'Menyimpan draft…' })
        try {
          this.meta.revision = await writeDraft(this.meta, fields)
          this.setStatus({ kind: 'saved', message: 'Draft tersimpan di perangkat ini · belum menjadi kunjungan' })
        } catch (cause) {
          this.pending ??= fields
          this.failure = cause instanceof Error ? cause : new Error('Penyimpanan perangkat tidak tersedia.')
          this.setStatus({ kind: 'error', message: `Draft belum tersimpan. ${this.failure.name === 'QuotaExceededError' ? 'Penyimpanan perangkat penuh.' : this.failure.message}` })
          break
        }
      }
    })().finally(() => { this.running = undefined })
    return this.running
  }
  async retry() { this.failure = undefined; await this.pump() }
  async flush(): Promise<DraftCommit> {
    if (this.stopped) throw new Error('Draft sudah ditutup. Buka ulang form.')
    if (!this.meta.revision && !this.pending) this.pending = this.latest
    await this.pump()
    if (this.failure) throw this.failure
    if (!this.meta.revision) throw new Error('Draft belum siap. Coba lagi.')
    return { id: this.meta.id, revision: this.meta.revision, newVisitId: this.meta.newVisitId, baseUpdatedAt: this.meta.baseUpdatedAt }
  }
  async closeForDiscard() { await this.running; this.stop(); return this.meta.revision }
  stop() { this.stopped = true; this.pending = undefined }
}
