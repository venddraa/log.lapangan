import { Zip, ZipPassThrough, strToU8, strFromU8, unzipSync } from 'fflate'
import type { Manifest, Archive, BackupPhoto, ProgressOptions } from './types'
import type { Visit, VisitLocation, LocationType, ActivityCategory } from '../types/visit'

export const MAX_BACKUP_BYTES = 200 * 1024 * 1024
export function checkCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Proses dibatalkan.', 'AbortError')
}
export const pause = () => new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0))
export async function sha256(value: Uint8Array | string) {
  const bytes = typeof value === 'string' ? strToU8(value) : new Uint8Array(value)
  const hash = await crypto.subtle.digest('SHA-256', bytes.buffer as ArrayBuffer)
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
export async function stableId(value: string) {
  const hash = (await sha256(value)).slice(0, 32).split('')
  hash[12] = '8'; hash[16] = ((parseInt(hash[16], 16) & 3) | 8).toString(16)
  const hex = hash.join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
function invalid(): never { throw new Error('Format backup tidak valid atau isinya tidak lengkap.') }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid()
  return value as Record<string, unknown>
}
function text(value: unknown, maximum = 200000): string { if (typeof value !== 'string' || value.length > maximum) return invalid(); return value }
function id(value: unknown) { const valueId = text(value, 36); if (!uuid.test(valueId)) return invalid(); return valueId }
function date(value: unknown) { const input = text(value, 40); if (!/^\d{4}-\d{2}-\d{2}T/.test(input) || !Number.isFinite(Date.parse(input))) return invalid(); return new Date(input).toISOString() }
function integer(value: unknown, maximum: number) { if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > maximum) return invalid(); return Number(value) }
function location(value: unknown): VisitLocation {
  const raw = object(value)
  if (!['toll_gate', 'main_road', 'gantry', 'ro_office', 'area_office', 'other'].includes(String(raw.type))) return invalid()
  const result: VisitLocation = { type: raw.type as LocationType, typeLabel: text(raw.typeLabel, 200), name: text(raw.name, 20000) }
  for (const key of ['tollRoadId', 'tollRoadName', 'detail', 'direction', 'station'] as const) {
    if (raw[key] !== undefined) result[key] = text(raw[key], 20000)
  }
  return result
}
export function validateManifest(value: unknown): Manifest {
  const raw = object(value)
  if (raw.format !== 'log-lapangan-backup' || raw.version !== 1 || !Array.isArray(raw.visits) || !Array.isArray(raw.photos)) return invalid()
  if (raw.visits.length > 20000 || raw.photos.length > 20000) return invalid()
  const source = text(raw.source, 2000)
  try { if (new URL(source).origin !== source || !/^https?:/.test(source)) return invalid() } catch { return invalid() }
  const visits: Visit[] = raw.visits.map((value) => {
    const row = object(value)
    const category = row.activityCategory
    if (category !== undefined && !['Survey', 'Observasi', 'Inspeksi', 'Maintenance', 'Meeting', 'Dokumentasi', 'Lainnya'].includes(String(category))) return invalid()
    return { id: id(row.id), activityName: text(row.activityName), ...(category ? { activityCategory: category as ActivityCategory } : {}),
      primaryLocation: location(row.primaryLocation), notes: text(row.notes), visitDate: date(row.visitDate), createdAt: date(row.createdAt), updatedAt: date(row.updatedAt) }
  })
  const visitIds = new Set(visits.map((visit) => visit.id))
  if (visitIds.size !== visits.length) return invalid()
  const photos: BackupPhoto[] = raw.photos.map((value) => {
    const row = object(value), photoId = id(row.id), visitId = id(row.visitId)
    if (!visitIds.has(visitId) || row.file !== `photos/${photoId}.jpg` || !/^[a-f0-9]{64}$/.test(String(row.sha256))) return invalid()
    return { id: photoId, visitId, file: String(row.file), bytes: integer(row.bytes, 10 * 1024 * 1024), sha256: String(row.sha256),
      note: text(row.note), additionalNote: text(row.additionalNote), createdAt: date(row.createdAt) }
  })
  if (new Set(photos.map((photo) => photo.id)).size !== photos.length) return invalid()
  return { format: 'log-lapangan-backup', version: 1, id: id(raw.id), createdAt: date(raw.createdAt), source, visits, photos }
}
export function validJpeg(bytes: Uint8Array) {
  return bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes.at(-2) === 255 && bytes.at(-1) === 217
}

export class BackupWriter {
  private chunks: ArrayBuffer[] = []
  private size = 0
  private error?: Error
  private done = false
  private zip = new Zip((error, data, final) => {
    if (error) { this.error = error; return }
    this.size += data.byteLength
    if (this.size > MAX_BACKUP_BYTES) { this.error = new Error('Backup melebihi batas 200 MB untuk pemrosesan di browser.'); return }
    this.chunks.push(new Uint8Array(data).buffer)
    this.done = final
  })
  add(name: string, bytes: Uint8Array) {
    const file = new ZipPassThrough(name)
    this.zip.add(file); file.push(bytes, true)
    if (this.error) throw this.error
  }
  finish() {
    this.zip.end()
    if (this.error) throw this.error
    if (!this.done) throw new Error('Backup belum selesai dibuat.')
    return new Blob(this.chunks, { type: 'application/zip' })
  }
  close() { this.zip.terminate(); this.chunks.length = 0 }
}

export async function readBackup(file: Blob, { signal, onProgress }: ProgressOptions = {}): Promise<Archive> {
  checkCancelled(signal)
  if (file.size > MAX_BACKUP_BYTES) throw new Error('File backup melebihi batas 200 MB.')
  const data = new Uint8Array(await file.arrayBuffer())
  let total = 0
  const names = new Set<string>()
  let entries: ReturnType<typeof unzipSync>
  try {
    entries = unzipSync(data, { filter: (entry) => {
      if (names.has(entry.name) || names.size >= 20002 || entry.compression !== 0 || entry.size !== entry.originalSize) return invalid()
      names.add(entry.name); total += entry.originalSize
      if (total > MAX_BACKUP_BYTES || (!['manifest.json', 'manifest.sha256'].includes(entry.name) && !/^photos\/[a-f0-9-]{36}\.jpg$/.test(entry.name))) return invalid()
      if ((entry.name === 'manifest.json' && entry.originalSize > 4 * 1024 * 1024) || (entry.name === 'manifest.sha256' && entry.originalSize !== 64)) return invalid()
      return true
    } })
  } catch { throw new Error('File bukan backup Log Lapangan yang valid atau arsipnya rusak.') }
  const json = entries['manifest.json'], checksum = entries['manifest.sha256']
  if (!json || !checksum || await sha256(json) !== strFromU8(checksum)) throw new Error('Pemeriksaan backup gagal. Isi file berubah atau tidak lengkap.')
  let manifest: Manifest
  try { manifest = validateManifest(JSON.parse(strFromU8(json))) } catch { return invalid() }
  if (names.size !== manifest.photos.length + 2) return invalid()
  const files = new Map<string, Blob>()
  for (const [index, photo] of manifest.photos.entries()) {
    checkCancelled(signal)
    const bytes = entries[photo.file]
    if (!bytes || bytes.length !== photo.bytes || !validJpeg(bytes) || await sha256(bytes) !== photo.sha256) throw new Error('Ada foto backup yang hilang atau rusak. Pemulihan dibatalkan.')
    files.set(photo.id, new Blob([new Uint8Array(bytes).buffer], { type: 'image/jpeg' }))
    onProgress?.({ message: 'Memeriksa kelengkapan foto backup…', completed: index + 1, total: manifest.photos.length })
    await pause()
  }
  checkCancelled(signal)
  return { manifest, files }
}
