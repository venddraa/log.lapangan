import { useEffect, useState } from 'react'
import { DraftList } from '../components/DraftList'
import { AppIcon } from '../components/AppIcon'
import { VisitCard } from '../components/VisitCard'
import { getRecentVisits } from '../db/database'
import type { VisitSummary } from '../types/visit'

type HomePageProps = {
  onOpenBackup: () => void
  draftOwner: string
  onResumeDraft: (visitId?: string) => void
  onCreateVisit: () => void
  onOpenHistory: () => void
  onOpenVisit: (id: string) => void
  onSignOut?: () => Promise<void>
}

export function HomePage({
  draftOwner, onResumeDraft, onOpenBackup,
  onCreateVisit,
  onOpenHistory,
  onOpenVisit,
  onSignOut,
}: HomePageProps) {
  const [recentVisits, setRecentVisits] = useState<VisitSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [logoutError, setLogoutError] = useState('')
  const [isSigningOut, setIsSigningOut] = useState(false)
  const today = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date())

  useEffect(() => {
    let isMounted = true

    const refresh = () => {
      void getRecentVisits()
        .then((visits) => {
          if (isMounted) setRecentVisits(visits)
        })
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
      <header className="topbar">
        <img className="brand-mark" src="/barca.jpeg" alt="" />
        <div className="brand-copy">
          <p>Log Lapangan</p>
          <span>{today}</span>
        </div>
        {onSignOut && (
          <button className="sign-out-button" type="button" disabled={isSigningOut}
            onClick={async () => {
              setIsSigningOut(true)
              setLogoutError('')
              try { await onSignOut() }
              catch (error) { setLogoutError(error instanceof Error ? error.message : 'Belum bisa keluar. Coba lagi.') }
              finally { setIsSigningOut(false) }
            }}>
            {isSigningOut ? 'Menunggu…' : 'Keluar'}
          </button>
        )}
      </header>

      <main className="page-content home-page">
        {logoutError && <p className="form-error" role="alert">{logoutError}</p>}
        <section className="welcome-panel">
          <p className="panel-label">Siap ke lapangan?</p>
          <h1>Catat kunjungan dalam satu tempat.</h1>
          <p className="panel-copy">
            Lokasi, kegiatan, catatan, dan foto tetap tersusun bersama.
          </p>
          <button className="primary-action" type="button" onClick={onCreateVisit}>
            <span className="action-icon">
              <AppIcon name="plus" size={26} />
            </span>
            <span>Kunjungan Baru</span>
            <AppIcon name="arrow" size={22} />
          </button>
        </section>

        <DraftList owner={draftOwner} onResume={onResumeDraft} />

        <section className="recent-section" aria-labelledby="recent-title">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Aktivitas</p>
              <h2 id="recent-title">Kunjungan terakhir</h2>
            </div>
            <button className="text-button" type="button" onClick={onOpenHistory}>
              Lihat semua
            </button>
          </div>

          {isLoading && <div className="recent-loading">Memuat kunjungan…</div>}

          {!isLoading && recentVisits.length === 0 && (
            <div className="empty-card">
              <div className="empty-icon">
                <AppIcon name="clipboard" size={27} />
              </div>
              <h3>Belum ada kunjungan</h3>
              <p>Kunjungan yang kamu simpan akan muncul di bagian ini.</p>
            </div>
          )}

          {!isLoading && recentVisits.length > 0 && (
            <div className="recent-list">
              {recentVisits.map((visit) => (
                <VisitCard key={visit.id} visit={visit} onOpen={onOpenVisit} />
              ))}
            </div>
          )}
        </section>
        <section className="backup-entry">
          <div><h2>Backup dokumentasi</h2><p>Simpan salinan dokumentasi bersama dan pulihkan saat dibutuhkan.</p></div>
          <button type="button" onClick={onOpenBackup}>Backup & pemulihan</button>
        </section>
      </main>
    </>
  )
}
