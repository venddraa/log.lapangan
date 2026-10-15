import type { Photo, Visit } from '../types/visit'

const MAX_IMAGE_DIMENSION = 1920
const JPEG_QUALITY = 0.82
const STAMP_JPEG_QUALITY = 0.92

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Format foto tidak dapat dibaca.'))
    }
    image.src = url
  })
}

function loadBlobImage(blob: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Foto tidak dapat disiapkan untuk diunduh.'))
    }
    image.src = url
  })
}

function splitTextIntoLines(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  const words = text.trim().split(/\s+/)
  const lines: string[] = []
  let currentLine = ''

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word
    if (currentLine && context.measureText(candidate).width > maxWidth) {
      lines.push(currentLine)
      currentLine = word
    } else {
      currentLine = candidate
    }
  }

  if (currentLine) lines.push(currentLine)
  return lines
}

function getPhotoStampContent(visit: Visit, photo: Pick<Photo, 'note' | 'additionalNote'>) {
  const location = visit.primaryLocation
  const locationDetail = [
    location.name,
    location.detail,
    location.direction,
    location.station,
  ].filter(Boolean)
  const visitDate = new Date(visit.visitDate)
  const timestamp = new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Jakarta',
  })
    .format(visitDate)
    .replace(' pukul ', ' · ')

  return {
    heading: location.tollRoadName || location.typeLabel,
    details: locationDetail.join(' · '),
    activity: visit.activityName,
    notes: [photo.note, photo.additionalNote].filter(Boolean),
    timestamp: `${timestamp} WIB`,
  }
}

export function getPhotoStampLines(
  visit: Visit,
  photo: Pick<Photo, 'note' | 'additionalNote'>,
) {
  const content = getPhotoStampContent(visit, photo)
  return [
    content.heading,
    content.details,
    content.activity,
    ...content.notes,
    content.timestamp,
  ].filter(Boolean)
}

export async function createStampedPhoto(
  photoBlob: Blob,
  visit: Visit,
  photo: Pick<Photo, 'note' | 'additionalNote'>,
) {
  const image = await loadBlobImage(photoBlob)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Pemrosesan foto tidak didukung oleh browser ini.')
  }

  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  context.drawImage(image, 0, 0)

  const content = getPhotoStampContent(visit, photo)
  const shortestSide = Math.min(canvas.width, canvas.height)
  const panelLeft = Math.max(4, Math.round(shortestSide * 0.02))
  const panelTop = panelLeft
  const horizontalPadding = Math.max(8, Math.round(shortestSide * 0.025))
  const accentWidth = Math.max(7, Math.round(shortestSide * 0.008))
  const accentGap = Math.round(shortestSide * 0.018)
  const textLeft = panelLeft + horizontalPadding + accentWidth + accentGap
  const maxPanelWidth = Math.min(canvas.width - panelLeft * 2, canvas.width * 0.78)
  const textWidth = Math.max(1, maxPanelWidth - horizontalPadding * 2 - accentWidth - accentGap)
  const headingSize = Math.max(26, Math.round(shortestSide * 0.045))
  const bodySize = Math.max(20, Math.round(shortestSide * 0.032))
  const metaSize = Math.max(18, Math.round(shortestSide * 0.027))
  const rowGap = Math.max(7, Math.round(shortestSide * 0.01))

  const rows: Array<{ text: string; size: number; weight: number; color: string }> = []
  const addWrappedRows = (
    text: string,
    size: number,
    weight: number,
    color: string,
    maxLines = 2,
  ) => {
    if (!text) return
    context.font = `${weight} ${size}px Inter, Arial, sans-serif`
    splitTextIntoLines(context, text, textWidth)
      .slice(0, maxLines)
      .forEach((line) => rows.push({ text: line, size, weight, color }))
  }

  addWrappedRows(content.heading.toUpperCase(), headingSize, 800, '#ffd329', 1)
  addWrappedRows(content.details, bodySize, 700, '#ffffff')
  addWrappedRows(content.activity, bodySize, 600, '#ffffff')
  content.notes.forEach((note) => addWrappedRows(note, metaSize, 500, '#dce7fa'))
  addWrappedRows(content.timestamp, metaSize, 700, '#ffd329', 1)

  const innerVerticalPadding = Math.max(22, Math.round(shortestSide * 0.03))
  const rowHeights = rows.map((row) => Math.round(row.size * 1.22))
  const panelHeight = Math.min(
    canvas.height - panelTop * 2,
    innerVerticalPadding * 2 +
      rowHeights.reduce((total, height) => total + height, 0) +
      rowGap * Math.max(0, rows.length - 1),
  )
  const widestRow = Math.max(...rows.map((row) => {
    context.font = `${row.weight} ${row.size}px Inter, Arial, sans-serif`
    return Math.min(textWidth, context.measureText(row.text).width)
  }))
  const panelWidth = Math.min(maxPanelWidth, widestRow + horizontalPadding * 2 + accentWidth + accentGap)
  context.fillStyle = 'rgba(5, 28, 73, 0.32)'
  context.fillRect(panelLeft, panelTop, panelWidth, panelHeight)

  context.fillStyle = '#ffd329'
  context.fillRect(panelLeft + horizontalPadding, panelTop + innerVerticalPadding, accentWidth, panelHeight - innerVerticalPadding * 2)

  context.shadowColor = 'rgba(0, 0, 0, 0.85)'
  context.shadowBlur = Math.max(2, shortestSide * 0.004)
  context.shadowOffsetY = Math.max(1, shortestSide * 0.001)
  let y = panelTop + innerVerticalPadding
  rows.forEach((row, index) => {
    context.font = `${row.weight} ${row.size}px Inter, Arial, sans-serif`
    context.fillStyle = row.color
    context.textBaseline = 'top'
    context.fillText(row.text, textLeft, y, textWidth)
    y += rowHeights[index] + rowGap
  })

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Foto bertulisan gagal dibuat.'))
      },
      'image/jpeg',
      STAMP_JPEG_QUALITY,
    )
  })
}

function cleanFilenamePart(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42)
}

export function createPhotoFilename(visit: Visit, index: number) {
  const date = new Date(visit.visitDate).toLocaleDateString('sv-SE', {
    timeZone: 'Asia/Jakarta',
  })
  const location =
    visit.primaryLocation.tollRoadName || visit.primaryLocation.name || 'Field-Log'
  const detail = visit.primaryLocation.name
  return [date, location, detail, String(index + 1).padStart(2, '0')]
    .map(cleanFilenamePart)
    .filter(Boolean)
    .join('_') + '.jpg'
}

export function downloadPhoto(blob: Blob, filename: string, revokeAfterMs = 1000) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), revokeAfterMs)
}

export async function compressImage(file: File) {
  const image = await loadImage(file)
  const longestSide = Math.max(image.naturalWidth, image.naturalHeight)
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / longestSide)
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Pemrosesan foto tidak didukung oleh browser ini.')
  }

  canvas.width = width
  canvas.height = height
  context.drawImage(image, 0, 0, width, height)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Foto gagal dikompresi.'))
      },
      'image/jpeg',
      JPEG_QUALITY,
    )
  })
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
