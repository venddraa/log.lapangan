import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { AppIcon } from '../components/AppIcon'
import { db } from '../db/database'
import { syncNow, withCloudMaintenance } from '../db/sync'
import { readBackup } from '../backup/archive'
import { makeBackupCloud } from '../backup/cloud'
import { createCloudBackup, previewRestore, restoreDocuments } from '../backup/operations'
import type { Archive, BackupCloud, Progress, RestoreResult, RestoreRow } from '../backup/types'
import { downloadPhoto, formatFileSize } from '../utils/image'

type Props = { cloud?: BackupCloud; onBack: () => void; onBusyChange: (busy: boolean) => void }
const labels: Record<RestoreRow['kind'], string> = {
  same: 'Sudah sama - dilewati', missing: 'Belum ada - bisa dipulihkan', deleted: 'Pernah dihapus - bisa dikembalikan',
  changed: 'Berbeda - hanya sebagai salinan baru', 'copy-exists': 'Salinan sudah ada - dilewati', blocked: 'Salinan sudah berubah - periksa lewat Riwayat',
}
const allowed = (row: RestoreRow) => ['missing', 'deleted', 'changed'].includes(row.kind)
const dateLabel = (value: string) => new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))

export default function BackupPage({ onBack, onBusyChange, cloud: suppliedCloud }: Props) {
  const [job, setJob] = useState<'backup' | 'preview' | 'restore'>()
  const [progress, setProgress] = useState<Progress>()
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [download, setDownload] = useState<Awaited<ReturnType<typeof createCloudBackup>>>()
  const [archive, setArchive] = useState<Archive>()
  const [rows, setRows] = useState<RestoreRow[]>()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState(false)
  const [results, setResults] = useState<RestoreResult[]>([])
  const [visible, setVisible] = useState(30)
  const controller = useRef<AbortController | undefined>(undefined)

  useEffect(() => { onBusyChange(Boolean(job)); return () => onBusyChange(false) }, [job, onBusyChange])
  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => {
    if (!job) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [job])

  async function readyCloud<T>(operation: (cloud: BackupCloud) => Promise<T>) {
    await syncNow()
    return withCloudMaintenance(async () => {
      if (await db.syncJobs.count()) throw new Error('Masih ada kunjungan yang belum tersinkron atau bertabrakan. Selesaikan sinkronisasi sebelum melanjutkan.')
      return operation(suppliedCloud ?? makeBackupCloud())
    })
  }
  async function run(kind: NonNullable<typeof job>, operation: (options: { signal: AbortSignal; onProgress: (value: Progress) => void }) => Promise<void>) {
    if (controller.current) return
    const current = new AbortController()
    controller.current = current
    setJob(kind); setError(''); setNotice(''); setProgress(undefined); setConfirm(false)
    try { await operation({ signal: current.signal, onProgress: (value) => { if (!current.signal.aborted) setProgress(value) } }) }
    catch (cause) {
      if (current.signal.aborted) setNotice(kind === 'backup' ? 'Pembuatan backup dibatalkan.' : kind === 'preview' ? 'Pemeriksaan backup dibatalkan.' : 'Pemulihan dihentikan. Data yang sudah berhasil dipulihkan tetap tersimpan.')
      else setError(cause instanceof Error ? cause.message : 'Proses belum berhasil. Periksa koneksi lalu coba lagi.')
    } finally { if (controller.current === current) { controller.current = undefined; setJob(undefined) } }
  }
  function prepareBackup() {
    void run('backup', async (options) => {
      setDownload(undefined)
      const file = await readyCloud((cloud) => createCloudBackup(cloud, options))
      if (!options.signal.aborted) setDownload(file)
    })
  }
  async function checkArchive(value: Archive, options: { signal: AbortSignal; onProgress: (value: Progress) => void }) {
    const preview = await readyCloud((cloud) => previewRestore(cloud, value, options))
    if (options.signal.aborted) return
    setRows(preview); setSelected(new Set(preview.filter((row) => row.kind === 'missing' || row.kind === 'deleted').map((row) => row.id)))
    setResults([]); setVisible(30)
  }
  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    void run('preview', async (options) => {
      setArchive(undefined); setRows(undefined); setSelected(new Set()); setResults([])
      const value = await readBackup(file, options)
      if (options.signal.aborted) return
      setArchive(value)
      await checkArchive(value, options)
    })
  }
  function restore() {
    if (!archive || !rows || !selected.size) return
    const chosen = rows.filter((row) => selected.has(row.id) && allowed(row))
    void run('restore', async (options) => {
      const outcome = await readyCloud((cloud) => restoreDocuments(cloud, archive, chosen, options))
      setResults(outcome)
      setNotice(options.signal.aborted ? 'Pemulihan dihentikan. Kunjungan yang sudah selesai tetap tersimpan; yang belum selesai bisa dicoba lagi.' : 'Pemulihan selesai diperiksa. Lihat hasil setiap kunjungan di bawah.')
    })
  }
  const completed = results.filter((item) => selected.has(item.id) && ['restored', 'already'].includes(item.status)).length
  const projectOrigin = suppliedCloud?.origin ?? (import.meta.env.VITE_SUPABASE_URL ? new URL(import.meta.env.VITE_SUPABASE_URL).origin : '')
  const statuses = new Map(results.map((item) => [item.id, item]))
  const hasPending = rows?.some((row) => selected.has(row.id) && allowed(row) && !['restored', 'already'].includes(statuses.get(row.id)?.status ?? ''))

  return <>
    <header className="form-header">
      <button className="back-button" type="button" disabled={Boolean(job)} onClick={onBack}><AppIcon name="arrow" size={22} /><span>Kembali</span></button>
      <p className="section-kicker">Salinan dokumentasi</p><h1>Backup & pemulihan</h1>
    </header>
    <main className="page-content backup-page">
      <p className="backup-intro">Backup dokumentasi bersama yang sudah tersinkron. Draft dan pekerjaan yang masih offline di HP lain belum ikut. Pastikan tim selesai menyinkronkan terlebih dahulu.</p>
      {job && <section className="backup-progress" role="status">
        <p>{progress?.message || 'Menyiapkan koneksi dan memeriksa data…'}</p>
        <progress max={progress?.total || 1} value={progress?.completed || 0} aria-label="Progres backup dan pemulihan" />
        <button type="button" onClick={() => { controller.current?.abort(); setNotice('Menghentikan proses setelah pekerjaan yang sedang berjalan selesai…') }}>
          {job === 'restore' ? 'Hentikan setelah kunjungan ini' : 'Batalkan'}
        </button>
      </section>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="backup-notice" role="status">{notice}</p>}
      <div className="backup-panels">
        <section className="form-section">
          <h2>Buat backup</h2><p>Ambil kunjungan, catatan, dan foto bersih dari penyimpanan bersama. File berisi dokumentasi privat; simpan di tempat yang aksesnya terbatas.</p>
          <button className="backup-primary" type="button" disabled={Boolean(job)} onClick={prepareBackup}>Buat backup</button>
          {download && <div className="backup-file" role="status">
            <strong>Backup siap diunduh</strong><p>{download.manifest.visits.length} kunjungan · {download.manifest.photos.length} foto · {formatFileSize(download.blob.size)}</p>
            <p>Dibuat {dateLabel(download.manifest.createdAt)} WIB</p>
            <button className="backup-primary" type="button" disabled={Boolean(job)} onClick={() => {
              downloadPhoto(download.blob, download.filename, 60_000); setNotice('Unduhan backup diminta. Simpan file ini di lokasi privat yang terpisah dari aplikasi.')
            }}>Unduh backup</button>
          </div>}
          <p className="backup-help">Akun login dan draft tidak disertakan. Batas file untuk pemrosesan di browser: 200 MB.</p>
        </section>
        <section className="form-section">
          <h2>Pulihkan backup</h2><p>Pilih file backup Log Lapangan. Isinya akan diperiksa dan dibandingkan dengan data cloud sebelum kamu memilih yang ingin dipulihkan.</p>
          <label className={`backup-file-input${job ? ' disabled' : ''}`}>Pilih file backup
            <input type="file" accept=".zip,application/zip,application/x-zip-compressed" disabled={Boolean(job)} onChange={chooseFile} />
          </label>
          {archive && <div className="backup-file"><strong>Backup {dateLabel(archive.manifest.createdAt)} WIB</strong>
            <p>{archive.manifest.visits.length} kunjungan · {archive.manifest.photos.length} foto terverifikasi</p>
            {archive.manifest.source !== projectOrigin && <p className="backup-source-warning">Backup berasal dari penyimpanan lain. Pastikan ini dokumentasi divisi yang ingin kamu pulihkan.</p>}
            <button type="button" disabled={Boolean(job)} onClick={() => { void run('preview', async (options) => { setRows(undefined); await checkArchive(archive, options) }) }}>Periksa ulang cloud</button>
          </div>}
          <p className="backup-help">Pemulihan berlaku untuk dokumentasi bersama divisi ini. Data yang sama dilewati, dan versi yang berbeda hanya bisa ditambahkan sebagai salinan baru.</p>
        </section>
      </div>
      {rows && <section className="form-section restore-preview" aria-label="Pratinjau pemulihan">
        <h2>Pratinjau pemulihan</h2><p>{rows.length} kunjungan diperiksa · {rows.filter((row) => !allowed(row)).length} dilewati · {selected.size} dipilih</p>
        <div className="backup-actions">
          <button type="button" disabled={Boolean(job)} onClick={() => setSelected(new Set(rows.filter((row) => ['missing', 'deleted'].includes(row.kind)).map((row) => row.id)))}>Pilih yang belum ada / terhapus</button>
          <button type="button" disabled={Boolean(job)} onClick={() => setSelected(new Set())}>Kosongkan pilihan</button>
        </div>
        {rows.slice(0, visible).map((row) => <article className="restore-row" key={row.id}>
          <label><input type="checkbox" disabled={Boolean(job) || !allowed(row)} checked={selected.has(row.id)} onChange={(event) => {
            setSelected((previous) => { const next = new Set(previous); if (event.target.checked) next.add(row.id); else next.delete(row.id); return next }); setConfirm(false)
          }} /><span><strong>{row.visit.activityName ? row.visit.activityName.length > 180 ? row.visit.activityName.slice(0, 180) + '…' : row.visit.activityName : 'Tanpa nama kegiatan'}</strong><small>{row.visit.primaryLocation.tollRoadName} {row.visit.primaryLocation.name} · {dateLabel(row.visit.visitDate)} WIB</small>
            <span className={`restore-kind ${row.kind}`}>{labels[row.kind]}</span></span></label>
          {statuses.has(row.id) && <p className={`restore-result ${statuses.get(row.id)!.status}`} role="status">{statuses.get(row.id)!.message}</p>}
        </article>)}
        {visible < rows.length && <button type="button" onClick={() => setVisible((value) => value + 30)}>Tampilkan berikutnya</button>}
        {results.length > 0 && <p className="backup-notice" role="status">{completed} berhasil / sudah ada dari {selected.size} pilihan. {Math.max(0, selected.size - completed)} belum selesai.</p>}
        <button className="backup-primary" type="button" disabled={Boolean(job) || !selected.size || (results.length > 0 && !hasPending)} onClick={() => setConfirm(true)}>
          {results.length ? 'Coba lagi yang belum selesai' : `Pulihkan ${selected.size} kunjungan`}
        </button>
        {confirm && <div className="restore-confirm" role="alertdialog" aria-modal="true" aria-label="Konfirmasi pemulihan">
          <h3>Pulihkan {selected.size} kunjungan ke dokumentasi bersama?</h3>
          <p>{rows.filter((row) => selected.has(row.id) && row.kind === 'changed').length} akan dibuat sebagai salinan baru. Versi cloud yang sedang aktif tetap dipertahankan. Anggota lain akan menerima hasilnya melalui sinkronisasi.</p>
          <div className="backup-actions"><button type="button" onClick={() => setConfirm(false)}>Batal</button><button className="backup-primary" type="button" onClick={restore}>Ya, pulihkan pilihan</button></div>
        </div>}
      </section>}
    </main>
  </>
}
