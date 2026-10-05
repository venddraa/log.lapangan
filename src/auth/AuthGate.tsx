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

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedCode = memberCode.trim().toLowerCase()
    if (!supabase || !isMemberCode(normalizedCode)) {
      setLoginError('Kode anggota atau PIN belum sesuai.')
      return
    }

    setIsSubmitting(true)
    setLoginError('')
    const { error } = await supabase.auth.signInWithPassword({
      email: getMemberEmail(normalizedCode),
      password: getMemberPassword(normalizedCode, pin),
    })

    if (error) {
      setLoginError('Kode anggota atau PIN belum sesuai.')
      setPin('')
    }
    setIsSubmitting(false)
  }

  async function handleSignOut() {
    if (!supabase) return
    await supabase.auth.signOut()
  }

  if (!isSupabaseConfigured) return children({})

  if (isLoading) {
    return (
      <div className="auth-shell">
        <div className="auth-loading">Menyiapkan Field Log…</div>
      </div>
    )
  }

  if (session) {
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
