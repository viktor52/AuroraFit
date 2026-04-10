'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from '@/components/coach/CoachDashboard.module.css'
import { AdminShell } from './AdminShell'
import { clearAdminSecret, getAdminSecret } from './adminSecret'

type UserRow = {
  id: string
  email: string
  role: 'ATHLETE' | 'COACH' | 'ADMIN'
  createdAt: string
  athleteProfile?: { fullName: string | null } | null
  coachProfile?: { fullName: string | null } | null
}

const ROLES: UserRow['role'][] = ['ATHLETE', 'COACH', 'ADMIN']

function authHeaders(secret: string) {
  return { 'X-Admin-Secret': secret, 'Content-Type': 'application/json' }
}

function displayName(u: UserRow): string {
  if (u.role === 'ADMIN') return 'Admin'
  if (u.role === 'ATHLETE') return u.athleteProfile?.fullName?.trim() || '—'
  return u.coachProfile?.fullName?.trim() || '—'
}

export function AdminUsersPage() {
  const router = useRouter()
  const [secret, setSecret] = useState<string | null>(null)
  const [users, setUsers] = useState<UserRow[]>([])
  const [filter, setFilter] = useState<'all' | 'ATHLETE' | 'COACH' | 'ADMIN'>('all')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  useEffect(() => {
    const s = getAdminSecret()
    if (!s) {
      router.replace('/admin/login')
      return
    }
    setSecret(s)
  }, [router])

  useEffect(() => {
    if (!secret) return
    ;(async () => {
      const res = await fetch('/api/admin/users', { headers: { 'X-Admin-Secret': secret } })
      if (!res.ok) {
        clearAdminSecret()
        router.replace('/admin/login')
        return
      }
      const data = (await res.json()) as { ok: true; users: UserRow[] }
      setUsers(data.users)
    })()
  }, [secret, router])

  const filtered = useMemo(() => {
    if (filter === 'all') return users
    return users.filter((u) => u.role === filter)
  }, [users, filter])

  async function changeRole(userId: string, role: UserRow['role']) {
    if (!secret) return
    setError(null)
    setSuccess(null)
    setPendingId(userId)
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: authHeaders(secret),
        body: JSON.stringify({ role }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Could not update role.')
        return
      }
      setSuccess('Role updated. User was signed out everywhere.')
      const list = await fetch('/api/admin/users', { headers: { 'X-Admin-Secret': secret } })
      if (list.ok) {
        const j = (await list.json()) as { ok: true; users: UserRow[] }
        setUsers(j.users)
      }
    } catch {
      setError('Network error.')
    } finally {
      setPendingId(null)
    }
  }

  async function removeUser(u: UserRow) {
    if (!secret) return
    if (
      !window.confirm(
        `Permanently delete ${u.email}? This cannot be undone. Related sessions and data will be removed.`,
      )
    ) {
      return
    }
    setError(null)
    setSuccess(null)
    setPendingId(u.id)
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(u.id)}`, {
        method: 'DELETE',
        headers: { 'X-Admin-Secret': secret },
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Could not delete user.')
        return
      }
      setSuccess('Account removed.')
      const list = await fetch('/api/admin/users', { headers: { 'X-Admin-Secret': secret } })
      if (list.ok) {
        const j = (await list.json()) as { ok: true; users: UserRow[] }
        setUsers(j.users)
      }
    } catch {
      setError('Network error.')
    } finally {
      setPendingId(null)
    }
  }

  return (
    <AdminShell active="users">
      <div className={styles.mainInner}>
        <section className={styles.panel}>
          <h1 className={styles.title}>Users & roles</h1>
          <p className={styles.muted}>
            Everyone registered in AuroraFit. Change role (athlete, coach, admin) or delete an account. Users are signed
            out when their role changes.
          </p>

          <div className={styles.row} style={{ marginTop: '1rem' }}>
            {(['all', 'ATHLETE', 'COACH', 'ADMIN'] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={filter === f ? styles.primary : styles.secondary}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'All' : f === 'ATHLETE' ? 'Athletes' : f === 'COACH' ? 'Coaches' : 'Admins'}
              </button>
            ))}
          </div>

          {error ? <div className={styles.error}>{error}</div> : null}
          {success ? <div className={styles.success}>{success}</div> : null}

          <div className={styles.list} style={{ marginTop: '1.25rem' }}>
            {filtered.map((u) => (
              <div key={u.id} className={styles.listItem}>
                <div className={styles.listItemTop}>
                  <div className={styles.listLeft}>
                    <div className={styles.listTitle}>{displayName(u)}</div>
                    <div className={styles.listSub}>{u.email}</div>
                    <div className={styles.listSub}>
                      Joined {new Date(u.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className={styles.listActions} style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                    <select
                      className={styles.input}
                      style={{ marginTop: 0, width: 'auto', minWidth: '8rem', padding: '0.35rem 0.75rem' }}
                      value={u.role}
                      disabled={pendingId === u.id}
                      onChange={(e) => void changeRole(u.id, e.target.value as UserRow['role'])}
                      aria-label={`Role for ${u.email}`}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className={styles.danger}
                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                      disabled={pendingId === u.id}
                      onClick={() => void removeUser(u)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {filtered.length === 0 ? <div className={styles.empty}>No users match this filter.</div> : null}
          </div>
        </section>
      </div>
    </AdminShell>
  )
}
