'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import styles from './LoginPage.module.css'

export function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; role?: string; error?: string }
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Login failed.')
        return
      }

      if (data.role === 'ADMIN') router.push('/admin')
      else if (data.role === 'ATHLETE') router.push('/athlete')
      else if (data.role === 'COACH') router.push('/coach')
      else router.push('/')
    } catch {
      setError('Network error. Try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.brand}>
          <div className={styles.logoMark} aria-hidden="true" />
          <h1 className={styles.title}>AuroraFit</h1>
          <p className={styles.subtitle}>Sign in to continue your training.</p>
        </header>

        <section className={styles.card} aria-label="Login">
          <form onSubmit={onSubmit}>
            <div className={styles.fieldGroup}>
              <div>
                <div className={styles.labelRow}>
                  <label className={styles.label} htmlFor="email">
                    Email
                  </label>
                </div>
                <input
                  className={styles.input}
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@aurorafit.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div>
                <div className={styles.labelRow}>
                  <label className={styles.label} htmlFor="password">
                    Password
                  </label>
                  <Link className={styles.helperLink} href="/forgot-password">
                    Forgot?
                  </Link>
                </div>
                <input
                  className={styles.input}
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.checkboxRow}>
                <input
                  className={styles.checkbox}
                  id="remember"
                  name="remember"
                  type="checkbox"
                />
                <label className={styles.checkboxLabel} htmlFor="remember">
                  Remember me
                </label>
              </div>
              <Link className={styles.helperLink} href="/register">
                Create account
              </Link>
            </div>

            {error ? (
              <p className={styles.finePrint} style={{ color: 'rgb(254 202 202)' }}>
                {error}
              </p>
            ) : null}

            <button className={styles.submit} type="submit" disabled={pending}>
              {pending ? 'Signing in…' : 'Sign in'}
            </button>

            <p className={styles.finePrint}>
              By continuing you agree to our <Link href="/terms">Terms</Link> and{' '}
              <Link href="/privacy">Privacy Policy</Link>.
            </p>
          </form>
        </section>
      </div>
    </main>
  )
}

