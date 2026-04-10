'use client'

import { useEffect, useState } from 'react'
import styles from './CoachDashboard.module.css'

type MeResponse =
  | {
      ok: true
      user: { id: string; email: string; role: 'COACH'; coachProfile?: { fullName: string | null } | null }
      sessionExpiresAt: string
    }
  | { ok: false; error: string }

type LibExercise = {
  id: string
  name: string
  description: string | null
  youtubeVideoId: string | null
  kind: 'created' | 'catalog'
  inProgram: boolean
  explicitlySaved: boolean
  savedAt: string | null
  createdAt: string
  updatedAt: string
}

type LibraryResponse = { ok: true; exercises: LibExercise[] } | { ok: false; error: string }

export function CoachExerciseLibraryPage() {
  const [me, setMe] = useState<MeResponse | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [exercises, setExercises] = useState<LibExercise[]>([])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [removeId, setRemoveId] = useState<string | null>(null)
  const [editEx, setEditEx] = useState<LibExercise | null>(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editYoutube, setEditYoutube] = useState('')
  const [editPending, setEditPending] = useState(false)

  async function loadLibrary() {
    const res = await fetch('/api/coach/exercise-library')
    const data = (await res.json().catch(() => ({ ok: false, error: 'Load failed.' }))) as LibraryResponse
    if (res.ok && data.ok) {
      setExercises(data.exercises ?? [])
    } else {
      setExercises([])
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

  async function removeFromLibrary(ex: LibExercise) {
    const msg =
      ex.kind === 'created'
        ? `Delete “${ex.name}” everywhere? It will be removed from any programs that reference it.`
        : ex.explicitlySaved
          ? `Remove “${ex.name}” from your saved list?`
          : null
    if (!msg) return
    if (!window.confirm(msg)) return

    setError(null)
    setSuccess(null)
    setRemoveId(ex.id)
    try {
      const res = await fetch('/api/coach/exercise-library', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exerciseId: ex.id }),
      })
      const json = (await res.json().catch(() => ({ ok: false, error: 'Request failed.' }))) as
        | { ok: true }
        | { ok: false; error: string }
      if (!res.ok || !json.ok) {
        setError('error' in json ? json.error : 'Could not remove.')
        return
      }
      setSuccess(ex.kind === 'created' ? 'Exercise deleted.' : 'Removed from your library.')
      await loadLibrary()
    } catch {
      setError('Network error.')
    } finally {
      setRemoveId(null)
    }
  }

  function openEdit(ex: LibExercise) {
    setEditEx(ex)
    setEditName(ex.name)
    setEditDesc(ex.description ?? '')
    setEditYoutube(ex.youtubeVideoId ? `https://www.youtube.com/watch?v=${ex.youtubeVideoId}` : '')
    setError(null)
    setSuccess(null)
  }

  async function submitEdit() {
    if (!editEx) return
    setEditPending(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/coach/exercises/${encodeURIComponent(editEx.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDesc.trim(),
          youtubeUrl: editYoutube.trim(),
        }),
      })
      const json = (await res.json().catch(() => ({ ok: false, error: 'Save failed.' }))) as
        | { ok: true }
        | { ok: false; error: string }
      if (!res.ok || !json.ok) {
        setError('error' in json ? json.error : 'Save failed.')
        return
      }
      setSuccess('Exercise updated.')
      setEditEx(null)
      await loadLibrary()
    } catch {
      setError('Network error.')
    } finally {
      setEditPending(false)
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

  const displayName = me && me.ok ? me.user.coachProfile?.fullName ?? me.user.email : '…'

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
              <div className="text-sm font-semibold tracking-tight text-slate-100">My exercise library</div>
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
            <a className={`${styles.navItem} ${styles.navItemActive}`} href="/coach/exercise-library" onClick={() => setMenuOpen(false)}>
              My exercise library
            </a>
            <a className={styles.navItem} href="/coach/program" onClick={() => setMenuOpen(false)}>
              Program builder <span className={styles.pill}>Weekly</span>
            </a>
            <a className={styles.navItem} href="/coach/program-library" onClick={() => setMenuOpen(false)}>
              My program library
            </a>
          </nav>
        </div>
      </aside>

      <main className={styles.main}>
        <div className={styles.mainInner}>
          <section className={styles.panel}>
            <h1 className={styles.title}>My exercise library</h1>
            <p className={styles.muted}>
              Exercises you created (with YouTube demos), ones you saved from API search, and any exercise used in your
              coach-built programs. Signed in as {displayName}.
            </p>
            <div className={styles.row}>
              <a className={styles.primary} href="/coach/exercises">
                Search API
              </a>
              <a className={styles.secondary} href="/coach/program">
                Program builder
              </a>
              <a className={styles.secondary} href="/coach">
                Dashboard
              </a>
            </div>

            {error ? <div className={styles.error}>{error}</div> : null}
            {success ? <div className={styles.success}>{success}</div> : null}

            <div className={styles.list}>
              {exercises.map((ex) => (
                <div key={ex.id} className={styles.listItem}>
                  <div className={styles.listItemTop}>
                    <div className={styles.listLeft}>
                      <div className={styles.listTitle}>{ex.name}</div>
                      <div className={styles.listSub}>
                        {ex.kind === 'created' ? (
                          <span className="text-emerald-300/90">Created by you</span>
                        ) : (
                          <span className="text-slate-400">Catalog / API</span>
                        )}
                        {ex.inProgram ? ' · In a program' : ''}
                        {ex.explicitlySaved ? ' · Saved' : ''}
                      </div>
                      {ex.description ? (
                        <div className="mt-1 line-clamp-2 text-xs text-slate-500">{ex.description}</div>
                      ) : null}
                    </div>
                    <div className={styles.listActions}>
                      {ex.kind === 'created' ? (
                        <button type="button" className={styles.linkNewCompact} onClick={() => openEdit(ex)}>
                          Edit
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={styles.iconBtnDanger}
                        disabled={
                          removeId === ex.id ||
                          (ex.kind === 'catalog' && !ex.explicitlySaved && ex.inProgram)
                        }
                        title={
                          ex.kind === 'catalog' && !ex.explicitlySaved && ex.inProgram
                            ? 'Remove this exercise from your programs in the program builder first'
                            : 'Remove or delete'
                        }
                        onClick={() => void removeFromLibrary(ex)}
                      >
                        {removeId === ex.id ? '…' : ex.kind === 'created' ? 'Delete' : 'Remove'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {exercises.length === 0 ? (
                <div className={styles.empty}>
                  Nothing here yet. Save from exercise search, create exercises on the program builder, or add exercises
                  to a program.
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </main>

      {editEx ? (
        <>
          <div className={styles.drawerOverlay} style={{ zIndex: 50 }} onClick={() => !editPending && setEditEx(null)} />
          <div
            className="fixed left-1/2 top-1/2 z-[60] w-[min(100%,26rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/10 bg-slate-950 p-6 shadow-2xl"
            role="dialog"
            aria-labelledby="ex-edit-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="ex-edit-title" className="text-lg font-semibold text-slate-100">
              Edit exercise
            </h2>
            <div className="mt-4 space-y-3">
              <div>
                <label className={styles.label} htmlFor="ex-name">
                  Name
                </label>
                <input
                  id="ex-name"
                  className={styles.input}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  disabled={editPending}
                />
              </div>
              <div>
                <label className={styles.label} htmlFor="ex-desc">
                  Description
                </label>
                <textarea
                  id="ex-desc"
                  className={`${styles.input} min-h-[100px]`}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  disabled={editPending}
                />
              </div>
              <div>
                <label className={styles.label} htmlFor="ex-yt">
                  YouTube URL or video id
                </label>
                <input
                  id="ex-yt"
                  className={styles.input}
                  value={editYoutube}
                  onChange={(e) => setEditYoutube(e.target.value)}
                  disabled={editPending}
                />
              </div>
            </div>
            <div className={`${styles.row} mt-5`}>
              <button
                type="button"
                className={styles.primary}
                disabled={editPending || !editName.trim() || !editDesc.trim() || !editYoutube.trim()}
                onClick={() => void submitEdit()}
              >
                {editPending ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className={styles.secondary} disabled={editPending} onClick={() => setEditEx(null)}>
                Cancel
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
