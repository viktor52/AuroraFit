'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import styles from './AdminShell.module.css'
import { setAdminSecret } from './adminSecret'

export function AdminLoginPage() {
  const router = useRouter()
  const [secret, setSecret] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      // quick validation call
      const res = await fetch('/api/admin/users', {
        headers: { 'X-Admin-Secret': secret },
      })
      if (!res.ok) {
        setError('Invalid admin secret.')
        return
      }
      setAdminSecret(secret)
      router.push('/admin')
    } catch {
      setError('Network error. Try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.main}>
        <section className={styles.card} aria-label="Admin login">
          <h1 className={styles.cardTitle}>Admin login</h1>
          <p className={styles.muted}>
            Enter the secret from your server’s <span className={styles.pill}>ADMIN_SETUP_SECRET</span>.
          </p>
          <form onSubmit={onSubmit}>
            <label className={styles.label} htmlFor="secret">
              Admin secret
            </label>
            <input
              className={styles.input}
              id="secret"
              type="password"
              autoComplete="off"
              placeholder="Paste secret here"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              required
            />
            {error ? <p className={styles.error}>{error}</p> : null}
            <button className={styles.button} type="submit" disabled={pending}>
              {pending ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </section>
      </div>
    </main>
  )
}

