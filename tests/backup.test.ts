import { expect, test } from 'vitest'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { createCloudBackup, previewRestore, restoreDocuments } from '../src/backup/operations'
import { BackupWriter, readBackup, sha256 } from '../src/backup/archive'
import { fixtureCloud, ids, photoIds } from './helpers/backupCloud'

async function setup() { const cloud = fixtureCloud(); const backup = await createCloudBackup(cloud); return { cloud, backup, archive: await readBackup(backup.blob) } }
async function editArchive(blob: Blob, update: (entries: Record<string, Uint8Array>) => Promise<void> | void) {
  const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()))
  await update(entries)
  return new Blob([new Uint8Array(zipSync(entries, { level: 0 })).buffer])
}
async function editManifest(blob: Blob, update: (manifest: Record<string, unknown>) => void) {
  return editArchive(blob, async (entries) => {
    const manifest = JSON.parse(strFromU8(entries['manifest.json']))
    update(manifest); entries['manifest.json'] = strToU8(JSON.stringify(manifest)); entries['manifest.sha256'] = strToU8(await sha256(entries['manifest.json']))
  })
}

test('cloud backup roundtrips original photos, metadata and legacy notes without restoring accounts or local drafts', async () => {
  const { cloud, archive } = await setup()
  expect(archive.manifest.visits).toHaveLength(3)
  expect(archive.manifest.photos).toHaveLength(2)
  expect(archive.manifest.photos[1].additionalNote).toBe('Catatan lama tetap ada')
  expect([...new Uint8Array(await archive.files.get(photoIds[0])!.arrayBuffer())]).toEqual([255, 216, 1, 2, 3, 4, 255, 217])
  expect(JSON.stringify(archive.manifest)).not.toMatch(/password|access_token|service_role|created_by|drafts/)
  expect(cloud.commits).toBe(0)
})

test('backup rejects concurrent edits and missing cloud photos instead of producing an incomplete file', async () => {
  const cloud = fixtureCloud()
  cloud.onList = () => { if (cloud.listCalls === 2) cloud.docs.get(ids[0])!.revision.version++ }
  await expect(createCloudBackup(cloud)).rejects.toThrow('berubah saat backup')
  cloud.onList = undefined; cloud.files.clear()
  await expect(createCloudBackup(cloud)).rejects.toThrow('Foto hilang')
  expect(cloud.commits).toBe(0)
})

test('modified manifest, missing photo, wrong checksum and invalid references are rejected before preview', async () => {
  const { backup } = await setup()
  await expect(readBackup(await editArchive(backup.blob, (entries) => { entries['manifest.json'][10] ^= 1 }))).rejects.toThrow('Pemeriksaan backup gagal')
  await expect(readBackup(await editArchive(backup.blob, (entries) => { delete entries[`photos/${photoIds[0]}.jpg`] }))).rejects.toThrow('tidak lengkap')
  await expect(readBackup(await editArchive(backup.blob, (entries) => { entries[`photos/${photoIds[0]}.jpg`][2] ^= 1 }))).rejects.toThrow('foto backup')
  await expect(readBackup(await editManifest(backup.blob, (manifest) => { manifest.version = 99 }))).rejects.toThrow('tidak valid')
  await expect(readBackup(await editManifest(backup.blob, (manifest) => { (manifest.photos as { visitId: string }[])[0].visitId = crypto.randomUUID() }))).rejects.toThrow('tidak valid')
})

test('ZIP traversal, duplicate names and compressed archives are rejected without inflating untrusted input', async () => {
  const { backup } = await setup()
  await expect(readBackup(await editArchive(backup.blob, (entries) => { entries['../escape.txt'] = strToU8('bad') }))).rejects.toThrow('arsipnya rusak')
  const entries = unzipSync(new Uint8Array(await backup.blob.arrayBuffer()))
  await expect(readBackup(new Blob([new Uint8Array(zipSync(entries, { level: 9 })).buffer]))).rejects.toThrow('arsipnya rusak')
  const writer = new BackupWriter()
  writer.add('manifest.json', entries['manifest.json']); writer.add('manifest.json', entries['manifest.json'])
  const duplicate = writer.finish(); writer.close()
  await expect(readBackup(duplicate)).rejects.toThrow('arsipnya rusak')
})

test('unchanged cloud documents are recognized despite different JSON field order', async () => {
  const { cloud, archive } = await setup()
  const location = cloud.docs.get(ids[0])!.visit.primaryLocation
  cloud.docs.get(ids[0])!.visit.primaryLocation = { name: location.name, tollRoadName: location.tollRoadName, tollRoadId: location.tollRoadId,
    typeLabel: location.typeLabel, type: location.type }
  const preview = await previewRestore(cloud, archive)
  expect(preview.every((row) => row.kind === 'same')).toBe(true)
  expect(cloud.commits).toBe(0)
})

test('missing and deleted documents restore with original dates and photos, and repeat attempts never duplicate them', async () => {
  const { cloud, archive } = await setup()
  cloud.docs.delete(ids[0]); cloud.files.clear()
  cloud.docs.get(ids[1])!.revision = { id: ids[1], version: 4, deletedAt: new Date().toISOString(), requestId: null }
  const preview = await previewRestore(cloud, archive)
  expect(preview.map((row) => row.kind)).toEqual(['missing', 'deleted', 'same'])
  const chosen = preview.filter((row) => ['missing', 'deleted'].includes(row.kind))
  expect((await restoreDocuments(cloud, archive, chosen)).map((result) => result.status)).toEqual(['restored', 'restored'])
  expect(cloud.docs.get(ids[0])!.photos).toHaveLength(2)
  expect(cloud.docs.get(ids[0])!.visit.visitDate).toBe(archive.manifest.visits[0].visitDate)
  expect(cloud.docs.get(ids[1])!.revision.version).toBe(5)
  const uploads = cloud.uploads, commits = cloud.commits
  expect((await restoreDocuments(cloud, archive, chosen)).every((result) => result.status === 'already')).toBe(true)
  expect(cloud.uploads).toBe(uploads); expect(cloud.commits).toBe(commits)
  expect((await previewRestore(cloud, archive)).every((row) => row.kind === 'same')).toBe(true)
})

test('changed data only creates a copy, and even a different backup file cannot create the same copy twice', async () => {
  const { cloud, archive, backup } = await setup()
  cloud.docs.get(ids[0])!.visit.activityName = 'Versi cloud terbaru'; cloud.docs.get(ids[0])!.revision.version++
  const chosen = (await previewRestore(cloud, archive)).filter((row) => row.kind === 'changed')
  expect(chosen).toHaveLength(1)
  expect((await restoreDocuments(cloud, archive, chosen))[0].status).toBe('restored')
  expect(cloud.docs.get(ids[0])!.visit.activityName).toBe('Versi cloud terbaru')
  expect(cloud.docs.get(chosen[0].targetId)!.visit.activityName).toBe('Survey 0')
  const otherFile = await readBackup(await editManifest(backup.blob, (manifest) => { manifest.id = crypto.randomUUID() }))
  expect((await previewRestore(cloud, otherFile))[0].kind).toBe('copy-exists')
  expect(cloud.docs.size).toBe(4)
})

test('a modified restored copy is blocked rather than overwritten', async () => {
  const { cloud, archive } = await setup()
  cloud.docs.get(ids[0])!.visit.notes = 'Baru'
  const chosen = (await previewRestore(cloud, archive)).filter((row) => row.kind === 'changed')
  await restoreDocuments(cloud, archive, chosen)
  cloud.docs.get(chosen[0].targetId)!.visit.notes = 'Salinan diedit'
  const blocked = (await previewRestore(cloud, archive))[0]
  expect(blocked.kind).toBe('blocked')
  expect((await restoreDocuments(cloud, archive, [blocked]))[0].status).toBe('failed')
  expect(cloud.docs.get(chosen[0].targetId)!.visit.notes).toBe('Salinan diedit')
})

test('another device creating data after preview is preserved; a race at commit is caught by server CAS', async () => {
  const { cloud, archive } = await setup()
  const original = structuredClone(cloud.docs.get(ids[0])!)
  cloud.docs.delete(ids[0])
  const row = (await previewRestore(cloud, archive))[0]
  original.visit.notes = 'Dibuat di perangkat lain'; original.revision.version = 3
  cloud.docs.set(ids[0], original)
  expect((await restoreDocuments(cloud, archive, [row]))[0].status).toBe('conflict')
  cloud.docs.delete(ids[0])
  cloud.beforeCommit = () => { cloud.docs.set(ids[0], original) }
  expect((await restoreDocuments(cloud, archive, [row]))[0].status).toBe('conflict')
  expect(cloud.docs.get(ids[0])!.visit.notes).toBe('Dibuat di perangkat lain')
})

test('lost response after a successful commit can be retried without additional uploads or copies', async () => {
  const { cloud, archive } = await setup(); cloud.docs.delete(ids[0]); cloud.files.clear()
  const row = (await previewRestore(cloud, archive))[0]
  cloud.loseReply = true
  expect((await restoreDocuments(cloud, archive, [row]))[0].status).toBe('failed')
  const uploaded = cloud.uploads
  expect((await restoreDocuments(cloud, archive, [row]))[0].status).toBe('already')
  expect(cloud.uploads).toBe(uploaded); expect(cloud.commits).toBe(1)
})

test('cancellation finishes a started visit and leaves the remaining selections untouched', async () => {
  const { cloud, archive } = await setup(); cloud.docs.clear(); cloud.files.clear()
  const selected = await previewRestore(cloud, archive)
  const controller = new AbortController(); cloud.onUpload = () => controller.abort()
  const result = await restoreDocuments(cloud, archive, selected, { signal: controller.signal })
  expect(result).toHaveLength(1); expect(result[0].status).toBe('restored')
  expect(cloud.docs.get(ids[0])!.photos).toHaveLength(2)
  expect(cloud.docs.has(ids[1])).toBe(false)
})

test('unauthorized operations and cancelled import never write data', async () => {
  const { cloud, archive, backup } = await setup(); cloud.authorized = false
  await expect(createCloudBackup(cloud)).rejects.toThrow('Tidak diizinkan')
  await expect(previewRestore(cloud, archive)).rejects.toThrow('Tidak diizinkan')
  await expect(restoreDocuments(cloud, archive, [])).rejects.toThrow('Tidak diizinkan')
  const controller = new AbortController(); controller.abort()
  await expect(readBackup(backup.blob, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
  expect(cloud.commits).toBe(0)
})

test('a missing cloud photo can be recovered through a new copy instead of blocking the whole preview', async () => {
  const { cloud, archive } = await setup()
  const originalDownload = cloud.download.bind(cloud)
  cloud.download = async (path) => {
    if (path.endsWith(`${photoIds[0]}.jpg`)) { const error = new Error('Missing'); error.name = 'CloudPhotoMissing'; throw error }
    return originalDownload(path)
  }
  const row = (await previewRestore(cloud, archive))[0]
  expect(row.kind).toBe('changed')
  expect((await restoreDocuments(cloud, archive, [row]))[0].status).toBe('restored')
  expect(cloud.docs.get(row.targetId)!.photos).toHaveLength(2)
})
