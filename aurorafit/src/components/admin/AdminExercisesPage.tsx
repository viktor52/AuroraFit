'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from '@/components/coach/CoachDashboard.module.css'
import { AdminShell } from './AdminShell'
import { clearAdminSecret, getAdminSecret } from './adminSecret'

type ExerciseRow = { id: string; name: string; description: string | null }

function authHeaders(secret: string) {
  return { 'X-Admin-Secret': secret, 'Content-Type': 'application/json' }
}

export function AdminExercisesPage() {
  const router = useRouter()
  const [secret, setSecret] = useState<string | null>(null)
  const [exercises, setExercises] = useState<ExerciseRow[]>([])
  const [exerciseName, setExerciseName] = useState('')
  const [exerciseDesc, setExerciseDesc] = useState('')
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
        const res = await fetch('/api/admin/exercises', { headers: { 'X-Admin-Secret': secret } })
        if (!res.ok) throw new Error('Unauthorized')
        const data = (await res.json()) as { ok: true; exercises: ExerciseRow[] }
        setExercises(data.exercises)
      } catch {
        clearAdminSecret()
        router.replace('/admin/login')
      }
    })()
  }, [secret, router])

  async function createExercise() {
    if (!secret) return
    setError(null)
    setSuccess(null)
    setPending(true)
    try {
      const res = await fetch('/api/admin/exercises', {
        method: 'POST',
        headers: authHeaders(secret),
        body: JSON.stringify({ name: exerciseName, description: exerciseDesc || undefined }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Could not create exercise.')
        return
      }
      setExerciseName('')
      setExerciseDesc('')
      setSuccess('Exercise created.')
      const list = await fetch('/api/admin/exercises', { headers: { 'X-Admin-Secret': secret } })
      const listJson = (await list.json()) as { ok: true; exercises: ExerciseRow[] }
      setExercises(listJson.exercises)
    } catch {
      setError('Network error.')
    } finally {
      setPending(false)
    }
  }

  return (
    <AdminShell active="exercises">
      <div className={styles.mainInner}>
        <section className={styles.panel}>
          <h1 className={styles.title}>Exercises</h1>
          <p className={styles.muted}>
            Create reusable exercises for admin-built programs.{' '}
            <a className="font-semibold text-cyan-300 underline-offset-2 hover:underline" href="/admin">
              Back to dashboard
            </a>
          </p>

          <label className={styles.label} htmlFor="exName">
            Name
          </label>
          <input
            className={styles.input}
            id="exName"
            value={exerciseName}
            onChange={(e) => setExerciseName(e.target.value)}
            placeholder="Back squat"
          />

          <label className={styles.label} htmlFor="exDesc">
            Description (optional)
          </label>
          <input
            className={styles.input}
            id="exDesc"
            value={exerciseDesc}
            onChange={(e) => setExerciseDesc(e.target.value)}
            placeholder="3-1-1 tempo, focus on depth"
          />

          <div className={styles.row}>
            <button className={styles.primary} type="button" onClick={createExercise} disabled={pending}>
              {pending ? 'Saving…' : 'Add exercise'}
            </button>
          </div>

          {error ? <div className={styles.error}>{error}</div> : null}
          {success ? <div className={styles.success}>{success}</div> : null}
        </section>

        <section className={styles.panel} style={{ marginTop: '1.25rem' }}>
          <h2 className="text-lg font-semibold text-slate-100">All exercises</h2>
          <p className={styles.muted}>{exercises.length} total</p>
          <div className={styles.list} style={{ marginTop: '1rem' }}>
            {exercises.map((ex) => (
              <div key={ex.id} className={styles.listItem}>
                <div className={styles.listTitle}>{ex.name}</div>
                <div className={styles.listSub}>{ex.description ?? '—'}</div>
              </div>
            ))}
            {exercises.length === 0 ? <div className={styles.empty}>No exercises yet.</div> : null}
          </div>
        </section>
      </div>
    </AdminShell>
  )
}
