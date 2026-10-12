import { AppIcon } from './AppIcon'

export type AppView = 'home' | 'new' | 'history' | 'detail' | 'edit'

type BottomNavigationProps = {
  activeView: AppView
  onNavigate: (view: AppView) => void
}

export function BottomNavigation({
  activeView,
  onNavigate,
}: BottomNavigationProps) {
  return (
    <nav className="bottom-navigation" aria-label="Navigasi utama">
      <div className="desktop-nav-brand">
        <img src="/barca.jpeg" alt="" />
        <div><strong>Log Lapangan</strong><span>Dokumentasi divisi</span></div>
      </div>
      <button
        className={activeView === 'home' ? 'nav-item active' : 'nav-item'}
        type="button"
        onClick={() => onNavigate('home')}
        aria-current={activeView === 'home' ? 'page' : undefined}
      >
        <AppIcon name="home" />
        <span>Home</span>
      </button>

      <button
        className={activeView === 'new' ? 'nav-create active' : 'nav-create'}
        type="button"
        onClick={() => onNavigate('new')}
        aria-label="Kunjungan baru"
        aria-current={activeView === 'new' ? 'page' : undefined}
      >
        <AppIcon name="plus" size={28} />
        <span className="desktop-nav-label">Kunjungan Baru</span>
      </button>

      <button
        className={activeView === 'history' ? 'nav-item active' : 'nav-item'}
        type="button"
        onClick={() => onNavigate('history')}
        aria-current={activeView === 'history' ? 'page' : undefined}
      >
        <AppIcon name="history" />
        <span>Riwayat</span>
      </button>
      <p className="desktop-nav-footer">Catatan dan foto lapangan,<br />tersusun dalam satu tempat.</p>
    </nav>
  )
}
