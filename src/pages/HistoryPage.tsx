import { useEffect, useState } from 'react'
import { AppIcon } from '../components/AppIcon'
import { VisitCard } from '../components/VisitCard'
import { getAllVisits } from '../db/database'
import type { VisitSummary } from '../types/visit'

type HistoryPageProps = {
  onOpenVisit: (id: string) => void
}

export function HistoryPage({ onOpenVisit }: HistoryPageProps) {
  const [visits, setVisits] = useState<VisitSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    getAllVisits()
      .then((storedVisits) => {
        if (isMounted) setVisits(storedVisits)
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [])

  return (
    <>
      <header className="page-header history-header">
        <p className="section-kicker">Catatan tersimpan</p>
        <h1>Riwayat</h1>
        {!isLoading && visits.length > 0 && (
          <p className="history-count">{visits.length} kunjungan tersimpan</p>
        )}
      </header>
      <main className="page-content history-page">
        {isLoading && <div className="recent-loading">Memuat riwayat…</div>}

        {!isLoading && visits.length === 0 && (
          <div className="empty-card history-empty">
            <div className="empty-icon">
              <AppIcon name="history" size={27} />
            </div>
            <h3>Riwayat masih kosong</h3>
            <p>Kunjungan yang disimpan akan tersedia di halaman ini.</p>
          </div>
        )}

        {!isLoading && visits.length > 0 && (
          <div className="history-list">
            {visits.map((visit) => (
              <VisitCard key={visit.id} visit={visit} onOpen={onOpenVisit} />
            ))}
          </div>
        )}
      </main>
    </>
  )
}
