import { useEffect, useMemo, useRef, useState } from 'react'
import type { Visit } from '../types/visit'
import { createPhotoFilename, createStampedPhoto, downloadPhoto } from '../utils/image'
import { canSharePhoto, savePreparedPhoto } from '../utils/savePhoto'

type Props = { blob: Blob; visit: Visit; note: string; additionalNote?: string; index: number; disabled?: boolean; incomplete?: boolean }

export function PhotoSaveActions({ blob, visit, note, additionalNote = '', index, disabled, incomplete }: Props) {
  const source = useMemo(() => ({ blob, visit, note: note.trim(), additionalNote: additionalNote.trim(), index }),
    [blob, visit, note, additionalNote, index])
  const [prepared, setPrepared] = useState<{ source: typeof source; file?: File; error?: string }>()
  const [retry, setRetry] = useState(0)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ source: typeof source; message: string; error?: boolean }>()
  const sharing = useRef(false)
  const container = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    if (!container.current || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect() }
    }, { rootMargin: '250px' })
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!visible || incomplete) return
    let active = true
    const timer = window.setTimeout(() => {
      void createStampedPhoto(source.blob, source.visit, source).then((result) => {
        if (active) setPrepared({ source, file: new File([result], createPhotoFilename(source.visit, source.index), { type: 'image/jpeg' }) })
      }).catch(() => {
        if (active) setPrepared({ source, error: 'Foto bertulisan belum siap. Coba siapkan ulang.' })
      })
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [source, retry, visible, incomplete])

  const current = prepared?.source === source && !incomplete ? prepared : undefined
  const file = current?.file
  const canShare = file ? canSharePhoto(file) : false
  const message = feedback?.source === source ? feedback : undefined

  async function save() {
    if (!file || disabled || sharing.current) return
    sharing.current = true; setBusy(true); setFeedback(undefined)
    try {
      const result = await savePreparedPhoto(file)
      setFeedback({ source, message: result === 'cancelled' ? 'Menu ditutup. Foto tetap ada di aplikasi.'
        : result === 'download-requested' ? 'Unduhan diminta. Periksa folder Downloads / Unduhan.'
          : 'Menu perangkat selesai. Periksa tujuan penyimpanan yang kamu pilih.' })
    } catch {
      setFeedback({ source, error: true, message: 'Menu perangkat belum bisa dibuka. Coba lagi atau gunakan Unduh JPG.' })
    } finally { sharing.current = false; setBusy(false) }
  }

  return <div ref={container} className="photo-save" aria-label={`Simpan foto ${index + 1}`}>
    <div className="photo-export-actions">
      <button type="button" disabled={!file || disabled || busy} onClick={() => void save()}>
        {busy ? 'Membuka…' : !file && !incomplete && !current?.error ? 'Menyiapkan foto…' : 'Simpan ke perangkat'}
      </button>
      {canShare && <button type="button" disabled={disabled || busy} onClick={() => {
        if (!file) return
        downloadPhoto(file, file.name, 60_000)
        setFeedback({ source, message: 'Unduhan diminta. Periksa folder Downloads / Unduhan.' })
      }}>Unduh JPG</button>}
      {current?.error && <button type="button" disabled={disabled || busy} onClick={() => { setPrepared(undefined); setRetry((value) => value + 1) }}>Siapkan ulang</button>}
    </div>
    <p className="photo-save-help">{incomplete ? 'Lengkapi lokasi dan nama kegiatan agar tulisan pada foto lengkap.'
      : canShare ? 'Foto sudah bertulisan. Pilih Simpan Gambar jika tersedia di menu HP, atau gunakan Unduh JPG.'
        : 'Foto disiapkan dengan lokasi, kegiatan, catatan, dan waktu. Hasil unduhan mengikuti pengaturan browser.'}</p>
    {current?.error && <p className="photo-action-status error" role="alert">{current.error}</p>}
    {message && <p className={`photo-action-status${message.error ? ' error' : ''}`} role={message.error ? 'alert' : 'status'}>{message.message}</p>}
  </div>
}
