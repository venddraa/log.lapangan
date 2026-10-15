import { jsPDF } from 'jspdf'
import { combinedPhotoNote } from './activityNames'
import { readExportSnapshot, checkExportCancelled, type ExportVisit, type ExportProgress } from './exportData'
import { jakartaDate } from './visitFilters'
import type { Visit } from '../types/visit'

export type VisitReport = { blob: Blob; filename: string; visitCount: number; photoCount: number; pageCount: number }
export type ReportOptions = {
  includePhotos?: boolean
  selectionLabel?: string
  signal?: AbortSignal
  onProgress?: (progress: ExportProgress) => void
}
const BLUE = '#08265e', INK = '#17213a', MUTED = '#667085', LINE = '#e1e7ef'
const LEFT = 16, WIDTH = 178, BOTTOM = 278
const normalize = (text: string) => text.replace(/[\u2010-\u2015\u2212]/g, '-').replace(/\r\n?/g, '\n').replace(/\t/g, '  ').replace(/\p{Cc}/gu, (character) => character === '\n' ? '\n' : '')
const pause = () => new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0))
function base64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768))
  return btoa(binary)
}
async function fonts(signal?: AbortSignal) {
  const urls = [new URL('../assets/fonts/LogSans.ttf', import.meta.url), new URL('../assets/fonts/LogSans-Bold.ttf', import.meta.url)]
  return Promise.all(urls.map(async (url) => {
    const response = await fetch(url, { signal })
    if (!response.ok) throw new Error('Font laporan belum bisa dimuat. Buka aplikasi saat online lalu coba lagi.')
    return base64(await response.arrayBuffer())
  }))
}
function dateLabel(value: string, time = false) {
  return new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric',
    ...(time ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(new Date(value)) + (time ? ' WIB' : '')
}
function locationLabel(visit: Visit) {
  const location = visit.primaryLocation
  return [location.tollRoadName || location.typeLabel, location.name, location.detail, location.direction, location.station && `KM ${location.station}`]
    .filter(Boolean).join(' / ')
}

export async function createVisitReport(references: ExportVisit[], options: ReportOptions = {}): Promise<VisitReport> {
  const { signal, onProgress, includePhotos = true, selectionLabel } = options
  checkExportCancelled(signal)
  const snapshot = (await readExportSnapshot(references)).sort((a, b) => new Date(b.visit.visitDate).getTime() - new Date(a.visit.visitDate).getTime() || a.visit.id.localeCompare(b.visit.id))
  const photoCount = snapshot.reduce((sum, entry) => sum + entry.photos.length, 0)
  if (includePhotos && snapshot.reduce((sum, entry) => sum + entry.photos.reduce((bytes, photo) => bytes + photo.blob.size, 0), 0) > 100 * 1024 * 1024) {
    throw new Error('Foto laporan melebihi 100 MB. Persempit filter atau buat rekap tanpa foto.')
  }
  const total = snapshot.length + (includePhotos ? photoCount : 0)
  let completed = 0
  onProgress?.({ completed, total })
  const [regular, bold] = await fonts(signal)
  checkExportCancelled(signal)
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true })
  pdf.addFileToVFS('LogSans.ttf', regular); pdf.addFont('LogSans.ttf', 'LogSans', 'normal')
  pdf.addFileToVFS('LogSans-Bold.ttf', bold); pdf.addFont('LogSans-Bold.ttf', 'LogSans', 'bold')
  pdf.setProperties({ title: 'Rekap Kunjungan Lapangan', subject: 'Dokumentasi kegiatan lapangan', creator: 'Log Lapangan' })
  let y = 30
  let continuation = ''
  function font(size = 10, weight: 'normal' | 'bold' = 'normal', color = INK) {
    pdf.setFont('LogSans', weight); pdf.setFontSize(size); pdf.setTextColor(color)
  }
  function header() {
    font(10, 'bold', BLUE); pdf.text('Log Lapangan', LEFT, 17)
    font(8, 'normal', MUTED); pdf.text('REKAP KUNJUNGAN LAPANGAN', 194, 17, { align: 'right' })
    pdf.setDrawColor(LINE); pdf.line(LEFT, 22, 194, 22)
    pdf.setDrawColor('#ffd329'); pdf.setLineWidth(1); pdf.line(LEFT, 22, LEFT + 20, 22); pdf.setLineWidth(0.2)
  }
  function page() {
    pdf.addPage(); header(); y = 30
    if (continuation) { font(8, 'bold', MUTED); pdf.text(continuation, LEFT, y); y += 8 }
  }
  function ensure(height: number) { if (y + height > BOTTOM) page() }
  function paragraph(text: string, size = 10, weight: 'normal' | 'bold' = 'normal', color = INK) {
    font(size, weight, color)
    const lines: string[] = pdf.splitTextToSize(normalize(text), WIDTH)
    const lineHeight = size * 0.3528 * 1.4
    for (const line of lines) {
      ensure(lineHeight); font(size, weight, color)
      pdf.text(line, LEFT, y + lineHeight * 0.77); y += lineHeight
    }
  }
  header()
  paragraph('Rekap Kunjungan Lapangan', 22, 'bold', BLUE); y += 4
  const days = snapshot.map(({ visit }) => jakartaDate(visit.visitDate)).sort()
  const period = days[0] === days.at(-1) ? dateLabel(snapshot[0].visit.visitDate)
    : `${dateLabel(`${days[0]}T00:00:00+07:00`)} - ${dateLabel(`${days.at(-1)}T00:00:00+07:00`)}`
  paragraph(`Tanggal kunjungan: ${period}`, 10, 'normal', MUTED)
  if (selectionLabel) { y += 3; paragraph(`Pilihan: ${selectionLabel}`, 9, 'normal', MUTED) }
  y += 3
  paragraph(includePhotos ? 'Rekap lengkap: ringkasan, foto, dan catatan.' : 'Rekap ringkas: tabel kunjungan tanpa lampiran foto.', 9, 'normal', MUTED)
  y += 7
  ensure(24)
  const roads = new Set(snapshot.map(({ visit }) => visit.primaryLocation.tollRoadName?.trim()).filter(Boolean)).size
  for (const [index, [value, label]] of [[snapshot.length, 'KUNJUNGAN'], [photoCount, 'FOTO'], [roads, 'RUAS']].entries()) {
    const x = LEFT + index * (WIDTH / 3)
    pdf.setFillColor('#eef3fa'); pdf.rect(x, y, WIDTH / 3 - 2, 23, 'F')
    font(18, 'bold', BLUE); pdf.text(String(value), x + 5, y + 10)
    font(8, 'normal', MUTED); pdf.text(String(label), x + 5, y + 18)
  }
  y += 32
  paragraph('Daftar kunjungan', 12, 'bold'); y += 4
  const columns = [10, 52, 60, 38, 18]
  function tableHead() {
    pdf.setFillColor(BLUE); pdf.rect(LEFT, y, WIDTH, 9, 'F')
    let x = LEFT
    ;['NO.', 'KEGIATAN', 'LOKASI', 'WAKTU (WIB)', 'FOTO'].forEach((label, index) => {
      font(7, 'bold', '#ffffff'); pdf.text(label, x + 2, y + 5.8); x += columns[index]
    })
    y += 9
  }
  ensure(18); tableHead()
  for (const [index, { visit, photos }] of snapshot.entries()) {
    checkExportCancelled(signal)
    font(8)
    const cells = [String(index + 1), visit.activityName, locationLabel(visit), dateLabel(visit.visitDate, true).replace(' WIB', ''), String(photos.length)]
      .map((text, column) => pdf.splitTextToSize(normalize(text), columns[column] - 4) as string[])
    const lines = Math.max(...cells.map((cell) => cell.length))
    let offset = 0
    while (offset < lines) {
      if (y + 10 > BOTTOM) { page(); tableHead() }
      const fitting = Math.max(1, Math.min(lines - offset, Math.floor((BOTTOM - y - 4) / 4.1)))
      const height = fitting * 4.1 + 4
      if (index % 2 === 0) { pdf.setFillColor('#f6f8fb'); pdf.rect(LEFT, y, WIDTH, height, 'F') }
      let x = LEFT
      cells.forEach((cell, column) => {
        font(8)
        cell.slice(offset, offset + fitting).forEach((line, lineIndex) => pdf.text(line, x + 2, y + 4.7 + lineIndex * 4.1))
        x += columns[column]
      })
      y += height; pdf.setDrawColor(LINE); pdf.line(LEFT, y, 194, y)
      offset += fitting
    }
    onProgress?.({ completed: ++completed, total }); await pause()
  }

  if (includePhotos) {
    for (const [visitIndex, { visit, photos }] of snapshot.entries()) {
      checkExportCancelled(signal)
      if (!photos.length && !visit.notes.trim()) continue
      continuation = ''
      page()
      continuation = `Kunjungan ${visitIndex + 1} - lanjutan`
      paragraph(`Kunjungan ${String(visitIndex + 1).padStart(2, '0')}`, 10, 'bold', BLUE); y += 2
      paragraph(visit.activityName, 16, 'bold'); y += 4
      paragraph(locationLabel(visit), 10)
      paragraph(`${visit.primaryLocation.typeLabel} | ${dateLabel(visit.visitDate, true)}`, 9, 'normal', MUTED)
      if (visit.activityCategory) paragraph(`Kategori: ${visit.activityCategory}`, 9, 'normal', MUTED)
      if (visit.notes.trim()) { y += 4; paragraph(visit.notes, 10) }
      y += 7
      if (!photos.length) paragraph('Tidak ada foto pada kunjungan ini.', 10, 'normal', MUTED)
      for (const [photoIndex, photo] of photos.entries()) {
        checkExportCancelled(signal)
        const bytes = new Uint8Array(await photo.blob.arrayBuffer())
        checkExportCancelled(signal)
        let image: { width: number; height: number }
        try { image = pdf.getImageProperties(bytes) } catch { throw new Error('Ada foto yang belum bisa dimuat ke PDF. Periksa foto kunjungan lalu coba lagi.') }
        if (!image.width || !image.height) throw new Error('Ukuran foto tidak valid.')
        const frameHeight = Math.min(150, WIDTH * image.height / image.width)
        ensure(frameHeight + 20)
        paragraph(`Foto ${photoIndex + 1}`, 10, 'bold'); y += 2
        const scale = Math.min(WIDTH / image.width, frameHeight / image.height)
        const width = image.width * scale, height = image.height * scale
        pdf.setFillColor('#f3f5f8'); pdf.rect(LEFT, y, WIDTH, frameHeight, 'F')
        pdf.addImage(bytes, 'JPEG', LEFT + (WIDTH - width) / 2, y + (frameHeight - height) / 2, width, height, `${visit.id}:${photo.id}`)
        y += frameHeight + 5
        paragraph(combinedPhotoNote(photo) || 'Tanpa catatan.', 10, 'normal', combinedPhotoNote(photo) ? INK : MUTED)
        y += 8
        onProgress?.({ completed: ++completed, total }); await pause()
      }
    }
  }
  checkExportCancelled(signal)
  const pageCount = pdf.getNumberOfPages()
  const generated = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }).format(new Date())
  for (let index = 1; index <= pageCount; index++) {
    pdf.setPage(index); pdf.setDrawColor(LINE); pdf.line(LEFT, 283, 194, 283)
    font(7, 'normal', MUTED); pdf.text(`Log Lapangan | Dibuat ${generated} WIB`, LEFT, 289)
    pdf.text(`${index} / ${pageCount}`, 194, 289, { align: 'right' })
  }
  const blob = pdf.output('blob')
  if (blob.size > 100 * 1024 * 1024) throw new Error('PDF melebihi 100 MB. Persempit filter atau buat rekap tanpa foto.')
  const dateName = days[0] === days.at(-1) ? days[0] : `${days[0]}_${days.at(-1)}`
  return { blob, filename: `rekap-lapangan_${dateName}_${snapshot.length}-kunjungan_${includePhotos ? 'lengkap' : 'ringkas'}.pdf`, visitCount: snapshot.length, photoCount, pageCount }
}
