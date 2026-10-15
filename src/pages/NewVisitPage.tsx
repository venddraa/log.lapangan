import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import { AppIcon } from '../components/AppIcon'
import { SearchableSelect } from '../components/SearchableSelect'
import {
  activityCategories,
  locationTypes,
  roadDirections,
  tollRoads,
  tollGates,
  getRoadLabel,
} from '../data/visitOptions'
import type {
  ActivityCategory,
  CreateVisitInput,
  LocationType,
  Photo,
  Visit,
} from '../types/visit'
import { compressImage, formatFileSize } from '../utils/image'
import { getAllVisits } from '../db/database'
import { activityNames, combinedPhotoNote } from '../utils/activityNames'
import { draftId, loadDraft, discardDraft, notifyDrafts } from '../db/drafts'
import { useDraftAutosave } from '../hooks/useDraftAutosave'
import type { DraftCommit, DraftFields, LoadedDraft } from '../types/draft'

const emptyPhotos: Photo[] = []

type NewVisitPageProps = {
  onBusyChange?: (busy: boolean) => void
  onBack: () => void
  onSave: (visit: CreateVisitInput, draft: DraftCommit) => Promise<void>
  onSaveCopy?: (visit: CreateVisitInput, draft: DraftCommit) => Promise<void>
  draftOwner: string
  draftVisitId?: string
  mode?: 'create' | 'edit'
  initialVisit?: Visit
  initialPhotos?: Photo[]
}

type PhotoDraft = {
  id: string
  blob: Blob
  previewUrl: string
  note: string
}

function formatVisitTime(date: Date) {
  return {
    date: new Intl.DateTimeFormat('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date),
    time: new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date),
  }
}

function getLastRoad() {
  try {
    const id = localStorage.getItem('field-log-last-road')
    return tollRoads.some((road) => road.id === id) ? id! : ''
  } catch { return '' }
}

export function NewVisitPage(props: NewVisitPageProps) {
  const id = draftId(props.draftOwner, props.initialVisit?.id ?? props.draftVisitId)
  const [loaded, setLoaded] = useState<{ id: string; draft?: LoadedDraft }>()
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    void loadDraft(id).then((draft) => { if (active) setLoaded({ id, draft }) })
      .catch(() => { if (active) setLoadError('Draft belum bisa dibuka. Periksa ruang penyimpanan lalu coba lagi.') })
    return () => { active = false }
  }, [id, reload])
  if (loadError) return <div className="detail-status error-state"><p>{loadError}</p>
    <button type="button" onClick={() => { setLoadError(''); setReload((value) => value + 1) }}>Coba lagi</button>
    <button type="button" onClick={props.onBack}>Kembali</button></div>
  if (loaded?.id !== id) return <div className="detail-status">Menyiapkan draft…</div>
  return <VisitForm key={`${id}:${reload}`} {...props} initialDraft={loaded.draft}
    onDiscarded={() => {
      if (props.mode === 'edit' && !props.initialVisit) { props.onBack(); return }
      setLoaded(undefined); setReload((value) => value + 1)
    }} />
}

function VisitForm({ onBack, onSave, onSaveCopy, onBusyChange, draftOwner, draftVisitId, mode = 'create', initialVisit,
  initialPhotos = emptyPhotos, initialDraft, onDiscarded,
}: NewVisitPageProps & { initialDraft?: LoadedDraft; onDiscarded: () => void }) {
  const restored = initialDraft?.fields
  const sourceVisitId = initialVisit?.id ?? draftVisitId
  const [startedAt] = useState(() => restored?.startedAt
    ? new Date(restored.startedAt) : initialVisit ? new Date(initialVisit.visitDate) : new Date())
  const [newVisitId] = useState(() => initialDraft?.newVisitId ?? crypto.randomUUID())
  const visitTime = formatVisitTime(startedAt)
  const [locationType, setLocationType] =
    useState<LocationType>(restored?.locationType ?? initialVisit?.primaryLocation.type ?? 'toll_gate')
  const [tollRoadId, setTollRoadId] = useState(
    restored?.tollRoadId ?? initialVisit?.primaryLocation.tollRoadId ?? (mode === 'create' ? getLastRoad() : ''),
  )
  const [customTollRoad, setCustomTollRoad] = useState(
    restored?.customTollRoad ?? (initialVisit?.primaryLocation.tollRoadId === 'other'
      ? (initialVisit.primaryLocation.tollRoadName ?? '')
      : ''),
  )
  const [locationName, setLocationName] = useState(
    restored?.locationName ?? initialVisit?.primaryLocation.name ?? '',
  )
  const [locationDetail, setLocationDetail] = useState(
    restored?.locationDetail ?? initialVisit?.primaryLocation.detail ?? '',
  )
  const [gateChoice, setGateChoice] = useState(() => {
    if (restored) return restored.gateChoice
    const name = initialVisit?.primaryLocation.name ?? ''
    return name && initialVisit?.primaryLocation.type === 'toll_gate'
      ? (tollGates[initialVisit.primaryLocation.tollRoadId ?? '']?.includes(name) ? name : '__other__')
      : ''
  })
  const [direction, setDirection] = useState(
    restored?.direction ?? initialVisit?.primaryLocation.direction ?? '',
  )
  const [station, setStation] = useState(
    restored?.station ?? initialVisit?.primaryLocation.station ?? '',
  )
  const [activityName, setActivityName] = useState(
    restored?.activityName ?? initialVisit?.activityName ?? '',
  )
  const [activityCategory, setActivityCategory] =
    useState<ActivityCategory | ''>(restored?.activityCategory ?? initialVisit?.activityCategory ?? '')
  const notes = initialVisit?.notes ?? ''
  const [pendingNote, setPendingNote] = useState(restored?.pendingNote ?? '')
  const [previousActivities, setPreviousActivities] = useState<string[]>([])
  const [isChecked, setIsChecked] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [photos, setPhotos] = useState<PhotoDraft[]>([])
  const [isProcessingPhotos, setIsProcessingPhotos] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const previewUrls = useRef(new Set<string>())
  const [photosReady, setPhotosReady] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const locationConfig = locationTypes.find(
    (location) => location.id === locationType,
  )!

  useEffect(() => {
    let mounted = true
    const refresh = () => { void getAllVisits().then((visits) => {
      if (mounted) setPreviousActivities(activityNames(visits))
    }).catch(() => { /* Free typing remains available if history cannot load. */ }) }
    refresh()
    window.addEventListener('field-log-cloud-change', refresh)
    window.addEventListener('field-log-change', refresh)
    return () => {
      mounted = false
      window.removeEventListener('field-log-cloud-change', refresh)
      window.removeEventListener('field-log-change', refresh)
    }
  }, [])

  useEffect(() => {
    const urls = previewUrls.current
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url))
      urls.clear()
    }
  }, [])

  useEffect(() => {
    const drafts = (restored?.photos ?? initialPhotos).map((photo) => {
      const previewUrl = URL.createObjectURL(photo.blob)
      previewUrls.current.add(previewUrl)
      return {
        id: photo.id,
        blob: photo.blob,
        previewUrl,
        note: combinedPhotoNote(photo),
      }
    })
    setPhotos(drafts)
    setPhotosReady(true)
  }, [initialPhotos, restored])

  const fields = useMemo<DraftFields>(() => ({
    startedAt: startedAt.toISOString(), locationType, tollRoadId, customTollRoad,
    locationName, locationDetail, gateChoice, direction, station, activityName, activityCategory,
    pendingNote, photos: photos.map(({ id, blob, note }) => ({ id, blob, note })),
  }), [startedAt, locationType, tollRoadId, customTollRoad, locationName, locationDetail,
    gateChoice, direction, station, activityName, activityCategory, pendingNote, photos])
  const { session, status: draftStatus } = useDraftAutosave({
    id: draftId(draftOwner, sourceVisitId), owner: draftOwner, visitId: sourceVisitId,
    baseUpdatedAt: initialDraft?.baseUpdatedAt ?? initialVisit?.updatedAt,
    newVisitId, revision: initialDraft?.revision ?? 0,
  }, fields, photosReady)
  const staleDraft = Boolean(mode === 'edit' && initialDraft && (!initialVisit || initialDraft.baseUpdatedAt !== initialVisit.updatedAt))

  useEffect(() => {
    onBusyChange?.(isProcessingPhotos || isSaving)
    return () => { onBusyChange?.(false) }
  }, [onBusyChange, isProcessingPhotos, isSaving])
  useEffect(() => {
    if (!isProcessingPhotos && draftStatus.kind !== 'saving' && draftStatus.kind !== 'error') return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [isProcessingPhotos, draftStatus.kind])

  async function handleDiscardDraft() {
    try {
      const revision = await session.closeForDiscard()
      await discardDraft(draftId(draftOwner, sourceVisitId), revision, newVisitId)
      onDiscarded()
    } catch (error) { setSaveError(error instanceof Error ? error.message : 'Draft belum bisa dibuang.') }
  }

  async function handlePhotoSelection(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (selectedFiles.length === 0) return

    const noteForSelection = selectedFiles.length === 1 ? pendingNote.trim() : ''
    setPhotoError('')
    setIsProcessingPhotos(true)
    const processedPhotos: PhotoDraft[] = []

    for (const file of selectedFiles) {
      if (!file.type.startsWith('image/')) continue

      try {
        const blob = await compressImage(file)
        const previewUrl = URL.createObjectURL(blob)
        previewUrls.current.add(previewUrl)
        processedPhotos.push({
          id: crypto.randomUUID(),
          blob,
          previewUrl,
          note: noteForSelection,
        })
      } catch {
        setPhotoError(
          'Ada foto yang tidak dapat diproses. Coba pilih foto lain atau ambil ulang.',
        )
      }
    }

    setPhotos((currentPhotos) => [...currentPhotos, ...processedPhotos])
    if (processedPhotos.length && selectedFiles.length === 1) setPendingNote('')
    setIsProcessingPhotos(false)
    setIsChecked(false)
  }

  function updatePhotoNote(
    id: string,
    value: string,
  ) {
    setPhotos((currentPhotos) =>
      currentPhotos.map((photo) =>
        photo.id === id ? { ...photo, note: value } : photo,
      ),
    )
    setIsChecked(false)
  }

  function removePhoto(id: string) {
    setPhotos((currentPhotos) => {
      const removedPhoto = currentPhotos.find((photo) => photo.id === id)
      if (removedPhoto) {
        URL.revokeObjectURL(removedPhoto.previewUrl)
        previewUrls.current.delete(removedPhoto.previewUrl)
      }
      return currentPhotos.filter((photo) => photo.id !== id)
    })
    setIsChecked(false)
  }

  function changeLocationType(type: LocationType) {
    setLocationType(type)
    setLocationName('')
    setLocationDetail('')
    setDirection('')
    setStation('')
    setGateChoice('')
    setIsChecked(false)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsChecked(false)
    setSaveError('')
    if (pendingNote.trim()) {
      setSaveError('Catatan belum dipasangkan ke foto. Ambil/pilih satu foto, atau kosongkan catatan sebelum menyimpan.')
      return
    }
    const saveCopy = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'copy'
    if (staleDraft && !saveCopy) { setSaveError('Kunjungan sudah berubah. Simpan sebagai kunjungan baru atau buang draft untuk memuat data terbaru.'); return }
    if (isSaving || isProcessingPhotos) return
    setIsSaving(true)

    const tollRoad = tollRoads.find((road) => road.id === tollRoadId)
    const tollRoadName =
      tollRoadId === 'other' ? customTollRoad.trim() : tollRoad?.name

    try {
      const commit = await session.flush()
      const save = saveCopy && onSaveCopy ? onSaveCopy : onSave
      await save({
        activityName: activityName.trim(),
        activityCategory: activityCategory || undefined,
        primaryLocation: {
          type: locationType,
          typeLabel: locationConfig.label,
          tollRoadId: locationConfig.needsTollRoad ? tollRoadId : undefined,
          tollRoadName: locationConfig.needsTollRoad ? tollRoadName : undefined,
          name: locationName.trim(),
          detail: locationDetail.trim() || undefined,
          direction: direction || undefined,
          station: station.trim() || undefined,
        },
        notes: notes.trim(),
        visitDate: startedAt.toISOString(),
        photos: photos.map((photo) => ({
          id: photo.id,
          blob: photo.blob,
          note: photo.note.trim(),
          additionalNote: '',
        })),
      }, commit)
      session.stop()
      notifyDrafts()
      if (locationConfig.needsTollRoad && tollRoadId !== 'other') {
        try { localStorage.setItem('field-log-last-road', tollRoadId) } catch { /* Saving a visit must not depend on preferences. */ }
      }
      setIsChecked(true)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Kunjungan belum tersimpan. Coba tekan Simpan sekali lagi.')
    } finally {
      setIsSaving(false)
    }
  }

  if (!photosReady) return <div className="detail-status">Memuat foto draft…</div>

  return (
    <>
      <header className="form-header">
        <button className="back-button" type="button" disabled={isSaving || isProcessingPhotos} onClick={onBack}>
          <AppIcon name="arrow" size={22} />
          <span>Kembali</span>
        </button>
        <p className="section-kicker">
          {mode === 'edit' ? 'Perbarui dokumentasi' : 'Dokumentasi lapangan'}
        </p>
        <h1>{mode === 'edit' ? 'Edit Kunjungan' : 'Kunjungan Baru'}</h1>
        <div className="auto-time" aria-label="Waktu kunjungan">
          <div>
            <span>Tanggal</span>
            <strong>{visitTime.date}</strong>
          </div>
          <div>
            <span>Jam</span>
            <strong>{visitTime.time}</strong>
          </div>
        </div>
      </header>

      <main className="page-content form-page">
        <form className="visit-form" onSubmit={handleSubmit} inert={isSaving}>
          <section className={`draft-notice ${draftStatus.kind}`} aria-label="Draft otomatis">
            <div role={draftStatus.kind === 'error' ? 'alert' : 'status'}>{draftStatus.message}</div>
            {staleDraft && <p>Kunjungan ini sudah berubah atau tidak tersedia. Draft tetap ada; simpan sebagai kunjungan baru agar data terbaru tidak tertimpa.</p>}
            <div className="draft-actions">
              {draftStatus.kind === 'error' && <button type="button" onClick={() => void session.retry()}>Coba simpan draft</button>}
              <button type="button" disabled={isSaving || isProcessingPhotos} onClick={() => setConfirmDiscard(true)}>Buang draft</button>
            </div>
            {confirmDiscard && <div className="draft-confirm" role="alert">
              <p>Buang isian dan foto draft ini? Kunjungan yang sudah disimpan tetap ada.</p>
              <button type="button" onClick={() => void handleDiscardDraft()}>Ya, buang draft</button>
              <button type="button" onClick={() => setConfirmDiscard(false)}>Batal</button>
            </div>}
          </section>
          <section className="form-section" aria-labelledby="location-heading">
            <div className="form-section-heading">
              <span>1</span>
              <div>
                <h2 id="location-heading">Titik utama</h2>
                <p>Pilih lokasi awal kegiatan ini.</p>
              </div>
            </div>

            <fieldset className="location-type-fieldset">
              <legend className="field-label">Jenis lokasi</legend>
              <div className="location-type-options">
                {locationTypes.map((location) => (
                  <label
                    className={
                      locationType === location.id
                        ? 'location-type-option selected'
                        : 'location-type-option'
                    }
                    key={location.id}
                  >
                    <input
                      type="radio"
                      name="locationType"
                      value={location.id}
                      checked={locationType === location.id}
                      onChange={() => changeLocationType(location.id)}
                    />
                    <span>{location.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {locationConfig.needsTollRoad && (
              <>
                <label className="field-label" htmlFor="toll-road">
                  Ruas <span>*</span>
                </label>
                <SearchableSelect
                  id="toll-road"
                  label="Ruas"
                  value={tollRoadId}
                  options={[
                    ...tollRoads.map((road) => ({ value: road.id, label: getRoadLabel(road.id) })),
                    { value: 'other', label: 'Ruas lainnya' },
                  ]}
                  placeholder="Pilih ruas jalan tol"
                  onChange={(value) => {
                    if (value === tollRoadId) return
                    setTollRoadId(value)
                    setGateChoice('')
                    setLocationName('')
                    setLocationDetail('')
                    setIsChecked(false)
                  }}
                  required
                />

                {tollRoadId === 'other' && (
                  <div className="conditional-field">
                    <label className="field-label" htmlFor="custom-toll-road">
                      Nama Ruas <span>*</span>
                    </label>
                    <input
                      id="custom-toll-road"
                      type="text"
                      value={customTollRoad}
                      onChange={(event) => {
                        setCustomTollRoad(event.target.value)
                        setIsChecked(false)
                      }}
                      placeholder="Contoh: Semarang–Solo"
                      autoComplete="off"
                      required
                    />
                  </div>
                )}
              </>
            )}

            {locationType === 'toll_gate' && (
              <>
                <label className="field-label" htmlFor="location-name">
                  Nama Gerbang Tol <span>*</span>
                </label>
                <SearchableSelect
                  id="location-name"
                  label="Gerbang tol"
                  value={gateChoice}
                  options={[
                    ...(tollGates[tollRoadId] ?? []).map((gate) => ({ value: gate, label: gate })),
                    { value: '__other__', label: 'Gerbang lainnya · isi manual' },
                  ]}
                  onChange={(value) => {
                    if (value === gateChoice) return
                    setGateChoice(value)
                    setLocationName(value === '__other__' ? '' : value)
                    setLocationDetail('')
                    setIsChecked(false)
                  }}
                  placeholder={tollRoadId ? 'Pilih gerbang tol' : 'Pilih ruas terlebih dahulu'}
                  disabled={!tollRoadId}
                  required
                />
                {gateChoice === '__other__' && <div className="conditional-field">
                  <label className="field-label" htmlFor="custom-gate">Nama gerbang <span>*</span></label>
                  <input id="custom-gate" type="text" value={locationName}
                    placeholder="Tuliskan nama gerbang" autoComplete="off" required
                    onChange={(event) => { setLocationName(event.target.value); setIsChecked(false) }} />
                </div>}
                <label className="field-label" htmlFor="location-detail">
                  Gardu / Lajur
                </label>
                <input
                  id="location-detail"
                  type="text"
                  value={locationDetail}
                  onChange={(event) => {
                    setLocationDetail(event.target.value)
                    setIsChecked(false)
                  }}
                  placeholder="Opsional, contoh: Gardu 04"
                  autoComplete="off"
                />
              </>
            )}

            {(locationType === 'main_road' || locationType === 'gantry') && (
              <>
                <label className="field-label" htmlFor="location-name">
                  {locationType === 'gantry' ? 'Nama / Kode Gantry' : 'Patokan Lokasi'}{' '}
                  {locationType === 'gantry' && <span>*</span>}
                </label>
                <input
                  id="location-name"
                  type="text"
                  value={locationName}
                  onChange={(event) => {
                    setLocationName(event.target.value)
                    setIsChecked(false)
                  }}
                  placeholder={
                    locationType === 'gantry'
                      ? 'Contoh: Gantry VMS KM 10'
                      : 'Opsional, contoh: dekat SS Sentul'
                  }
                  autoComplete="off"
                  required={locationType === 'gantry'}
                />
                <div className="field-row">
                  <div>
                    <label className="field-label" htmlFor="direction">
                      Jalur / Arah <span>*</span>
                    </label>
                    <select
                      id="direction"
                      value={direction}
                      onChange={(event) => {
                        setDirection(event.target.value)
                        setIsChecked(false)
                      }}
                      required
                    >
                      <option value="" disabled>
                        Pilih jalur
                      </option>
                      {roadDirections.map((roadDirection) => (
                        <option key={roadDirection} value={roadDirection}>
                          {roadDirection}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="field-label" htmlFor="station">
                      STA / KM
                    </label>
                    <input
                      id="station"
                      type="text"
                      value={station}
                      onChange={(event) => {
                        setStation(event.target.value)
                        setIsChecked(false)
                      }}
                      placeholder="10+200"
                      inputMode="decimal"
                    />
                  </div>
                </div>
              </>
            )}

            {(locationType === 'ro_office' ||
              locationType === 'area_office' ||
              locationType === 'other') && (
              <>
                <label className="field-label" htmlFor="location-name">
                  {locationType === 'ro_office'
                    ? 'Nama Kantor RO'
                    : locationType === 'area_office'
                      ? 'Nama Kantor Area'
                      : 'Nama Lokasi'}{' '}
                  <span>*</span>
                </label>
                <input
                  id="location-name"
                  type="text"
                  value={locationName}
                  onChange={(event) => {
                    setLocationName(event.target.value)
                    setIsChecked(false)
                  }}
                  placeholder={
                    locationType === 'other'
                      ? 'Tuliskan lokasi kegiatan'
                      : 'Contoh: RO Jagorawi'
                  }
                  autoComplete="off"
                  required
                />
              </>
            )}

            <div className="inheritance-note">
              Semua foto otomatis mengikuti titik utama kunjungan ini.
            </div>
          </section>

          <section className="form-section" aria-labelledby="activity-heading">
            <div className="form-section-heading">
              <span>2</span>
              <div>
                <h2 id="activity-heading">Kegiatan</h2>
                <p>Tulis kegiatan secara spesifik.</p>
              </div>
            </div>

            <label className="field-label" htmlFor="activity-name">
              Nama Kegiatan <span>*</span>
            </label>
            <SearchableSelect id="activity-name" label="Nama kegiatan" value={activityName}
              options={previousActivities.map((name) => ({ value: name, label: name }))}
              onChange={(value) => { setActivityName(value); setIsChecked(false) }}
              placeholder="Contoh: Survey titik tiang RFID" allowCustom required />
            <p className="field-hint">Ketik nama baru atau pilih kegiatan sebelumnya.</p>

            <div className="optional-label-row">
              <span className="field-label">Kategori</span>
              {activityCategory ? (
                <button
                  type="button"
                  onClick={() => {
                    setActivityCategory('')
                    setIsChecked(false)
                  }}
                >
                  Hapus pilihan
                </button>
              ) : (
                <span>Opsional</span>
              )}
            </div>
            <div className="activity-options">
              {activityCategories.map((category) => (
                <label
                  className={
                    activityCategory === category
                      ? 'activity-option selected'
                      : 'activity-option'
                  }
                  key={category}
                >
                  <input
                    type="radio"
                    name="activityCategory"
                    value={category}
                    checked={activityCategory === category}
                    onChange={() => {
                      setActivityCategory(category)
                      setIsChecked(false)
                    }}
                  />
                  <span>{category}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="form-section photo-section" aria-labelledby="photo-heading">
            <div className="form-section-heading">
              <span>3</span>
              <div>
                <h2 id="photo-heading">Foto</h2>
                <p>Satu foto, satu catatan. Isi dulu, lalu ambil foto.</p>
              </div>
            </div>

            <label className="field-label" htmlFor="pending-photo-note">Catatan</label>
            <textarea id="pending-photo-note" value={pendingNote}
              onChange={(event) => { setPendingNote(event.target.value); setIsChecked(false) }} disabled={isProcessingPhotos}
              rows={3} placeholder="Contoh: Posisi rencana tiang RFID" />
            <p className="field-hint">Opsional. Untuk beberapa foto dari galeri, isi catatan masing-masing setelah dipilih.</p>

            <div className="photo-actions">
              <label className="photo-action primary-photo-action">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoSelection}
                  disabled={isProcessingPhotos}
                />
                <span className="photo-action-symbol" aria-hidden="true">◎</span>
                <span>Ambil Foto</span>
              </label>
              <label className="photo-action secondary-photo-action">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoSelection}
                  disabled={isProcessingPhotos}
                />
                <span className="photo-action-symbol" aria-hidden="true">▧</span>
                <span>Pilih Galeri</span>
              </label>
            </div>

            <p className="photo-privacy-note">
              Foto dikompresi di perangkat, lalu disinkronkan saat online.
            </p>

            {isProcessingPhotos && (
              <div className="photo-processing" role="status">
                Memproses foto…
              </div>
            )}

            {photoError && (
              <div className="form-error photo-error" role="alert">
                {photoError}
              </div>
            )}

            {photos.length > 0 && (
              <div className="photo-list">
                {photos.map((photo, index) => (
                  <article className="photo-card" key={photo.id}>
                    <div className="photo-preview-wrap">
                      <img
                        className="photo-preview"
                        src={photo.previewUrl}
                        alt={`Preview foto ${index + 1}`}
                      />
                      <span className="photo-number">Foto {index + 1}</span>
                      <button
                        className="remove-photo-button"
                        type="button"
                        onClick={() => removePhoto(photo.id)}
                        aria-label={`Hapus foto ${index + 1}`}
                      >
                        Hapus
                      </button>
                      <span className="photo-size">
                        {formatFileSize(photo.blob.size)}
                      </span>
                    </div>
                    <div className="photo-fields">
                      <label className="field-label" htmlFor={`photo-note-${photo.id}`}>
                        Catatan
                      </label>
                      <textarea
                        id={`photo-note-${photo.id}`}
                        value={photo.note}
                        onChange={(event) =>
                          updatePhotoNote(photo.id, event.target.value)
                        }
                        rows={2}
                        placeholder="Keterangan utama foto"
                      />
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {isChecked && (
            <div className="form-success" role="status">
              {mode === 'edit'
                ? 'Perubahan tersimpan di perangkat.'
                : 'Kunjungan tersimpan di perangkat.'}
            </div>
          )}

          {saveError && (
            <div className="form-error" role="alert">
              {saveError}
            </div>
          )}

          {onSaveCopy && (staleDraft || saveError.includes('sudah berubah')) &&
            <button className="save-button" type="submit" value="copy" disabled={isSaving || isProcessingPhotos}>Simpan sebagai kunjungan baru</button>}
          <button className="save-button" type="submit" disabled={isSaving || isProcessingPhotos || staleDraft}>
            {isSaving
              ? 'Menyimpan…'
              : mode === 'edit'
                ? 'Simpan Perubahan'
                : 'Simpan Kunjungan'}
          </button>
        </form>
      </main>
    </>
  )
}
