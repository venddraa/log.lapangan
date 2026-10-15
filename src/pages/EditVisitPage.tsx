import { draftId, loadDraft } from '../db/drafts'
import type { DraftCommit } from '../types/draft'
import { useEffect, useState } from 'react'
import { getVisit, getVisitPhotos, updateVisit, createVisit } from '../db/database'
import type { CreateVisitInput, Photo, Visit } from '../types/visit'
import { NewVisitPage } from './NewVisitPage'

type EditVisitPageProps = {
  onBusyChange?: (busy: boolean) => void
  draftOwner: string
  onSavedCopy: (id: string) => void
  visitId: string
  onBack: () => void
  onSaved: () => void
}

export function EditVisitPage({
  draftOwner, onSavedCopy, onBusyChange,
  visitId,
  onBack,
  onSaved,
}: EditVisitPageProps) {
  const [missingVisit, setMissingVisit] = useState(false)
  const [visit, setVisit] = useState<Visit>()
  const [photos, setPhotos] = useState<Photo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let isMounted = true

    Promise.all([getVisit(visitId), getVisitPhotos(visitId)])
      .then(async ([storedVisit, storedPhotos]) => {
        if (!storedVisit) {
          const draft = await loadDraft(draftId(draftOwner, visitId))
          if (!draft) throw new Error('Kunjungan tidak ditemukan.')
          if (isMounted) setMissingVisit(true)
          return
        }
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
  }, [visitId, draftOwner])

  async function handleSave(input: CreateVisitInput, draft: DraftCommit) {
    await updateVisit(visitId, input, draft.baseUpdatedAt ?? visit?.updatedAt, draft)
    onSaved()
  }

  if (isLoading) {
    return <div className="detail-status">Menyiapkan form edit…</div>
  }

  if (loadError || (!visit && !missingVisit)) {
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
      draftOwner={draftOwner}
      draftVisitId={visitId}
      onBusyChange={onBusyChange}
      onSaveCopy={async (input, draft) => {
        const saved = await createVisit({ ...input, photos: input.photos.map((photo) => ({ ...photo, id: undefined })) }, draft)
        onSavedCopy(saved.id)
      }}
      initialVisit={visit}
      initialPhotos={photos}
      onBack={onBack}
      onSave={handleSave}
    />
  )
}
