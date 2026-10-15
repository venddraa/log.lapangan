import { useEffect, useState } from 'react'
import { discardDraft, listDrafts } from '../db/drafts'
import type { DraftRecord } from '../types/draft'

type Props = { owner: string; onResume: (visitId?: string) => void }
export function DraftList({ owner, onResume }: Props) {
  const [drafts, setDrafts] = useState<DraftRecord[]>([])
  const [error, setError] = useState('')
  const [confirmId, setConfirmId] = useState('')
  useEffect(() => {
    let active = true
    const refresh = () => { void listDrafts(owner).then((items) => { if (active) setDrafts(items) })
      .catch(() => { if (active) setError('Daftar draft belum bisa dimuat. Buka ulang aplikasi.') }) }
    refresh()
    window.addEventListener('field-log-draft-change', refresh)
    return () => { active = false; window.removeEventListener('field-log-draft-change', refresh) }
  }, [owner])
  if (!drafts.length && !error) return null
  return <section className="draft-list" aria-label="Draft kunjungan">
    <div className="section-heading"><div><p className="section-kicker">Belum selesai</p><h2>Draft kunjungan</h2></div></div>
    <p className="draft-description">Tersimpan di perangkat ini. Belum dibagikan ke tim.</p>
    {error && <p role="alert" className="form-error">{error}</p>}
    {drafts.map((draft) => <article className="draft-card" key={draft.id}>
      <div><span className="draft-kind">{draft.visitId ? 'Draft edit' : 'Kunjungan baru'}</span>
        <h3>{draft.fields.activityName.trim() || 'Kegiatan belum diisi'}</h3>
        <p>{draft.fields.locationName || 'Lokasi belum diisi'} · {draft.fields.photos.length} foto</p>
        <small>Disimpan {new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(draft.updatedAt))}</small>
      </div>
      <div className="draft-actions">
        <button type="button" onClick={() => onResume(draft.visitId)}>Lanjutkan</button>
        <button type="button" onClick={() => setConfirmId(draft.id)}>Buang</button>
      </div>
      {confirmId === draft.id && <div className="draft-confirm" role="alert">
        <p>Buang isian dan foto draft ini?</p>
        <button type="button" onClick={() => { void discardDraft(draft.id, draft.revision, draft.newVisitId).then(() => setConfirmId(''))
          .catch((cause) => setError(cause instanceof Error ? cause.message : 'Draft belum bisa dibuang.')) }}>Ya, buang</button>
        <button type="button" onClick={() => setConfirmId('')}>Batal</button>
      </div>}
    </article>)}
  </section>
}
