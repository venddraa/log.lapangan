import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  getMemberEmail,
  getMemberPassword,
  isMemberCode,
  memberCodes,
  type MemberCode,
} from './members'
import { isSupabaseConfigured, supabase } from './supabase'
import { clearSyncedCache } from '../db/sync'

export type AuthenticatedAppProps = {
  memberCode?: MemberCode
  onSignOut?: () => Promise<void>
}

type AuthGateProps = {
  children: (props: AuthenticatedAppProps) => ReactNode
}

export function AuthGate({ children }: AuthGateProps) {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured)
  const [memberCode, setMemberCode] = useState('')
  const [pin, setPin] = useState('')
  const [loginError, setLoginError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [verifiedUserId, setVerifiedUserId] = useState('')
  const [accessError, setAccessError] = useState('')

  useEffect(() => {
    if (!supabase) return

    let isMounted = true
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (isMounted) setSession(data.session)
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setIsLoading(false)
    })

    return () => {
      isMounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const userId = session?.user.id
    if (!userId || !supabase) return
    let active = true
    const checkAccess = async () => {
      if (!navigator.onLine) {
        if (localStorage.getItem('field-log-verified-member') === userId) {
          if (active) setVerifiedUserId(userId)
        } else if (active) {
          setAccessError('Hubungkan internet untuk memverifikasi akun pada perangkat ini.')
        }
        return
      }
      const result = await supabase!.from('team_members').select('member_code').single()
      if (!active) return
      if (result.error || !result.data || !isMemberCode(result.data.member_code)) {
        setAccessError('Akun belum bisa diverifikasi. Periksa koneksi atau hubungi admin.')
        return
      }
      localStorage.setItem('field-log-verified-member', userId)
      setVerifiedUserId(userId)
      setAccessError('')
    }
    void checkAccess().catch(() => {
      if (active) setAccessError('Akun belum bisa diverifikasi. Periksa koneksi dan buka ulang aplikasi.')
    })
    return () => { active = false }
  }, [session?.user.id])

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedCode = memberCode.trim().toLowerCase()
    if (!supabase || !isMemberCode(normalizedCode)) {
      setLoginError('Kode anggota atau PIN belum sesuai.')
      return
    }

    setIsSubmitting(true)
    setLoginError('')
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: getMemberEmail(normalizedCode),
        password: getMemberPassword(normalizedCode, pin),
      })
      if (error) throw error
    } catch {
      setLoginError('Kode anggota atau PIN belum sesuai.')
      setPin('')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleSignOut() {
    if (!supabase) return
    await clearSyncedCache()
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    localStorage.removeItem('field-log-verified-member')
    setVerifiedUserId('')
  }

  if (!isSupabaseConfigured) {
    if (import.meta.env.DEV) return children({})
    return <div className="auth-shell"><div className="auth-card">
      <h1>Field Log belum terhubung</h1>
      <p className="auth-copy">Konfigurasi login belum tersedia. Hubungi admin untuk mengaktifkan aplikasi.</p>
    </div></div>
  }

  if (isLoading) {
    return (
      <div className="auth-shell">
        <div className="auth-loading">Menyiapkan Field Log…</div>
      </div>
    )
  }

  if (session) {
    if (verifiedUserId !== session.user.id) {
      return <div className="auth-shell"><div className="auth-card">
        <p>{accessError || 'Memverifikasi akses divisi…'}</p>
        {accessError && <button type="button" onClick={() => window.location.reload()}>Coba lagi</button>}
      </div></div>
    }
    const activeMemberCode = session.user.email?.split('@')[0] ?? ''
    return children({
      memberCode: isMemberCode(activeMemberCode) ? activeMemberCode : undefined,
      onSignOut: handleSignOut,
    })
  }

  return (
    <div className="auth-shell">
      <main className="auth-card">
        <div className="auth-brand-mark" aria-hidden="true">
          <span />
        </div>
        <p className="auth-kicker">Field Log</p>
        <h1>Masuk ke catatan lapangan</h1>
        <p className="auth-copy">Gunakan kode anggota dan PIN yang sudah diberikan.</p>

        <form className="auth-form" onSubmit={handleLogin}>
          <label htmlFor="member-code">Kode anggota</label>
          <select
            id="member-code"
            value={memberCode}
            onChange={(event) => {
              setMemberCode(event.target.value)
              setLoginError('')
            }}
            autoComplete="username"
            required
          >
            <option value="" disabled>
              Pilih kode anggota
            </option>
            {memberCodes.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>

          <label htmlFor="member-pin">PIN</label>
          <input
            id="member-pin"
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(event) => {
              setPin(event.target.value.replace(/\D/g, '').slice(0, 4))
              setLoginError('')
            }}
            autoComplete="current-password"
            placeholder="4 digit"
            minLength={4}
            maxLength={4}
            required
          />

          {loginError && <div className="auth-error">{loginError}</div>}

          <button type="submit" disabled={isSubmitting || pin.length !== 4}>
            {isSubmitting ? 'Memeriksa…' : 'Masuk'}
          </button>
        </form>
      </main>
    </div>
  )
}
