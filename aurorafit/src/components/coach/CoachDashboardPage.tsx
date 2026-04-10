'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import styles from './CoachDashboard.module.css'

function IconPencil({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconTrash({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14zM10 11v6M14 11v6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconEye({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

/** Strips coach program disambiguation suffix (` · A1B2C3`) for dashboard display. */
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

export function CoachDashboardPage() {
  const pathname = usePathname()
  const [me, setMe] = useState<MeResponse | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const navLibraryActive = pathname === '/coach/program-library'
  const navExerciseLibraryActive = pathname === '/coach/exercise-library'
  const [athletes, setAthletes] = useState<
    Array<{
      id: string
      email: string
      fullName: string | null
      since: string
      latestProgram: { id: string; name: string; canEdit: boolean } | null
    }>
  >([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [pending, setPending] = useState(false)
  const [removePendingAthleteId, setRemovePendingAthleteId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const res = await fetch('/api/coach/me')
      const data = (await res.json().catch(() => ({ ok: false, error: 'Unauthorized.' }))) as MeResponse
      setMe(data)
      if (!res.ok || !data.ok) return
      const ares = await fetch('/api/coach/athletes')
      const aj = (await ares.json().catch(() => ({ ok: false, athletes: [] }))) as
        | {
            ok: true
            athletes: Array<{
              id: string
              email: string
              fullName: string | null
              since: string
              latestProgram: { id: string; name: string; canEdit: boolean } | null
            }>
          }
        | { ok: false; error?: string }
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

  async function refreshAthletes() {
    const ares = await fetch('/api/coach/athletes')
    const aj = (await ares.json().catch(() => ({ ok: false, athletes: [] }))) as
      | {
          ok: true
          athletes: Array<{
            id: string
            email: string
            fullName: string | null
            since: string
            latestProgram: { id: string; name: string; canEdit: boolean } | null
          }>
        }
      | { ok: false; error?: string }
    if (ares.ok && aj.ok) setAthletes(aj.athletes ?? [])
  }

  async function removeAthleteProgram(athleteId: string, programId: string) {
    if (
      !window.confirm(
        'Remove this program from the athlete? They will have no active program until you assign a new one.',
      )
    ) {
      return
    }
    setError(null)
    setSuccess(null)
    setRemovePendingAthleteId(athleteId)
    try {
      const res = await fetch('/api/coach/athlete-program', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ athleteId, programId }),
      })
      const json = (await res.json().catch(() => ({ ok: false, error: 'Request failed.' }))) as
        | { ok: true }
        | { ok: false; error: string }
      if (!res.ok || !json.ok) {
        setError('error' in json ? json.error : 'Could not remove program.')
        return
      }
      setSuccess('Program removed from athlete.')
      await refreshAthletes()
    } catch {
      setError('Network error.')
    } finally {
      setRemovePendingAthleteId(null)
    }
  }

  async function sendInvite() {
    setError(null)
    setSuccess(null)
    setPending(true)
    try {
      const res = await fetch('/api/coach/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ athleteEmail: inviteEmail }),
      })
      const json = (await res.json().catch(() => ({ ok: false, error: 'Invite failed.' }))) as
        | { ok: true }
        | { ok: false; error: string }
      if (!res.ok || !json.ok) {
        setError(!res.ok && (json as any).error ? (json as any).error : 'Invite failed.')
        return
      }
      setInviteEmail('')
      setSuccess('Invite sent.')
      await refreshAthletes()
    } catch {
      setError('Network error.')
    } finally {
      setPending(false)
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
              <div className="text-sm font-semibold tracking-tight text-slate-100">WELCOME, {displayName}!</div>
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
            <a className={`${styles.navItem} ${styles.navItemActive}`} href="/coach" onClick={() => setMenuOpen(false)}>
              Dashboard <span className={styles.pill}>Home</span>
            </a>
            <a className={styles.navItem} href="/coach/exercises" onClick={() => setMenuOpen(false)}>
              Exercise search <span className={styles.pill}>API</span>
            </a>
            <a className={styles.navItem} href="/coach/program" onClick={() => setMenuOpen(false)}>
              Program builder <span className={styles.pill}>Weekly</span>
            </a>
            <a
              className={`${styles.navItem} ${navExerciseLibraryActive ? styles.navItemActive : ''}`}
              href="/coach/exercise-library"
              onClick={() => setMenuOpen(false)}
            >
              My exercise library
            </a>
            <a
              className={`${styles.navItem} ${navLibraryActive ? styles.navItemActive : ''}`}
              href="/coach/program-library"
              onClick={() => setMenuOpen(false)}
            >
              My program library
            </a>
          </nav>
        </div>
      </aside>

      <main className={styles.main}>
        <div className={styles.mainInner}>
          <div className={styles.contentGrid}>
            <section className={styles.panel}>
              <h1 className={styles.title}>Coach dashboard</h1>
              <p className={styles.muted}>Invite athletes, then build full weekly programs with days and exercises.</p>
              <div className={styles.row}>
                <a className={styles.primary} href="/coach/program">
                  Program builder
                </a>
                <a className={styles.secondary} href="/coach/exercise-library">
                  My exercise library
                </a>
                <a className={styles.secondary} href="/coach/program-library">
                  My program library
                </a>
                <a className={styles.secondary} href="/coach/exercises">
                  Exercise search
                </a>
                <a className={styles.secondary} href="/admin">
                  Admin (if allowed)
                </a>
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.title} style={{ fontSize: '1.1rem' }}>
                Invite an athlete
              </div>
              <p className={styles.muted}>Enter the athlete’s email. They’ll see the invite on their dashboard.</p>
              <div className={styles.row} style={{ gap: '0.75rem' }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div className={styles.label}>Athlete email</div>
                  <input
                    className={styles.input}
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="athlete@example.com"
                    disabled={pending}
                  />
                </div>
                <button className={styles.primary} type="button" onClick={sendInvite} disabled={pending}>
                  {pending ? 'Sending…' : 'Send invite'}
                </button>
              </div>
              {error ? <div className={styles.error}>{error}</div> : null}
              {success ? <div className={styles.success}>{success}</div> : null}

              <div className={styles.title} style={{ fontSize: '1.1rem', marginTop: '1.25rem' }}>
                Your athletes
              </div>
              <div className={styles.list}>
                {athletes.map((a) => (
                  <div key={a.id} className={styles.listItem}>
                    <div className={styles.listItemTop}>
                      <div className={styles.listLeft}>
                        <div className={styles.listTitle}>{a.fullName ?? a.email}</div>
                        <div className={styles.listSub}>
                          {a.latestProgram ? (
                            <span className="text-slate-200">{formatProgramDisplayName(a.latestProgram.name)}</span>
                          ) : (
                            <span className="text-slate-500">No program assigned</span>
                          )}
                        </div>
                      </div>
                      <div className={styles.listActions}>
                        {a.latestProgram ? (
                          <a
                            className={a.latestProgram.canEdit ? styles.iconLink : styles.iconLinkMuted}
                            href={`/coach/program?programId=${encodeURIComponent(a.latestProgram.id)}&athleteId=${encodeURIComponent(a.id)}`}
                            title={a.latestProgram.canEdit ? 'Edit program' : 'View program'}
                            aria-label={a.latestProgram.canEdit ? 'Edit program' : 'View program'}
                          >
                            {a.latestProgram.canEdit ? <IconPencil /> : <IconEye />}
                          </a>
                        ) : null}
                        {a.latestProgram?.canEdit ? (
                          <button
                            type="button"
                            className={styles.iconBtnDanger}
                            disabled={removePendingAthleteId === a.id}
                            title="Remove program from athlete"
                            aria-label={
                              removePendingAthleteId === a.id ? 'Removing program…' : 'Remove program from athlete'
                            }
                            onClick={() => void removeAthleteProgram(a.id, a.latestProgram!.id)}
                          >
                            <IconTrash />
                          </button>
                        ) : null}
                        <a
                          className={styles.linkNewCompact}
                          href="/coach/program"
                          title="Create new program"
                        >
                          New
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
                {athletes.length === 0 ? <div className={styles.empty}>No athletes yet.</div> : null}
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  )
}

