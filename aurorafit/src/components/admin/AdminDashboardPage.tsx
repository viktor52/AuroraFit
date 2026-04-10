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

type ProgramRow = { id: string; name: string; description: string | null }

function authHeaders(secret: string) {
  return { 'X-Admin-Secret': secret, 'Content-Type': 'application/json' }
}

export function AdminDashboardPage() {
  const router = useRouter()
  const [secret, setSecret] = useState<string | null>(null)

  const [users, setUsers] = useState<UserRow[]>([])
  const [programs, setPrograms] = useState<ProgramRow[]>([])

  const [inviteExpiresDays, setInviteExpiresDays] = useState<number>(14)
  const [mintedKey, setMintedKey] = useState<string | null>(null)

  const [assignAthleteId, setAssignAthleteId] = useState('')
  const [assignProgramId, setAssignProgramId] = useState('')

  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const athletes = useMemo(() => users.filter((u) => u.role === 'ATHLETE'), [users])

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
      try {
        setError(null)
        const [u, p] = await Promise.all([
          fetch('/api/admin/users', { headers: { 'X-Admin-Secret': secret } }),
          fetch('/api/admin/programs', { headers: { 'X-Admin-Secret': secret } }),
        ])
        if (!u.ok) throw new Error('Unauthorized')
        const usersJson = (await u.json()) as { ok: true; users: UserRow[] }
        const progJson = (await p.json()) as { ok: true; programs: { id: string; name: string; description: string | null }[] }
        setUsers(usersJson.users)
        setPrograms(progJson.programs.map((x) => ({ id: x.id, name: x.name, description: x.description })))
      } catch {
        clearAdminSecret()
        router.replace('/admin/login')
      }
    })()
  }, [secret, router])

  async function mintCoachKey() {
    if (!secret) return
    setError(null)
    setSuccess(null)
    setMintedKey(null)
    setPending(true)
    try {
      const res = await fetch('/api/admin/coach-invite-keys', {
        method: 'POST',
        headers: authHeaders(secret),
        body: JSON.stringify({ expiresInDays: inviteExpiresDays }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; key?: string; error?: string }
      if (!res.ok || !data.ok || !data.key) {
        setError(data.error ?? 'Could not mint key.')
        return
      }
      setMintedKey(data.key)
      setSuccess('Key minted. Copy it and send to the coach.')
    } catch {
      setError('Network error.')
    } finally {
      setPending(false)
    }
  }

  async function assignProgram() {
    if (!secret) return
    setError(null)
    setSuccess(null)
    setPending(true)
    try {
      const res = await fetch('/api/admin/assign-program', {
        method: 'POST',
        headers: authHeaders(secret),
        body: JSON.stringify({ athleteId: assignAthleteId, programId: assignProgramId }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Could not assign program.')
        return
      }
      setSuccess('Program assigned to athlete.')
    } catch {
      setError('Network error.')
    } finally {
      setPending(false)
    }
  }

  return (
    <AdminShell active="dashboard">
      <div className={styles.mainInner}>
        <section className={styles.panel}>
          <h1 className={styles.title}>Admin dashboard</h1>
          <p className={styles.muted}>
            Mint coach invite keys and assign programs to athletes. Manage accounts under Users; build content under
            Exercises and Programs.
          </p>
          <div className={styles.row}>
            <a className={styles.primary} href="/admin/users">
              Users & roles
            </a>
            <a className={styles.secondary} href="/admin/exercises">
              Exercises
            </a>
            <a className={styles.secondary} href="/admin/programs">
              Programs
            </a>
          </div>
        </section>

        <div className={styles.contentGrid}>
          <section className={styles.panel} aria-label="Coach validation keys">
            <h2 className="text-lg font-semibold text-slate-100">Coach validation keys</h2>
            <p className={styles.muted}>Mint a one-time key and send it to the coach.</p>

            <div className="mt-4">
              <label className={styles.label} htmlFor="expiresDays">
                Expires in days
              </label>
              <input
                className={styles.input}
                id="expiresDays"
                type="number"
                min={1}
                max={365}
                value={inviteExpiresDays}
                onChange={(e) => setInviteExpiresDays(Number(e.target.value))}
              />
            </div>

            <div className={styles.row}>
              <button className={styles.primary} type="button" onClick={mintCoachKey} disabled={pending}>
                {pending ? 'Working…' : 'Mint coach key'}
              </button>
            </div>

            {mintedKey ? (
              <div className={styles.success} style={{ marginTop: '1rem' }}>
                <div className="text-xs uppercase tracking-wide text-emerald-200/80">One-time key</div>
                <div className="mt-1 font-mono text-sm">{mintedKey}</div>
              </div>
            ) : null}
          </section>

          <section className={styles.panel} aria-label="Assign program">
            <h2 className="text-lg font-semibold text-slate-100">Assign programs</h2>
            <p className={styles.muted}>Assign an admin program to an athlete.</p>

            <label className={styles.label} htmlFor="athleteSelect">
              Athlete
            </label>
            <select
              className={styles.input}
              id="athleteSelect"
              value={assignAthleteId}
              onChange={(e) => setAssignAthleteId(e.target.value)}
            >
              <option value="">Select athlete…</option>
              {athletes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.athleteProfile?.fullName ?? a.email}
                </option>
              ))}
            </select>

            <label className={styles.label} htmlFor="programSelect">
              Program
            </label>
            <select
              className={styles.input}
              id="programSelect"
              value={assignProgramId}
              onChange={(e) => setAssignProgramId(e.target.value)}
            >
              <option value="">Select program…</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <div className={styles.row}>
              <button className={styles.primary} type="button" onClick={assignProgram} disabled={pending}>
                Assign program
              </button>
            </div>
          </section>
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}
        {success ? <p className={styles.success}>{success}</p> : null}
      </div>
    </AdminShell>
  )
}
