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
import type { DraftCommit } from './types/draft'
import type { CreateVisitInput } from './types/visit'
import type { AuthenticatedAppProps } from './auth/AuthGate'
import { SyncIndicator } from './components/SyncIndicator'
import { emptyVisitFilters, type VisitFilters } from './utils/visitFilters'
import './App.css'

function App({ onSignOut, memberCode }: AuthenticatedAppProps) {
  const draftOwner = memberCode ?? 'local'
  const [formBusy, setFormBusy] = useState(false)
  const [activeView, setActiveView] = useState<AppView>('home')
  const [selectedVisitId, setSelectedVisitId] = useState<string>()
  const [detailOrigin, setDetailOrigin] = useState<'home' | 'history'>('home')
  const [historyFilters, setHistoryFilters] = useState<VisitFilters>({ ...emptyVisitFilters })

  async function handleSaveVisit(visit: CreateVisitInput, draft: DraftCommit) {
    await createVisit(visit, draft)
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
        {onSignOut && <SyncIndicator />}
        {activeView === 'home' && (
          <HomePage
            draftOwner={draftOwner}
            onResumeDraft={(visitId) => {
              if (visitId) { setSelectedVisitId(visitId); setDetailOrigin('home'); setActiveView('edit') }
              else setActiveView('new')
            }}
            onCreateVisit={() => setActiveView('new')}
            onOpenHistory={() => setActiveView('history')}
            onOpenVisit={(id) => handleOpenVisit(id, 'home')}
            onSignOut={onSignOut}
          />
        )}
        {activeView === 'new' && (
          <NewVisitPage
            draftOwner={draftOwner}
            onBusyChange={setFormBusy}
            onBack={() => setActiveView('home')}
            onSave={handleSaveVisit}
          />
        )}
        {activeView === 'history' && (
          <HistoryPage onOpenVisit={(id) => handleOpenVisit(id, 'history')}
            filters={historyFilters} onFiltersChange={setHistoryFilters} />
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
            draftOwner={draftOwner}
            onBusyChange={setFormBusy}
            onSavedCopy={(id) => handleOpenVisit(id, detailOrigin)}
            visitId={selectedVisitId}
            onBack={() => setActiveView('detail')}
            onSaved={() => setActiveView('detail')}
          />
        )}

        <BottomNavigation activeView={activeView} onNavigate={setActiveView} disabled={formBusy} />
      </div>
    </div>
  )
}

export default App
