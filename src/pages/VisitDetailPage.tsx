import { useEffect, useState } from 'react'
import { AppIcon } from '../components/AppIcon'
import { getVisit, getVisitPhotos } from '../db/database'
import type { Photo, Visit } from '../types/visit'
import {
  createPhotoFilename,
  createStampedPhoto,
  downloadPhoto,
  getPhotoStampLines,
} from '../utils/image'

type VisitDetailPageProps = {
  visitId: string
  onBack: () => void
  onEdit: () => void
  onDelete: () => Promise<void>
}

type PhotoWithPreview = Photo & {
  previewUrl: string
}

export function VisitDetailPage({
  visitId,
  onBack,
  onEdit,
  onDelete,
}: VisitDetailPageProps) {
  const [visit, setVisit] = useState<Visit>()
  const [photos, setPhotos] = useState<PhotoWithPreview[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [processingAction, setProcessingAction] = useState('')
  const [photoActionStatus, setPhotoActionStatus] = useState<{
    photoId: string
    message: string
    isError?: boolean
  }>()

  async function prepareStampedPhoto(photo: PhotoWithPreview, index: number) {
    if (!visit) throw new Error('Kunjungan tidak ditemukan.')
    const blob = await createStampedPhoto(photo.blob, visit, photo)
    return {
      blob,
      filename: createPhotoFilename(visit, index),
    }
  }

  async function handleDownloadPhoto(photo: PhotoWithPreview, index: number) {
    setProcessingAction(`${photo.id}:download`)
    setPhotoActionStatus(undefined)
    try {
      const { blob, filename } = await prepareStampedPhoto(photo, index)
      downloadPhoto(blob, filename)
      setPhotoActionStatus({
        photoId: photo.id,
        message: 'Foto bertulisan berhasil disiapkan.',
      })
    } catch {
      setPhotoActionStatus({
        photoId: photo.id,
        message: 'Foto belum berhasil diunduh. Coba sekali lagi.',
        isError: true,
      })
    } finally {
      setProcessingAction('')
    }
  }

  async function handleSharePhoto(photo: PhotoWithPreview, index: number) {
    setProcessingAction(`${photo.id}:share`)
    setPhotoActionStatus(undefined)
    try {
      const { blob, filename } = await prepareStampedPhoto(photo, index)
      const file = new File([blob], filename, { type: 'image/jpeg' })

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: visit?.activityName || 'Dokumentasi Field Log',
        })
        setPhotoActionStatus({
          photoId: photo.id,
          message: 'Foto siap dibagikan atau disimpan.',
        })
      } else {
        downloadPhoto(blob, filename)
        setPhotoActionStatus({
          photoId: photo.id,
          message: 'Perangkat ini memakai unduhan sebagai pengganti bagikan.',
        })
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setPhotoActionStatus({
        photoId: photo.id,
        message: 'Foto belum berhasil dibagikan. Coba sekali lagi.',
        isError: true,
      })
    } finally {
      setProcessingAction('')
    }
  }

  async function handleDelete() {
    setIsDeleting(true)
    setDeleteError('')
    try {
      await onDelete()
    } catch {
      setDeleteError('Kunjungan belum berhasil dihapus. Coba sekali lagi.')
      setIsDeleting(false)
    }
  }

  useEffect(() => {
    let isMounted = true
    const createdUrls: string[] = []

    Promise.all([getVisit(visitId), getVisitPhotos(visitId)])
      .then(([storedVisit, storedPhotos]) => {
        if (!storedVisit) {
          throw new Error('Kunjungan tidak ditemukan.')
        }

        const photosWithPreview = storedPhotos.map((photo) => {
          const previewUrl = URL.createObjectURL(photo.blob)
          createdUrls.push(previewUrl)
          return { ...photo, previewUrl }
        })

        if (isMounted) {
          setVisit(storedVisit)
          setPhotos(photosWithPreview)
        }
      })
      .catch(() => {
        if (isMounted) setLoadError('Detail kunjungan tidak dapat dibuka.')
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })

    return () => {
      isMounted = false
      createdUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [visitId])

  if (isLoading) {
    return <div className="detail-status">Memuat detail kunjungan…</div>
  }

  if (loadError || !visit) {
    return (
      <div className="detail-status error-state">
        <p>{loadError || 'Kunjungan tidak ditemukan.'}</p>
        <button type="button" onClick={onBack}>
          Kembali ke riwayat
        </button>
      </div>
    )
  }

  const visitDate = new Date(visit.visitDate)
  const locationRows = [
    ['Jenis lokasi', visit.primaryLocation.typeLabel],
    ['Ruas', visit.primaryLocation.tollRoadName],
    ['Lokasi', visit.primaryLocation.name],
    ['Gardu / Detail', visit.primaryLocation.detail],
    ['Jalur / Arah', visit.primaryLocation.direction],
    ['STA / KM', visit.primaryLocation.station],
  ].filter((row): row is [string, string] => Boolean(row[1]))

  return (
    <>
      <header className="detail-header">
        <button className="back-button" type="button" onClick={onBack}>
          <AppIcon name="arrow" size={22} />
          <span>Kembali</span>
        </button>
        <p className="section-kicker">Detail kunjungan</p>
        <h1>{visit.activityName}</h1>
        <div className="detail-time">
          <span>
            {new Intl.DateTimeFormat('id-ID', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            }).format(visitDate)}
          </span>
          <strong>
            {new Intl.DateTimeFormat('id-ID', {
              hour: '2-digit',
              minute: '2-digit',
            }).format(visitDate)}
          </strong>
        </div>
      </header>

      <main className="page-content detail-page">
        {visit.activityCategory && (
          <span className="detail-category">{visit.activityCategory}</span>
        )}

        <section className="detail-section" aria-labelledby="detail-location">
          <h2 id="detail-location">Lokasi</h2>
          <dl className="detail-list">
            {locationRows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="detail-section" aria-labelledby="detail-notes">
          <h2 id="detail-notes">Catatan umum</h2>
          <p className={visit.notes ? 'detail-notes' : 'detail-notes empty'}>
            {visit.notes || 'Tidak ada catatan umum.'}
          </p>
        </section>

        <section className="detail-section photo-detail-section" aria-labelledby="detail-photos">
          <div className="detail-section-title">
            <h2 id="detail-photos">Foto</h2>
            <span>{photos.length}</span>
          </div>

          {photos.length === 0 ? (
            <p className="detail-notes empty">Tidak ada foto pada kunjungan ini.</p>
          ) : (
            <div className="detail-photo-list">
              {photos.map((photo, index) => (
                <figure className="detail-photo" key={photo.id}>
                  <div className="stamped-photo-preview">
                    <img src={photo.previewUrl} alt={`Foto kunjungan ${index + 1}`} />
                    <div className="photo-stamp-preview" aria-hidden="true">
                      {getPhotoStampLines(visit, photo).map((line, lineIndex) => (
                        <span key={`${line}-${lineIndex}`}>{line}</span>
                      ))}
                    </div>
                  </div>
                  <figcaption>
                    <div className="photo-caption-heading">
                      <span>Foto {index + 1}</span>
                      <span>Siap dengan tulisan</span>
                    </div>
                    {photo.note && (
                      <div>
                        <strong>Catatan</strong>
                        <p>{photo.note}</p>
                      </div>
                    )}
                    {photo.additionalNote && (
                      <div>
                        <strong>Catatan tambahan</strong>
                        <p>{photo.additionalNote}</p>
                      </div>
                    )}
                    {!photo.note && !photo.additionalNote && (
                      <p className="photo-note-empty">Tidak ada catatan.</p>
                    )}
                    <div className="photo-export-actions">
                      <button
                        type="button"
                        onClick={() => handleSharePhoto(photo, index)}
                        disabled={Boolean(processingAction)}
                      >
                        {processingAction === `${photo.id}:share`
                          ? 'Menyiapkan…'
                          : 'Bagikan / Simpan'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadPhoto(photo, index)}
                        disabled={Boolean(processingAction)}
                      >
                        {processingAction === `${photo.id}:download`
                          ? 'Menyiapkan…'
                          : 'Unduh JPG'}
                      </button>
                    </div>
                    {photoActionStatus?.photoId === photo.id && (
                      <p
                        className={
                          photoActionStatus.isError
                            ? 'photo-action-status error'
                            : 'photo-action-status'
                        }
                        role="status"
                      >
                        {photoActionStatus.message}
                      </p>
                    )}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </section>

        <section className="detail-actions" aria-label="Tindakan kunjungan">
          <button className="edit-visit-button" type="button" onClick={onEdit}>
            Edit Kunjungan
          </button>
          <button
            className="delete-visit-button"
            type="button"
            onClick={() => setShowDeleteConfirmation(true)}
          >
            Hapus Kunjungan
          </button>
        </section>

        {showDeleteConfirmation && (
          <section className="delete-confirmation" role="alertdialog" aria-modal="true">
            <h2>Hapus kunjungan ini?</h2>
            <p>Catatan dan seluruh foto akan dihapus dari perangkat, lalu dari dokumentasi divisi saat tersinkron.</p>
            {deleteError && <div className="form-error">{deleteError}</div>}
            <div>
              <button
                type="button"
                onClick={() => setShowDeleteConfirmation(false)}
                disabled={isDeleting}
              >
                Batal
              </button>
              <button type="button" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting ? 'Menghapus…' : 'Ya, Hapus'}
              </button>
            </div>
          </section>
        )}
      </main>
    </>
  )
}
