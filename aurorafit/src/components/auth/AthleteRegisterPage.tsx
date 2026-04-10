'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import styles from './AthleteRegisterPage.module.css'

export function AthleteRegisterPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setPending(true)
    try {
      const res = await fetch('/api/auth/register/athlete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          fullName: fullName.trim() || undefined,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Registration failed.')
        return
      }
      setSuccess('Account created. You can sign in.')
      setTimeout(() => router.push('/login'), 1200)
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
          <h1 className={styles.title}>Athlete sign up</h1>
          <p className={styles.subtitle}>Create your AuroraFit athlete account.</p>
        </header>

        <section className={styles.card} aria-label="Athlete registration">
          <form onSubmit={onSubmit}>
            <div className={styles.fieldGroup}>
              <div>
                <label className={styles.label} htmlFor="fullName">
                  Full name
                </label>
                <input
                  className={styles.input}
                  id="fullName"
                  name="fullName"
                  type="text"
                  autoComplete="name"
                  placeholder="Alex Rivera"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div>
                <label className={styles.label} htmlFor="email">
                  Email
                </label>
                <input
                  className={styles.input}
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <label className={styles.label} htmlFor="password">
                  Password
                </label>
                <input
                  className={styles.input}
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <p className={styles.hint}>Minimum 8 characters.</p>
              </div>
            </div>

            {error ? <p className={styles.error}>{error}</p> : null}
            {success ? <p className={styles.success}>{success}</p> : null}

            <button className={styles.submit} type="submit" disabled={pending}>
              {pending ? 'Creating account…' : 'Create athlete account'}
            </button>

            <div className={styles.row}>
              <Link className={styles.helperLink} href="/register/coach">
                Coach? Register with a key
              </Link>
              <Link className={styles.helperLink} href="/login">
                Sign in
              </Link>
            </div>

            <p className={styles.finePrint}>
              By signing up you agree to our <Link href="/terms">Terms</Link> and{' '}
              <Link href="/privacy">Privacy Policy</Link>.
            </p>
          </form>
        </section>
      </div>
    </main>
  )
}
