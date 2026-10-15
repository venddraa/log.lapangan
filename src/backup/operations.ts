import { jakartaDate } from '../utils/visitFilters'
import { strToU8 } from 'fflate'
import { BackupWriter, checkCancelled, pause, sha256, stableId, validJpeg, validateManifest } from './archive'
import type { Archive, BackupCloud, BackupPhoto, CloudDocument, Manifest, ProgressOptions, RestoreResult, RestoreRow } from './types'
import type { Visit } from '../types/visit'

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => `${JSON.stringify(key)}:${canonical(value)}`).join(',')}}`
  return JSON.stringify(value) ?? 'null'
}
export async function documentDigest(visit: Visit, photos: Pick<BackupPhoto, 'note' | 'additionalNote' | 'createdAt' | 'sha256'>[]) {
  const content = { activityName: visit.activityName, activityCategory: visit.activityCategory ?? '', primaryLocation: visit.primaryLocation,
    notes: visit.notes, visitDate: new Date(visit.visitDate).toISOString(), createdAt: new Date(visit.createdAt).toISOString() }
  return sha256(canonical({ visit: content, photos: photos.map((photo) => canonical({ note: photo.note, additionalNote: photo.additionalNote,
    createdAt: new Date(photo.createdAt).toISOString(), sha256: photo.sha256 })).sort() }))
}
async function remoteDigest(cloud: BackupCloud, document: CloudDocument, signal?: AbortSignal) {
  const photos = []
  for (const photo of document.photos) {
    checkCancelled(signal)
    let bytes: Uint8Array
    try { bytes = new Uint8Array(await (await cloud.download(photo.path)).arrayBuffer()) }
    catch (cause) { if (cause instanceof Error && cause.name === 'CloudPhotoMissing') return undefined; throw cause }
    photos.push({ ...photo, sha256: await sha256(bytes) })
  }
  return documentDigest(document.visit, photos)
}
const changedDuringBackup = () => new Error('Dokumentasi berubah saat backup dibuat. Tidak ada file sebagian yang diunduh. Coba lagi setelah aktivitas tim selesai.')

export async function createCloudBackup(cloud: BackupCloud, { signal, onProgress }: ProgressOptions = {}) {
  await cloud.authorize(); checkCancelled(signal)
  const initial = await cloud.listActive()
  const manifest: Manifest = { format: 'log-lapangan-backup', version: 1, id: crypto.randomUUID(), createdAt: new Date().toISOString(), source: cloud.origin, visits: [], photos: [] }
  const writer = new BackupWriter()
  try {
    for (const [index, reference] of initial.entries()) {
      checkCancelled(signal)
      onProgress?.({ message: `Mengambil kunjungan ${index + 1} dari ${initial.length}…`, completed: index, total: initial.length })
      const document = await cloud.document(reference.id)
      if (!document || document.revision.deletedAt || document.revision.version !== reference.version) throw changedDuringBackup()
      manifest.visits.push(document.visit)
      for (const [photoIndex, photo] of document.photos.entries()) {
        checkCancelled(signal)
        onProgress?.({ message: `Mengunduh foto ${photoIndex + 1}/${document.photos.length} pada kunjungan ${index + 1}…`, completed: index, total: initial.length })
        const bytes = new Uint8Array(await (await cloud.download(photo.path)).arrayBuffer())
        checkCancelled(signal)
        if (!validJpeg(bytes)) throw new Error('Ada foto cloud yang belum bisa dibaca. Backup belum dibuat; periksa dokumentasi lalu coba lagi.')
        const file = `photos/${photo.id}.jpg`
        manifest.photos.push({ id: photo.id, visitId: photo.visitId, createdAt: photo.createdAt, note: photo.note, additionalNote: photo.additionalNote,
          file, bytes: bytes.length, sha256: await sha256(bytes) })
        writer.add(file, bytes)
      }
      onProgress?.({ message: 'Mengambil dokumentasi bersama…', completed: index + 1, total: initial.length })
      await pause()
    }
    checkCancelled(signal)
    onProgress?.({ message: 'Memeriksa konsistensi data cloud…', completed: initial.length, total: initial.length })
    const latest = await cloud.listActive()
    const versions = (rows: typeof initial) => rows.map((row) => `${row.id}:${row.version}`).sort().join('|')
    if (versions(initial) !== versions(latest)) throw changedDuringBackup()
    const normalized = validateManifest(manifest)
    const json = strToU8(JSON.stringify(normalized, null, 2))
    if (json.length > 4 * 1024 * 1024) throw new Error('Data kunjungan terlalu besar untuk format backup ini.')
    writer.add('manifest.json', json); writer.add('manifest.sha256', strToU8(await sha256(json)))
    checkCancelled(signal)
    return { blob: writer.finish(), manifest: normalized, filename: `backup-log-lapangan_${jakartaDate(normalized.createdAt)}_${normalized.id.slice(0, 8)}.zip` }
  } finally { writer.close() }
}

export async function previewRestore(cloud: BackupCloud, archive: Archive, { signal, onProgress }: ProgressOptions = {}) {
  await cloud.authorize()
  const rows: RestoreRow[] = []
  for (const [index, visit] of archive.manifest.visits.entries()) {
    checkCancelled(signal)
    onProgress?.({ message: `Memeriksa kunjungan ${index + 1} dari ${archive.manifest.visits.length}…`, completed: index, total: archive.manifest.visits.length })
    const photos = archive.manifest.photos.filter((photo) => photo.visitId === visit.id)
    const digest = await documentDigest(visit, photos)
    const current = await cloud.document(visit.id)
    let kind: RestoreRow['kind'] = !current ? 'missing' : current.revision.deletedAt ? 'deleted' : 'changed'
    let targetId = visit.id, expectedVersion = current?.revision.version ?? 0
    if (current && !current.revision.deletedAt && await remoteDigest(cloud, current, signal) === digest) kind = 'same'
    else {
      const copyId = await stableId(`log-lapangan/restore-copy/v1/${visit.id}/${digest}`)
      const copy = await cloud.document(copyId)
      if (copy && !copy.revision.deletedAt && await remoteDigest(cloud, copy, signal) === digest) kind = 'copy-exists'
      else if (kind === 'changed') {
        targetId = copyId; expectedVersion = copy?.revision.version ?? 0
        if (copy && !copy.revision.deletedAt) kind = 'blocked'
      }
    }
    const requestId = await stableId(`log-lapangan/restore-request/v1/${targetId}/${expectedVersion}/${digest}`)
    rows.push({ id: visit.id, visit, kind, targetId, expectedVersion, digest, requestId })
    onProgress?.({ message: 'Memeriksa dokumentasi cloud…', completed: index + 1, total: archive.manifest.visits.length })
    await pause()
  }
  checkCancelled(signal)
  return rows
}

export async function restoreDocuments(cloud: BackupCloud, archive: Archive, selected: RestoreRow[], { signal, onProgress }: ProgressOptions = {}) {
  await cloud.authorize()
  const results: RestoreResult[] = []
  const rows = [...new Map(selected.map((row) => [row.id, row])).values()]
  for (const [index, row] of rows.entries()) {
    if (signal?.aborted) break
    onProgress?.({ message: `Memulihkan kunjungan ${index + 1} dari ${rows.length}…`, completed: index, total: rows.length })
    try {
      if (!['missing', 'deleted', 'changed'].includes(row.kind) || !archive.manifest.visits.some((visit) => visit.id === row.id)) throw new Error('Pilihan pemulihan tidak valid.')
      const current = await cloud.revision(row.targetId)
      if (current && !current.deletedAt) {
        const document = await cloud.document(row.targetId)
        if (current.requestId === row.requestId || (document && await remoteDigest(cloud, document) === row.digest)) {
          results.push({ id: row.id, status: 'already', message: 'Sudah dipulihkan; dilewati.' }); continue
        }
        results.push({ id: row.id, status: 'conflict', message: 'Data berubah sejak pratinjau. Versi cloud tetap dipertahankan.' }); continue
      }
      if ((current?.version ?? 0) !== row.expectedVersion) {
        results.push({ id: row.id, status: 'conflict', message: 'Data berubah sejak pratinjau. Periksa ulang backup.' }); continue
      }
      const photos = []
      // Once a visit starts, finish that transaction before honoring cancellation.
      for (const photo of archive.manifest.photos.filter((photo) => photo.visitId === row.id)) {
        const blob = archive.files.get(photo.id)
        if (!blob) throw new Error('Foto backup tidak lengkap.')
        const photoId = await stableId(`log-lapangan/restore-photo/v1/${row.targetId}/${row.expectedVersion}/${photo.id}/${photo.sha256}`)
        const path = `${row.targetId}/${photoId}.jpg`
        const upload = await cloud.upload(path, blob)
        if (upload === 'exists' && await sha256(new Uint8Array(await (await cloud.download(path)).arrayBuffer())) !== photo.sha256) {
          throw new Error('File tujuan berbeda. Pemulihan ditahan agar foto tidak tertimpa.')
        }
        photos.push({ id: photoId, visitId: row.targetId, path, note: photo.note, additionalNote: photo.additionalNote, createdAt: photo.createdAt })
      }
      await cloud.commit({ id: row.targetId, expectedVersion: row.expectedVersion, requestId: row.requestId, visit: { ...row.visit, id: row.targetId }, photos })
      results.push({ id: row.id, status: 'restored', message: row.kind === 'changed' ? 'Dipulihkan sebagai salinan baru.' : 'Kunjungan berhasil dipulihkan.' })
    } catch (cause) {
      const message = typeof cause === 'object' && cause && 'message' in cause ? String(cause.message) : ''
      results.push({ id: row.id, status: message.includes('SYNC_CONFLICT') ? 'conflict' : 'failed',
        message: message.includes('SYNC_CONFLICT') ? 'Data berubah sejak pratinjau. Versi cloud tetap dipertahankan.' : 'Belum berhasil dipulihkan. Periksa koneksi dan coba ulang; data yang berhasil tetap ada.' })
    }
    onProgress?.({ message: 'Memulihkan dokumentasi…', completed: index + 1, total: rows.length })
    await pause()
  }
  return results
}
