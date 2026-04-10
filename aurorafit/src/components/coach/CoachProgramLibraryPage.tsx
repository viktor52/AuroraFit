'use client'

import { useEffect, useState } from 'react'
import styles from './CoachDashboard.module.css'

function formatProgramDisplayName(raw: string): string {
  const t = raw.replace(/\s*·\s*[A-Fa-f0-9]{4,}\s*$/i, '').trim()
  return t || raw
}

type MeResponse =
  | {
      ok: true
      user: { id: string; email: string; role: 'COACH'; coachProfile?: { fullName: string | null } | null }
      sessionExpiresAt: string
    }
  | { ok: false; error: string }

type LibraryProgram = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  libraryWeeks: number | null
  libraryDaysPerWeek: number | null
  librarySplitPattern: string | null
  assignmentCount: number
}

type LibraryResponse = { ok: true; programs: LibraryProgram[] } | { ok: false; error: string }

type Athlete = { id: string; email: string; fullName: string | null }

export function CoachProgramLibraryPage() {
  const [me, setMe] = useState<MeResponse | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [programs, setPrograms] = useState<LibraryProgram[]>([])
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [assignFor, setAssignFor] = useState<LibraryProgram | null>(null)
  const [assignAthleteId, setAssignAthleteId] = useState('')
  const [assignPending, setAssignPending] = useState(false)

  async function loadLibrary() {
    const res = await fetch('/api/coach/program-library')
    const data = (await res.json().catch(() => ({ ok: false, error: 'Load failed.' }))) as LibraryResponse
    if (res.ok && data.ok) {
      setPrograms(data.programs ?? [])
    } else {
      setPrograms([])
      setError('error' in data ? data.error : 'Could not load library.')
    }
  }

  useEffect(() => {
    ;(async () => {
      const res = await fetch('/api/coach/me')
      const data = (await res.json().catch(() => ({ ok: false, error: 'Unauthorized.' }))) as MeResponse
      setMe(data)
      if (!res.ok || !data.ok) return
      await loadLibrary()
      const ares = await fetch('/api/coach/athletes')
      const aj = (await ares.json().catch(() => ({ ok: false, athletes: [] }))) as
        | { ok: true; athletes: Athlete[] }
        | { ok: false }
      if (ares.ok && aj.ok) setAthletes(aj.athletes ?? [])
    })()
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  async function deleteProgram(p: LibraryProgram) {
    if (
      !window.confirm(
        p.assignmentCount > 0
          ? `Delete “${formatProgramDisplayName(p.name)}”? It is assigned to ${p.assignmentCount} athlete(s); those assignments will be removed.`
          : `Delete “${formatProgramDisplayName(p.name)}” from your library?`,
      )
    ) {
      return
    }
    setError(null)
    setSuccess(null)
    setDeleteId(p.id)
    try {
      const res = await fetch(`/api/coach/programs/${encodeURIComponent(p.id)}`, { method: 'DELETE' })
      const json = (await res.json().catch(() => ({ ok: false, error: 'Request failed.' }))) as
        | { ok: true }
        | { ok: false; error: string }
      if (!res.ok || !json.ok) {
        setError('error' in json ? json.error : 'Could not delete.')
        return
      }
      setSuccess('Program removed from your library.')
      await loadLibrary()
    } catch {
      setError('Network error.')
    } finally {
      setDeleteId(null)
    }
  }

  async function submitAssign() {
    if (!assignFor || !assignAthleteId) return
    setError(null)
    setSuccess(null)
    setAssignPending(true)
    try {
      const res = await fetch('/api/coach/program-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programId: assignFor.id, athleteId: assignAthleteId }),
      })
      const json = (await res.json().catch(() => ({ ok: false, error: 'Request failed.' }))) as
        | { ok: true }
        | { ok: false; error: string }
      if (!res.ok || !json.ok) {
        setError('error' in json ? json.error : 'Could not assign.')
        return
      }
      setSuccess('Program assigned. The athlete will see it on My program.')
      setAssignFor(null)
      setAssignAthleteId('')
      await loadLibrary()
    } catch {
      setError('Network error.')
    } finally {
      setAssignPending(false)
    }
  }

  if (me && !me.ok) {
    return (
      <main className={styles.page}>
        <div className={styles.mainInner}>
          <div className={styles.empty}>You’re not signed in.</div>
        </div>
      </main>
    )
  }

  const displayName =
    me && me.ok ? me.user.coachProfile?.fullName ?? me.user.email : '…'

  return (
    <div className={`${styles.page} ${styles.layout}`}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <div className={styles.brand}>
            <button className={styles.hamburger} type="button" onClick={() => setMenuOpen(true)}>
              Menu
            </button>
            <div className={styles.brandText}>
              <div className="text-[11px] uppercase tracking-wide text-slate-400">AuroraFit</div>
              <div className="text-sm font-semibold tracking-tight text-slate-100">My program library</div>
            </div>
          </div>
          <button className={styles.hamburger} type="button" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      {menuOpen ? <div className={styles.drawerOverlay} onClick={() => setMenuOpen(false)} /> : null}
      <aside className={`${styles.drawer} ${menuOpen ? styles.drawerOpen : ''}`} aria-label="Mobile menu">
        <div className={styles.drawerHeader}>
          <div className={styles.brandText}>AuroraFit</div>
          <button className={styles.closeBtn} type="button" onClick={() => setMenuOpen(false)}>
            Close
          </button>
        </div>
        <div className={styles.sidebarInner}>
          <nav className={styles.nav} aria-label="Coach navigation (mobile)">
            <a className={styles.navItem} href="/coach" onClick={() => setMenuOpen(false)}>
              Dashboard <span className={styles.pill}>Home</span>
            </a>
            <a className={styles.navItem} href="/coach/exercises" onClick={() => setMenuOpen(false)}>
              Exercise search <span className={styles.pill}>API</span>
            </a>
            <a className={styles.navItem} href="/coach/exercise-library" onClick={() => setMenuOpen(false)}>
              My exercise library
            </a>
            <a className={styles.navItem} href="/coach/program" onClick={() => setMenuOpen(false)}>
              Program builder <span className={styles.pill}>Weekly</span>
            </a>
            <a className={`${styles.navItem} ${styles.navItemActive}`} href="/coach/program-library" onClick={() => setMenuOpen(false)}>
              My program library
            </a>
          </nav>
        </div>
      </aside>

      <main className={styles.main}>
        <div className={styles.mainInner}>
          <section className={styles.panel}>
            <h1 className={styles.title}>My program library</h1>
            <p className={styles.muted}>
              Programs you saved without assigning an athlete, or templates you keep after publishing. Edit, assign to
              an athlete, or delete. Signed in as {displayName}.
            </p>
            <div className={styles.row}>
              <a className={styles.primary} href="/coach/program">
                New program
              </a>
              <a className={styles.secondary} href="/coach">
                Dashboard
              </a>
            </div>

            {error ? <div className={styles.error}>{error}</div> : null}
            {success ? <div className={styles.success}>{success}</div> : null}

            <div className={styles.list}>
              {programs.map((p) => (
                <div key={p.id} className={styles.listItem}>
                  <div className={styles.listItemTop}>
                    <div className={styles.listLeft}>
                      <div className={styles.listTitle}>{formatProgramDisplayName(p.name)}</div>
                      <div className={styles.listSub}>
                        {p.libraryDaysPerWeek != null && p.libraryWeeks != null
                          ? `${p.libraryWeeks} wk · ${p.libraryDaysPerWeek}×/wk · ${p.librarySplitPattern ?? 'spread'}`
                          : '—'}
                        {p.assignmentCount > 0 ? ` · ${p.assignmentCount} assignment(s)` : ''}
                      </div>
                    </div>
                    <div className={styles.listActions}>
                      <a
                        className={styles.linkNewCompact}
                        href={`/coach/program?programId=${encodeURIComponent(p.id)}&library=1`}
                        title="Edit in builder"
                      >
                        Edit
                      </a>
                      <button
                        type="button"
                        className={styles.linkNewCompact}
                        onClick={() => {
                          setAssignFor(p)
                          setAssignAthleteId(athletes[0]?.id ?? '')
                        }}
                      >
                        Assign
                      </button>
                      <button
                        type="button"
                        className={styles.iconBtnDanger}
                        title="Delete from library"
                        disabled={deleteId === p.id}
                        onClick={() => void deleteProgram(p)}
                      >
                        {deleteId === p.id ? '…' : 'Delete'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {programs.length === 0 ? (
                <div className={styles.empty}>
                  No saved programs yet. Open Program builder, leave athlete empty, and choose “Save to My program
                  library”.
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </main>

      {assignFor ? (
        <div
          className={styles.drawerOverlay}
          style={{ zIndex: 50 }}
          role="presentation"
          onClick={() => !assignPending && setAssignFor(null)}
        />
      ) : null}
      {assignFor ? (
        <div
          className="fixed left-1/2 top-1/2 z-[60] w-[min(100%,24rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/10 bg-slate-950 p-6 shadow-2xl shadow-black/40"
          role="dialog"
          aria-labelledby="assign-dialog-title"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="assign-dialog-title" className="text-lg font-semibold text-slate-100">
            Assign program
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            {formatProgramDisplayName(assignFor.name)} → choose an athlete.
          </p>
          <div className="mt-4">
            <label className={styles.label} htmlFor="assign-athlete">
              Athlete
            </label>
            <select
              id="assign-athlete"
              className={styles.input}
              value={assignAthleteId}
              onChange={(e) => setAssignAthleteId(e.target.value)}
              disabled={assignPending || athletes.length === 0}
            >
              {athletes.length === 0 ? (
                <option value="">No athletes — invite from the dashboard</option>
              ) : (
                athletes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.fullName ? `${a.fullName} — ${a.email}` : a.email}
                  </option>
                ))
              )}
            </select>
          </div>
          <div className={`${styles.row} mt-5`} style={{ marginTop: '1.25rem' }}>
            <button
              type="button"
              className={styles.primary}
              disabled={assignPending || !assignAthleteId || athletes.length === 0}
              onClick={() => void submitAssign()}
            >
              {assignPending ? 'Assigning…' : 'Assign'}
            </button>
            <button
              type="button"
              className={styles.secondary}
              disabled={assignPending}
              onClick={() => setAssignFor(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
