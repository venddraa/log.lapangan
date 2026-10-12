import { useEffect, useState } from 'react'
import { AppIcon } from '../components/AppIcon'
import { VisitCard } from '../components/VisitCard'
import { getAllVisits } from '../db/database'
import type { VisitSummary } from '../types/visit'
import { SearchableSelect } from '../components/SearchableSelect'
import { getRoadLabel, tollRoads } from '../data/visitOptions'
import { emptyVisitFilters, filterVisits, roadKey, type VisitFilters } from '../utils/visitFilters'
import { activityNames } from '../utils/activityNames'

type HistoryPageProps = {
  onOpenVisit: (id: string) => void
  filters: VisitFilters
  onFiltersChange: (filters: VisitFilters) => void
}

export function HistoryPage({ onOpenVisit, filters, onFiltersChange }: HistoryPageProps) {
  const [visits, setVisits] = useState<VisitSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const roadOptions = new Map(tollRoads.map((road) => [road.id as string, getRoadLabel(road.id)]))
  visits.forEach((visit) => {
    const key = roadKey(visit)
    if (key && !roadOptions.has(key)) roadOptions.set(key, visit.primaryLocation.tollRoadName ?? key)
  })
  const locations = [...new Set(visits
    .filter((visit) => !filters.road || roadKey(visit) === filters.road)
    .map((visit) => visit.primaryLocation.name).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'id', { numeric: true }))
  const filteredVisits = filterVisits(visits, filters)
  const isFiltered = Boolean(filters.road || filters.location || filters.activity || filters.period !== 'all' || filters.query)
  const changeFilter = <K extends keyof VisitFilters>(key: K, value: VisitFilters[K]) => {
    onFiltersChange({ ...filters, [key]: value, ...(key === 'road' ? { location: '' } : {}) })
  }

  useEffect(() => {
    let isMounted = true

    const refresh = () => {
      void getAllVisits()
        .then((storedVisits) => {
          if (isMounted) { setVisits(storedVisits); setLoadError('') }
        })
        .catch(() => { if (isMounted) setLoadError('Riwayat belum bisa dimuat. Buka ulang halaman ini.') })
        .finally(() => {
          if (isMounted) setIsLoading(false)
        })
    }
    refresh()
    window.addEventListener('field-log-cloud-change', refresh)

    return () => {
      isMounted = false
      window.removeEventListener('field-log-cloud-change', refresh)
    }
  }, [])

  return (
    <>
      <header className="page-header history-header">
        <p className="section-kicker">Catatan tersimpan</p>
        <h1>Riwayat</h1>
        {!isLoading && visits.length > 0 && (
          <p className="history-count">{filteredVisits.length} dari {visits.length} kunjungan</p>
        )}
      </header>
      <main className="page-content history-page">
        <section className="history-filters" aria-label="Filter riwayat">
          <div className="history-filter-field history-search-field">
            <label className="field-label" htmlFor="history-search">Cari dokumentasi</label>
            <input id="history-search" type="search" value={filters.query}
              placeholder="Kegiatan, catatan, gardu, atau KM…"
              onChange={(event) => changeFilter('query', event.target.value)} />
          </div>
          <div className="history-filter-grid">
            <div>
              <label className="field-label" htmlFor="history-road">Ruas</label>
              <SearchableSelect id="history-road" label="Ruas" value={filters.road}
                options={[{ value: '', label: 'Semua ruas' }, ...[...roadOptions].map(([value, label]) => ({ value, label }))]}
                onChange={(value) => changeFilter('road', value)} />
            </div>
            <div>
              <label className="field-label" htmlFor="history-location">Lokasi / Gerbang</label>
              <SearchableSelect id="history-location" label="Lokasi" value={filters.location}
                options={[{ value: '', label: 'Semua lokasi' }, ...locations.map((name) => ({ value: name, label: name }))]}
                onChange={(value) => changeFilter('location', value)} />
            </div>
          </div>
          <div className="history-filter-field">
            <label className="field-label" htmlFor="history-activity">Nama kegiatan</label>
            <SearchableSelect id="history-activity" label="Nama kegiatan" value={filters.activity}
              options={[{ value: '', label: 'Semua kegiatan' }, ...activityNames(visits).map((name) => ({ value: name, label: name }))]}
              onChange={(value) => changeFilter('activity', value)} />
          </div>
          <div className="history-filter-field">
            <label className="field-label" htmlFor="history-period">Waktu</label>
            <select id="history-period" value={filters.period}
              onChange={(event) => changeFilter('period', event.target.value as VisitFilters['period'])}>
              <option value="all">Semua waktu</option>
              <option value="today">Hari ini</option>
              <option value="week">7 hari terakhir</option>
              <option value="month">Bulan ini</option>
              <option value="range">Pilih rentang tanggal</option>
            </select>
          </div>
          {filters.period === 'range' && <div className="history-filter-grid date-range">
            <div>
              <label className="field-label" htmlFor="history-start">Dari</label>
              <input id="history-start" type="date" value={filters.start} max={filters.end || undefined}
                onChange={(event) => changeFilter('start', event.target.value)} />
            </div>
            <div>
              <label className="field-label" htmlFor="history-end">Sampai</label>
              <input id="history-end" type="date" value={filters.end} min={filters.start || undefined}
                onChange={(event) => changeFilter('end', event.target.value)} />
            </div>
          </div>}
          {filters.period === 'range' && filters.start && filters.end && filters.start > filters.end &&
            <p className="filter-error" role="alert">Tanggal akhir harus sama atau sesudah tanggal awal.</p>}
          {isFiltered && <button className="clear-filters" type="button"
            onClick={() => onFiltersChange({ ...emptyVisitFilters })}>Reset filter</button>}
        </section>
        {isLoading && <div className="recent-loading">Memuat riwayat…</div>}
        {loadError && <p className="form-error" role="alert">{loadError}</p>}

        {!isLoading && !loadError && visits.length === 0 && (
          <div className="empty-card history-empty">
            <div className="empty-icon">
              <AppIcon name="history" size={27} />
            </div>
            <h3>Riwayat masih kosong</h3>
            <p>Kunjungan yang disimpan akan tersedia di halaman ini.</p>
          </div>
        )}

        {!isLoading && !loadError && visits.length > 0 && filteredVisits.length === 0 && (
          <div className="empty-card history-empty">
            <h3>Tidak ada yang cocok</h3>
            <p>Coba ruas, lokasi, waktu, atau kata pencarian lain.</p>
            <button className="text-button" type="button" onClick={() => onFiltersChange({ ...emptyVisitFilters })}>Reset filter</button>
          </div>
        )}
        {!isLoading && filteredVisits.length > 0 && (
          <div className="history-list">
            {filteredVisits.map((visit) => (
              <VisitCard key={visit.id} visit={visit} onOpen={onOpenVisit} />
            ))}
          </div>
        )}
      </main>
    </>
  )
}
