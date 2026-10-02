import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import { AppIcon } from '../components/AppIcon'
import {
  activityCategories,
  locationTypes,
  roadDirections,
  tollRoads,
} from '../data/visitOptions'
import type {
  ActivityCategory,
  CreateVisitInput,
  LocationType,
  Photo,
  Visit,
} from '../types/visit'
import { compressImage, formatFileSize } from '../utils/image'

type NewVisitPageProps = {
  onBack: () => void
  onSave: (visit: CreateVisitInput) => Promise<void>
  mode?: 'create' | 'edit'
  initialVisit?: Visit
  initialPhotos?: Photo[]
}

type PhotoDraft = {
  id: string
  blob: Blob
  previewUrl: string
  note: string
  additionalNote: string
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

export function NewVisitPage({
  onBack,
  onSave,
  mode = 'create',
  initialVisit,
  initialPhotos = [],
}: NewVisitPageProps) {
  const startedAt = useMemo(
    () => (initialVisit ? new Date(initialVisit.visitDate) : new Date()),
    [initialVisit],
  )
  const visitTime = formatVisitTime(startedAt)
  const [locationType, setLocationType] =
    useState<LocationType>(initialVisit?.primaryLocation.type ?? 'toll_gate')
  const [tollRoadId, setTollRoadId] = useState(
    initialVisit?.primaryLocation.tollRoadId ?? '',
  )
  const [customTollRoad, setCustomTollRoad] = useState(
    initialVisit?.primaryLocation.tollRoadId === 'other'
      ? (initialVisit.primaryLocation.tollRoadName ?? '')
      : '',
  )
  const [locationName, setLocationName] = useState(
    initialVisit?.primaryLocation.name ?? '',
  )
  const [locationDetail, setLocationDetail] = useState(
    initialVisit?.primaryLocation.detail ?? '',
  )
  const [direction, setDirection] = useState(
    initialVisit?.primaryLocation.direction ?? '',
  )
  const [station, setStation] = useState(
    initialVisit?.primaryLocation.station ?? '',
  )
  const [activityName, setActivityName] = useState(
    initialVisit?.activityName ?? '',
  )
  const [activityCategory, setActivityCategory] =
    useState<ActivityCategory | ''>(initialVisit?.activityCategory ?? '')
  const [notes, setNotes] = useState(initialVisit?.notes ?? '')
  const [isChecked, setIsChecked] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [photos, setPhotos] = useState<PhotoDraft[]>([])
  const [isProcessingPhotos, setIsProcessingPhotos] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const previewUrls = useRef(new Set<string>())
  const hasLoadedInitialPhotos = useRef(false)

  const locationConfig = locationTypes.find(
    (location) => location.id === locationType,
  )!

  useEffect(() => {
    const urls = previewUrls.current
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  useEffect(() => {
    if (hasLoadedInitialPhotos.current || initialPhotos.length === 0) return
    hasLoadedInitialPhotos.current = true

    const drafts = initialPhotos.map((photo) => {
      const previewUrl = URL.createObjectURL(photo.blob)
      previewUrls.current.add(previewUrl)
      return {
        id: photo.id,
        blob: photo.blob,
        previewUrl,
        note: photo.note,
        additionalNote: photo.additionalNote ?? '',
      }
    })
    setPhotos(drafts)
  }, [initialPhotos])

  async function handlePhotoSelection(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (selectedFiles.length === 0) return

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
          note: '',
          additionalNote: '',
        })
      } catch {
        setPhotoError(
          'Ada foto yang tidak dapat diproses. Coba pilih foto lain atau ambil ulang.',
        )
      }
    }

    setPhotos((currentPhotos) => [...currentPhotos, ...processedPhotos])
    setIsProcessingPhotos(false)
    setIsChecked(false)
  }

  function updatePhotoNote(
    id: string,
    field: 'note' | 'additionalNote',
    value: string,
  ) {
    setPhotos((currentPhotos) =>
      currentPhotos.map((photo) =>
        photo.id === id ? { ...photo, [field]: value } : photo,
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
    setIsChecked(false)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsChecked(false)
    setSaveError('')
    setIsSaving(true)

    const tollRoad = tollRoads.find((road) => road.id === tollRoadId)
    const tollRoadName =
      tollRoadId === 'other' ? customTollRoad.trim() : tollRoad?.name

    try {
      await onSave({
        activityName: activityName.trim(),
        activityCategory: activityCategory || undefined,
        primaryLocation: {
          type: locationType,
          typeLabel: locationConfig.label,
          tollRoadId: locationConfig.needsTollRoad ? tollRoadId : undefined,
          tollRoadName,
          name: locationName.trim(),
          detail: locationDetail.trim() || undefined,
          direction: direction || undefined,
          station: station.trim() || undefined,
        },
        notes: notes.trim(),
        visitDate: startedAt.toISOString(),
        photos: photos.map((photo) => ({
          blob: photo.blob,
          note: photo.note.trim(),
          additionalNote: photo.additionalNote.trim(),
        })),
      })
      setIsChecked(true)
    } catch {
      setSaveError('Kunjungan belum tersimpan. Coba tekan Simpan sekali lagi.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <header className="form-header">
        <button className="back-button" type="button" onClick={onBack}>
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
        <form className="visit-form" onSubmit={handleSubmit}>
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
                <select
                  id="toll-road"
                  value={tollRoadId}
                  onChange={(event) => {
                    setTollRoadId(event.target.value)
                    setIsChecked(false)
                  }}
                  required
                >
                  <option value="" disabled>
                    Pilih ruas jalan tol
                  </option>
                  {tollRoads.map((road) => (
                    <option key={road.id} value={road.id}>
                      {road.name}
                    </option>
                  ))}
                  <option value="other">Ruas lainnya</option>
                </select>

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
                <input
                  id="location-name"
                  type="text"
                  value={locationName}
                  onChange={(event) => {
                    setLocationName(event.target.value)
                    setIsChecked(false)
                  }}
                  placeholder="Contoh: GT Cibubur 1"
                  autoComplete="off"
                  required
                />
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
            <input
              id="activity-name"
              type="text"
              value={activityName}
              onChange={(event) => {
                setActivityName(event.target.value)
                setIsChecked(false)
              }}
              placeholder="Contoh: Survey titik tiang RFID"
              autoComplete="off"
              required
            />

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

          <section className="form-section" aria-labelledby="notes-heading">
            <div className="form-section-heading">
              <span>3</span>
              <div>
                <h2 id="notes-heading">Catatan umum</h2>
                <p>Ringkasan kegiatan atau informasi lintas lokasi.</p>
              </div>
            </div>
            <label className="field-label visually-hidden" htmlFor="notes">
              Catatan umum
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(event) => {
                setNotes(event.target.value)
                setIsChecked(false)
              }}
              rows={5}
              placeholder="Tulis tujuan, kondisi umum, atau tindak lanjut..."
            />
          </section>

          <section className="form-section photo-section" aria-labelledby="photo-heading">
            <div className="form-section-heading">
              <span>4</span>
              <div>
                <h2 id="photo-heading">Foto</h2>
                <p>Tambahkan dokumentasi dari kamera atau galeri.</p>
              </div>
            </div>

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
              Foto dikompresi dan disimpan hanya di perangkat ini.
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
                          updatePhotoNote(photo.id, 'note', event.target.value)
                        }
                        rows={2}
                        placeholder="Keterangan utama foto"
                      />
                      <label
                        className="field-label"
                        htmlFor={`photo-additional-note-${photo.id}`}
                      >
                        Catatan tambahan
                      </label>
                      <textarea
                        id={`photo-additional-note-${photo.id}`}
                        value={photo.additionalNote}
                        onChange={(event) =>
                          updatePhotoNote(
                            photo.id,
                            'additionalNote',
                            event.target.value,
                          )
                        }
                        rows={2}
                        placeholder="Detail pelengkap jika diperlukan"
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

          <button className="save-button" type="submit" disabled={isSaving}>
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
