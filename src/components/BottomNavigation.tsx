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
      <button
        className={activeView === 'home' ? 'nav-item active' : 'nav-item'}
        type="button"
        onClick={() => onNavigate('home')}
      >
        <AppIcon name="home" />
        <span>Home</span>
      </button>

      <button
        className={activeView === 'new' ? 'nav-create active' : 'nav-create'}
        type="button"
        onClick={() => onNavigate('new')}
        aria-label="Kunjungan baru"
      >
        <AppIcon name="plus" size={28} />
      </button>

      <button
        className={activeView === 'history' ? 'nav-item active' : 'nav-item'}
        type="button"
        onClick={() => onNavigate('history')}
      >
        <AppIcon name="history" />
        <span>Riwayat</span>
      </button>
    </nav>
  )
}
