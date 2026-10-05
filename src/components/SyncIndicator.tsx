import { useEffect, useSyncExternalStore } from 'react'
import { getSyncStatus, resolveSyncConflict, subscribeSync, syncNow } from '../db/sync'

export function SyncIndicator() {
  const status = useSyncExternalStore(subscribeSync, getSyncStatus)

  useEffect(() => {
    const sync = () => { void syncNow() }
    const onVisible = () => { if (document.visibilityState === 'visible') sync() }
    sync()
    const timer = window.setInterval(sync, 60000)
    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
    window.addEventListener('field-log-change', sync)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('online', sync)
      window.removeEventListener('offline', sync)
      window.removeEventListener('field-log-change', sync)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return (
    <div className={`sync-indicator${status.error ? ' error' : ''}`} role="status">
      <span>{status.message || 'Menyiapkan sinkronisasi…'}
        {status.pending > 0 && ` · ${status.pending} belum terkirim`}
      </span>
      <button type="button" onClick={() => { void syncNow() }} disabled={status.busy}>
        {status.busy ? 'Memproses…' : 'Sinkronkan'}
      </button>
      {status.conflictId && (
        <div className="sync-conflict-actions">
          {status.conflictOperation === 'save' && (
            <button type="button" onClick={() => {
              void resolveSyncConflict(true)
            }}>Simpan salinan lokal</button>
          )}
          <button type="button" onClick={() => {
            if (window.confirm('Buang perubahan lokal yang bertabrakan dan gunakan versi cloud?')) {
              void resolveSyncConflict(false)
            }
          }}>Gunakan versi cloud</button>
        </div>
      )}
    </div>
  )
}
