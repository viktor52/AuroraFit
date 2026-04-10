'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from '@/components/coach/CoachDashboard.module.css'
import { AdminShell } from './AdminShell'
import { clearAdminSecret, getAdminSecret } from './adminSecret'

type ExerciseRow = { id: string; name: string; description: string | null }
type ProgramRow = { id: string; name: string; description: string | null }

function authHeaders(secret: string) {
  return { 'X-Admin-Secret': secret, 'Content-Type': 'application/json' }
}

export function AdminProgramsPage() {
  const router = useRouter()
  const [secret, setSecret] = useState<string | null>(null)
  const [exercises, setExercises] = useState<ExerciseRow[]>([])
  const [programs, setPrograms] = useState<ProgramRow[]>([])
  const [programName, setProgramName] = useState('')
  const [programDesc, setProgramDesc] = useState('')
  const [programExerciseIds, setProgramExerciseIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

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
        const [e, p] = await Promise.all([
          fetch('/api/admin/exercises', { headers: { 'X-Admin-Secret': secret } }),
          fetch('/api/admin/programs', { headers: { 'X-Admin-Secret': secret } }),
        ])
        if (!e.ok || !p.ok) throw new Error('Unauthorized')
        const exJson = (await e.json()) as { ok: true; exercises: ExerciseRow[] }
        const progJson = (await p.json()) as { ok: true; programs: ProgramRow[] }
        setExercises(exJson.exercises)
        setPrograms(progJson.programs.map((x) => ({ id: x.id, name: x.name, description: x.description })))
      } catch {
        clearAdminSecret()
        router.replace('/admin/login')
      }
    })()
  }, [secret, router])

  async function createProgram() {
    if (!secret) return
    setError(null)
    setSuccess(null)
    setPending(true)
    try {
      const res = await fetch('/api/admin/programs', {
        method: 'POST',
        headers: authHeaders(secret),
        body: JSON.stringify({
          name: programName,
          description: programDesc || undefined,
          exercises: programExerciseIds.map((exerciseId, idx) => ({ exerciseId, sortOrder: idx })),
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Could not create program.')
        return
      }
      setProgramName('')
      setProgramDesc('')
      setProgramExerciseIds([])
      setSuccess('Program created.')
      const list = await fetch('/api/admin/programs', { headers: { 'X-Admin-Secret': secret } })
      const listJson = (await list.json()) as { ok: true; programs: { id: string; name: string; description: string | null }[] }
      setPrograms(listJson.programs.map((x) => ({ id: x.id, name: x.name, description: x.description })))
    } catch {
      setError('Network error.')
    } finally {
      setPending(false)
    }
  }

  return (
    <AdminShell active="programs">
      <div className={styles.mainInner}>
        <section className={styles.panel}>
          <h1 className={styles.title}>Programs</h1>
          <p className={styles.muted}>
            Build a program from exercises. Manage exercises on the{' '}
            <a className="font-semibold text-cyan-300 underline-offset-2 hover:underline" href="/admin/exercises">
              Exercises
            </a>{' '}
            page.{' '}
            <a className="font-semibold text-cyan-300 underline-offset-2 hover:underline" href="/admin">
              Back to dashboard
            </a>
          </p>

          <label className={styles.label} htmlFor="progName">
            Name
          </label>
          <input
            className={styles.input}
            id="progName"
            value={programName}
            onChange={(e) => setProgramName(e.target.value)}
            placeholder="Beginner Strength (3 days)"
          />

          <label className={styles.label} htmlFor="progDesc">
            Description (optional)
          </label>
          <input
            className={styles.input}
            id="progDesc"
            value={programDesc}
            onChange={(e) => setProgramDesc(e.target.value)}
            placeholder="3-week introductory block"
          />

          <label className={styles.label} htmlFor="progExercises">
            Exercises (multi-select, order = program order)
          </label>
          <select
            className={styles.input}
            id="progExercises"
            multiple
            size={8}
            value={programExerciseIds}
            onChange={(e) =>
              setProgramExerciseIds(Array.from(e.target.selectedOptions).map((o) => o.value))
            }
          >
            {exercises.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.name}
              </option>
            ))}
          </select>

          <div className={styles.row}>
            <button className={styles.primary} type="button" onClick={createProgram} disabled={pending}>
              {pending ? 'Saving…' : 'Create program'}
            </button>
          </div>

          {error ? <div className={styles.error}>{error}</div> : null}
          {success ? <div className={styles.success}>{success}</div> : null}
        </section>

        <section className={styles.panel} style={{ marginTop: '1.25rem' }}>
          <h2 className="text-lg font-semibold text-slate-100">All programs</h2>
          <p className={styles.muted}>{programs.length} total</p>
          <div className={styles.list} style={{ marginTop: '1rem' }}>
            {programs.map((p) => (
              <div key={p.id} className={styles.listItem}>
                <div className={styles.listTitle}>{p.name}</div>
                <div className={styles.listSub}>{p.description ?? '—'}</div>
              </div>
            ))}
            {programs.length === 0 ? <div className={styles.empty}>No programs yet.</div> : null}
          </div>
        </section>
      </div>
    </AdminShell>
  )
}
