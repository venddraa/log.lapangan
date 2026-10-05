import { useState } from 'react'
import {
  BottomNavigation,
  type AppView,
} from './components/BottomNavigation'
import { createVisit, deleteVisit } from './db/database'
import { EditVisitPage } from './pages/EditVisitPage'
import { HistoryPage } from './pages/HistoryPage'
import { HomePage } from './pages/HomePage'
import { NewVisitPage } from './pages/NewVisitPage'
import { VisitDetailPage } from './pages/VisitDetailPage'
import type { CreateVisitInput } from './types/visit'
import type { AuthenticatedAppProps } from './auth/AuthGate'
import './App.css'

function App({ onSignOut }: AuthenticatedAppProps) {
  const [activeView, setActiveView] = useState<AppView>('home')
  const [selectedVisitId, setSelectedVisitId] = useState<string>()
  const [detailOrigin, setDetailOrigin] = useState<'home' | 'history'>('home')

  async function handleSaveVisit(visit: CreateVisitInput) {
    await createVisit(visit)
    setActiveView('home')
  }

  function handleOpenVisit(id: string, origin: 'home' | 'history') {
    setSelectedVisitId(id)
    setDetailOrigin(origin)
    setActiveView('detail')
  }

  async function handleDeleteVisit() {
    if (!selectedVisitId) return
    await deleteVisit(selectedVisitId)
    setSelectedVisitId(undefined)
    setActiveView('history')
  }

  return (
    <div className="app-shell">
      <div className="app-frame">
        {activeView === 'home' && (
          <HomePage
            onCreateVisit={() => setActiveView('new')}
            onOpenHistory={() => setActiveView('history')}
            onOpenVisit={(id) => handleOpenVisit(id, 'home')}
            onSignOut={onSignOut}
          />
        )}
        {activeView === 'new' && (
          <NewVisitPage
            onBack={() => setActiveView('home')}
            onSave={handleSaveVisit}
          />
        )}
        {activeView === 'history' && (
          <HistoryPage onOpenVisit={(id) => handleOpenVisit(id, 'history')} />
        )}
        {activeView === 'detail' && selectedVisitId && (
          <VisitDetailPage
            visitId={selectedVisitId}
            onBack={() => setActiveView(detailOrigin)}
            onEdit={() => setActiveView('edit')}
            onDelete={handleDeleteVisit}
          />
        )}
        {activeView === 'edit' && selectedVisitId && (
          <EditVisitPage
            visitId={selectedVisitId}
            onBack={() => setActiveView('detail')}
            onSaved={() => setActiveView('detail')}
          />
        )}

        <BottomNavigation activeView={activeView} onNavigate={setActiveView} />
      </div>
    </div>
  )
}

export default App
