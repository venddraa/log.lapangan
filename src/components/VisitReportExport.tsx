import { useEffect, useRef, useState } from 'react'
import type { ExportProgress, ExportVisit } from '../utils/exportData'
import type { VisitReport } from '../utils/visitReport'
import { downloadPhoto, formatFileSize } from '../utils/image'

type Props = { visits: ExportVisit[]; photoCount: number; selectionLabel: string; disabled?: boolean }
export function VisitReportExport({ visits, photoCount, selectionLabel, disabled }: Props) {
  const controller = useRef<AbortController | undefined>(undefined)
  const [includePhotos, setIncludePhotos] = useState(true)
  const [busy, setBusy] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [progress, setProgress] = useState<ExportProgress>()
  const [result, setResult] = useState<VisitReport>()
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
      const { createVisitReport } = await import('../utils/visitReport')
      const report = await createVisitReport(visits, { includePhotos, selectionLabel, signal: current.signal,
        onProgress: (update) => { if (!current.signal.aborted) setProgress(update) } })
      if (!current.signal.aborted) setResult(report)
    } catch (cause) {
      if (current.signal.aborted) setMessage('Penyiapan PDF dibatalkan.')
      else { setError(true); setMessage(cause instanceof Error ? cause.message : 'PDF belum bisa disiapkan. Coba lagi.') }
    } finally {
      if (controller.current === current) { controller.current = undefined; setBusy(false); setCancelling(false) }
    }
  }
  async function share() {
    if (!result || sharing) return
    setSharing(true); setMessage(''); setError(false)
    try {
      await navigator.share({ files: [new File([result.blob], result.filename, { type: 'application/pdf' })], title: 'Rekap Kunjungan Lapangan' })
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
        setError(true); setMessage('Belum bisa dibagikan. Gunakan tombol Unduh PDF.')
      }
    } finally { setSharing(false) }
  }
  const canShare = Boolean(result && typeof navigator.share === 'function' && navigator.canShare?.({
    files: [new File([result.blob], result.filename, { type: 'application/pdf' })],
  }))
  return <section className="zip-export report-export" aria-label="Rekap PDF">
    <div className="zip-export-heading"><div><h3>Rekap PDF</h3>
      <p>{visits.length} kunjungan · {photoCount} foto. Ringkasan lokasi, kegiatan, dan waktu untuk laporan.</p></div>
      {!busy && !result && <button type="button" className="zip-primary" disabled={disabled || !visits.length}
        onClick={() => void prepare()}>Siapkan PDF</button>}
    </div>
    <label className="report-photo-option"><input type="checkbox" checked={includePhotos} disabled={busy || sharing}
      onChange={(event) => { setIncludePhotos(event.target.checked); setResult(undefined); setMessage(''); setError(false) }} />
      <span>Sertakan foto dan catatan</span>
    </label>
    {busy && <div className="zip-progress" role="status">
      <p>{cancelling ? 'Membatalkan…' : `Menyiapkan rekap${progress ? ` (${Math.round(progress.completed / Math.max(1, progress.total) * 100)}%)` : '…'}`}</p>
      <progress max={progress?.total || 1} value={progress?.completed || 0} aria-label="Penyiapan PDF" />
      <button type="button" disabled={cancelling} onClick={() => { controller.current?.abort(); setCancelling(true) }}>Batalkan</button>
    </div>}
    {result && <div className="zip-ready">
      <p role="status">PDF siap: {result.visitCount} kunjungan · {result.pageCount} halaman · {formatFileSize(result.blob.size)}</p>
      <div className="zip-actions">
        <button type="button" className="zip-primary" disabled={sharing} onClick={() => {
          downloadPhoto(result.blob, result.filename, 60_000); setMessage('Unduhan PDF diminta. Periksa folder unduhan perangkat.'); setError(false)
        }}>Unduh PDF</button>
        {canShare && <button type="button" disabled={sharing} onClick={() => void share()}>{sharing ? 'Membuka…' : 'Bagikan / Simpan'}</button>}
        <button type="button" disabled={sharing || disabled} onClick={() => void prepare()}>Siapkan ulang</button>
      </div>
    </div>}
    {message && <p className={error ? 'zip-message error' : 'zip-message'} role={error ? 'alert' : 'status'}>{message}</p>}
  </section>
}
