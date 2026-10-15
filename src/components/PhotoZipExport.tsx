import { useEffect, useRef, useState } from 'react'
import type { ExportProgress, ExportVisit, PhotoZip } from '../utils/photoZip'
import { downloadPhoto, formatFileSize } from '../utils/image'

type Props = { visits: ExportVisit[]; photoCount: number; title?: string; disabled?: boolean }
export function PhotoZipExport({ visits, photoCount, title = 'Unduh foto sekaligus', disabled }: Props) {
  const controller = useRef<AbortController | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [progress, setProgress] = useState<ExportProgress>()
  const [result, setResult] = useState<PhotoZip>()
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const [sharing, setSharing] = useState(false)

  useEffect(() => () => controller.current?.abort(), [])

  async function prepare() {
    if (controller.current || disabled) return
    const current = new AbortController()
    controller.current = current
    setBusy(true); setCancelling(false); setProgress(undefined); setResult(undefined); setMessage(''); setError(false)
    try {
      const { createPhotoZip } = await import('../utils/photoZip')
      const zip = await createPhotoZip(visits, { signal: current.signal,
        onProgress: (update) => { if (!current.signal.aborted) setProgress(update) } })
      if (!current.signal.aborted) setResult(zip)
    } catch (cause) {
      if (current.signal.aborted) setMessage('Penyiapan ZIP dibatalkan.')
      else {
        setError(true)
        setMessage(cause instanceof Error ? cause.message : 'ZIP belum berhasil disiapkan. Coba lagi.')
      }
    } finally {
      if (controller.current === current) { controller.current = undefined; setBusy(false); setCancelling(false) }
    }
  }
  async function share() {
    if (!result || sharing) return
    setSharing(true); setMessage(''); setError(false)
    try {
      await navigator.share({ files: [new File([result.blob], result.filename, { type: 'application/zip' })], title: 'Dokumentasi Log Lapangan' })
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
        setError(true); setMessage('Belum bisa dibagikan. Gunakan tombol Unduh ZIP.')
      }
    } finally { setSharing(false) }
  }
  const canShare = Boolean(result && typeof navigator.share === 'function' && navigator.canShare?.({ files: [new File([result.blob], result.filename, { type: 'application/zip' })] }))

  return <section className="zip-export" aria-label={title}>
    <div className="zip-export-heading"><div><h3>{title}</h3>
      <p>{photoCount} foto · {visits.length} kunjungan. Foto menyertakan lokasi, kegiatan, catatan, dan waktu.</p></div>
      {!busy && !result && <button type="button" className="zip-primary" disabled={disabled || !photoCount || !visits.length}
        onClick={() => void prepare()}>Siapkan ZIP</button>}
    </div>
    {busy && <div className="zip-progress" role="status">
      <p>{cancelling ? 'Membatalkan…' : progress ? `Menyiapkan foto ${progress.completed} dari ${progress.total}…` : 'Memuat foto…'}</p>
      <progress max={progress?.total || 1} value={progress?.completed || 0} aria-label="Penyiapan ZIP" />
      <button type="button" disabled={cancelling} onClick={() => { controller.current?.abort(); setCancelling(true) }}>Batalkan</button>
    </div>}
    {result && <div className="zip-ready">
      <p role="status">ZIP siap: {result.photoCount} foto dari {result.visitCount} kunjungan · {formatFileSize(result.blob.size)}</p>
      <div className="zip-actions">
        <button type="button" className="zip-primary" disabled={sharing} onClick={() => {
          downloadPhoto(result.blob, result.filename, 60_000); setMessage('Unduhan ZIP diminta. Periksa folder unduhan perangkat.'); setError(false)
        }}>Unduh ZIP</button>
        {canShare && <button type="button" disabled={sharing} onClick={() => void share()}>{sharing ? 'Membuka…' : 'Bagikan / Simpan'}</button>}
        <button type="button" disabled={sharing || disabled} onClick={() => void prepare()}>Siapkan ulang</button>
      </div>
    </div>}
    {message && <p className={error ? 'zip-message error' : 'zip-message'} role={error ? 'alert' : 'status'}>{message}</p>}
  </section>
}
