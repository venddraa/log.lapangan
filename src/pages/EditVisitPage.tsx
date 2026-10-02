import { useEffect, useState } from 'react'
import { getVisit, getVisitPhotos, updateVisit } from '../db/database'
import type { CreateVisitInput, Photo, Visit } from '../types/visit'
import { NewVisitPage } from './NewVisitPage'

type EditVisitPageProps = {
  visitId: string
  onBack: () => void
  onSaved: () => void
}

export function EditVisitPage({
  visitId,
  onBack,
  onSaved,
}: EditVisitPageProps) {
  const [visit, setVisit] = useState<Visit>()
  const [photos, setPhotos] = useState<Photo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let isMounted = true

    Promise.all([getVisit(visitId), getVisitPhotos(visitId)])
      .then(([storedVisit, storedPhotos]) => {
        if (!storedVisit) throw new Error('Kunjungan tidak ditemukan.')
        if (isMounted) {
          setVisit(storedVisit)
          setPhotos(storedPhotos)
        }
      })
      .catch(() => {
        if (isMounted) setLoadError('Kunjungan tidak dapat dibuka untuk diedit.')
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [visitId])

  async function handleSave(input: CreateVisitInput) {
    await updateVisit(visitId, input)
    onSaved()
  }

  if (isLoading) {
    return <div className="detail-status">Menyiapkan form edit…</div>
  }

  if (loadError || !visit) {
    return (
      <div className="detail-status error-state">
        <p>{loadError || 'Kunjungan tidak ditemukan.'}</p>
        <button type="button" onClick={onBack}>
          Kembali
        </button>
      </div>
    )
  }

  return (
    <NewVisitPage
      mode="edit"
      initialVisit={visit}
      initialPhotos={photos}
      onBack={onBack}
      onSave={handleSave}
    />
  )
}
