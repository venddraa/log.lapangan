import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react'
import { DraftSession } from '../db/draftSession'
import type { DraftFields, DraftRecord } from '../types/draft'

export function useDraftAutosave(meta: Omit<DraftRecord, 'fields' | 'updatedAt'>, fields: DraftFields, ready: boolean) {
  const [session] = useState(() => new DraftSession(meta))
  const status = useSyncExternalStore(session.subscribe, session.getStatus)
  useLayoutEffect(() => { if (ready) session.observe(fields) }, [session, fields, ready])
  useEffect(() => {
    const flush = () => { if (ready) void session.flush().catch(() => {}) }
    const hidden = () => { if (document.visibilityState === 'hidden' && status.kind === 'saving') flush() }
    // Writes start on each change; these also finish pending work when the browser allows it.
    window.addEventListener('pagehide', hidden)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      window.removeEventListener('pagehide', hidden)
      document.removeEventListener('visibilitychange', hidden)
    }
  }, [session, ready, status.kind])
  return { session, status }
}
