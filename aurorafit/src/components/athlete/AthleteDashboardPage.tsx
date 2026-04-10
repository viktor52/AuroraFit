'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { isAiGeneratedProgramName } from '@/lib/aiProgram'
import styles from './AthleteDashboard.module.css'

type MeResponse =
  | {
      ok: true
      user: { id: string; email: string; role: 'ATHLETE'; athleteProfile?: { fullName: string | null } | null }
      sessionExpiresAt: string
      stats: { assigned: number; completed: number; remaining: number; programDays: number }
      assignedCoach: { id: string; email: string; fullName: string | null; since: string } | null
      activeProgram: { id: string; name: string; latestExercises: string[] } | null
    }
  | { ok: false; error: string }

type CoachInvite = {
  id: string
  createdAt: string
  coach: { id: string; email: string; coachProfile?: { fullName: string | null } | null }
}

type CoachInvitesResponse = { ok: true; invites: CoachInvite[] } | { ok: false; error: string }

const GOAL_OPTIONS = [
  { id: 'strength', label: 'Strength' },
  { id: 'muscle', label: 'Build muscle' },
  { id: 'fat', label: 'Lose fat' },
  { id: 'stamina', label: 'Increase stamina' },
] as const

export function AthleteDashboardPage() {
  const [me, setMe] = useState<MeResponse | null>(null)
  const [coachInvites, setCoachInvites] = useState<CoachInvite[]>([])
  const [selectedGoals, setSelectedGoals] = useState<string[]>(['strength'])
  const [additionalInfo, setAdditionalInfo] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1)
  const [daysPerWeek, setDaysPerWeek] = useState<2 | 3 | 4 | 5>(3)
  const [splitPattern, setSplitPattern] = useState<'spread' | 'consecutive' | 'two_on_one_off'>('spread')
  const [weeks, setWeeks] = useState<2 | 4 | 6 | 8>(4)

  useEffect(() => {
    ;(async () => {
      const res = await fetch('/api/athlete/me')
      const data = (await res.json().catch(() => ({ ok: false, error: 'Unauthorized.' }))) as MeResponse
      setMe(data)
      if (!res.ok || !data.ok) return
      setAdditionalInfo('Schedule: 3 days/week.\nEquipment: full gym.\nNotes: injuries, preferences, time limits.')

      const ires = await fetch('/api/athlete/coach-invites')
      const ij = (await ires.json().catch(() => ({ ok: false, invites: [] }))) as CoachInvitesResponse
      if (ires.ok && ij.ok) setCoachInvites(ij.invites ?? [])
    })()
  }, [])

  function buildGoalsText() {
    const labels = GOAL_OPTIONS.filter((g) => selectedGoals.includes(g.id)).map((g) => g.label)
    const head = labels.length ? `Goals: ${labels.join(', ')}` : 'Goals: (not specified)'
    const extra = additionalInfo.trim()
    return extra ? `${head}\n\nAdditional info:\n${extra}` : head
  }

  function toggleGoal(id: string) {
    setSelectedGoals((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  useEffect(() => {
    if (!menuOpen) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  async function requestCoach() {
    setError(null)
    setSuccess(null)
    setPending(true)
    try {
      const res = await fetch('/api/athlete/request-coach-program', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goals: buildGoalsText() }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Could not create request.')
        return
      }
      setSuccess('Request sent. A coach can now create your program.')
    } catch {
      setError('Network error.')
    } finally {
      setPending(false)
    }
  }

  async function generateGeneric() {
    setWizardStep(1)
    setWizardOpen(true)
  }

  async function runWizardGenerate() {
    setError(null)
    setSuccess(null)
    setPending(true)
    try {
      const res = await fetch('/api/athlete/generate-generic-program', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goals: buildGoalsText(),
          daysPerWeek,
          splitPattern,
          weeks,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; program?: { name: string } }
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Could not generate program.')
        return
      }
      setWizardOpen(false)
      setSuccess(`Generated and assigned: ${data.program?.name ?? 'Program'}`)
    } catch {
      setError('Network error.')
    } finally {
      setPending(false)
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  async function respondInvite(inviteId: string, action: 'accept' | 'decline') {
    setError(null)
    setSuccess(null)
    setPending(true)
    try {
      const res = await fetch('/api/athlete/coach-invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteId, action }),
      })
      const json = (await res.json().catch(() => ({ ok: false, error: 'Request failed.' }))) as
        | { ok: true }
        | { ok: false; error: string }
      if (!res.ok || !json.ok) {
        setError((json as any).error ?? 'Request failed.')
        return
      }
      setCoachInvites((prev) => prev.filter((x) => x.id !== inviteId))
      setSuccess(action === 'accept' ? 'Invite accepted.' : 'Invite declined.')
    } catch {
      setError('Network error.')
    } finally {
      setPending(false)
    }
  }

  async function deleteAiProgram() {
    if (!me?.ok || !me.activeProgram) return
    if (!isAiGeneratedProgramName(me.activeProgram.name)) return
    if (
      !window.confirm(
        'Remove this AI program from your account? You can generate a new one anytime.',
      )
    ) {
      return
    }
    setError(null)
    setSuccess(null)
    setPending(true)
    try {
      const res = await fetch('/api/athlete/program', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programId: me.activeProgram.id }),
      })
      const json = (await res.json().catch(() => ({ ok: false, error: 'Request failed.' }))) as
        | { ok: true }
        | { ok: false; error: string }
      if (!res.ok || !json.ok) {
        setError('error' in json ? json.error : 'Could not remove program.')
        return
      }
      const mer = await fetch('/api/athlete/me')
      const med = (await mer.json().catch(() => ({ ok: false, error: 'Unauthorized.' }))) as MeResponse
      setMe(med)
      setSuccess('AI program removed.')
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
          <section className={styles.panel}>
            <h1 className={styles.welcome}>Athlete dashboard</h1>
            <p className={styles.muted}>You’re not signed in.</p>
            <div className={styles.row}>
              <Link className={styles.secondary} href="/login">
                Go to login
              </Link>
            </div>
          </section>
        </div>
      </main>
    )
  }

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
              <div className="text-sm font-semibold tracking-tight text-slate-100">
                WELCOME, {me && me.ok ? (me.user.athleteProfile?.fullName ?? me.user.email) : '…'}!
              </div>
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
          <nav className={styles.nav} aria-label="Athlete navigation (mobile)">
            <a className={`${styles.navItem} ${styles.navItemActive}`} href="/athlete" onClick={() => setMenuOpen(false)}>
              Dashboard
              <span className={styles.pill}>Home</span>
            </a>
            <a className={styles.navItem} href="/athlete/program" onClick={() => setMenuOpen(false)}>
              My Program
              <span className={styles.pill}>This week</span>
            </a>
          </nav>
        </div>
      </aside>

      {wizardOpen ? (
        <>
          <div className={styles.modalOverlay} onClick={() => (pending ? null : setWizardOpen(false))} />
          <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Program generator wizard">
            <div className={styles.modalTitle}>Generate a program</div>
            {wizardStep === 1 ? (
              <>
                <p className={styles.modalMuted}>How many times per week do you want to train?</p>
                <div className={styles.modalRow}>
                  {[2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`${styles.optionBtn} ${daysPerWeek === n ? styles.optionBtnActive : ''}`}
                      onClick={() => setDaysPerWeek(n as 2 | 3 | 4 | 5)}
                    >
                      {n} days / week
                    </button>
                  ))}
                </div>
                <div className={styles.modalActions}>
                  <button className={styles.secondary} type="button" onClick={() => setWizardOpen(false)} disabled={pending}>
                    Cancel
                  </button>
                  <button className={styles.primary} type="button" onClick={() => setWizardStep(2)} disabled={pending}>
                    Next
                  </button>
                </div>
              </>
            ) : null}

            {wizardStep === 2 ? (
              <>
                <p className={styles.modalMuted}>How would you like to split your training days?</p>
                <div className={styles.modalRow}>
                  <button
                    type="button"
                    className={`${styles.optionBtn} ${splitPattern === 'spread' ? styles.optionBtnActive : ''}`}
                    onClick={() => setSplitPattern('spread')}
                  >
                    Spread out (e.g. Mon/Wed/Fri)
                  </button>
                  <button
                    type="button"
                    className={`${styles.optionBtn} ${splitPattern === 'consecutive' ? styles.optionBtnActive : ''}`}
                    onClick={() => setSplitPattern('consecutive')}
                  >
                    Consecutive days (e.g. 4 days in a row)
                  </button>
                  <button
                    type="button"
                    className={`${styles.optionBtn} ${splitPattern === 'two_on_one_off' ? styles.optionBtnActive : ''}`}
                    onClick={() => setSplitPattern('two_on_one_off')}
                  >
                    2 days on, 1 day off, repeat
                  </button>
                </div>
                <div className={styles.modalActions}>
                  <button className={styles.secondary} type="button" onClick={() => setWizardStep(1)} disabled={pending}>
                    Back
                  </button>
                  <button className={styles.primary} type="button" onClick={() => setWizardStep(3)} disabled={pending}>
                    Next
                  </button>
                </div>
              </>
            ) : null}

            {wizardStep === 3 ? (
              <>
                <p className={styles.modalMuted}>How many weeks would you like this program?</p>
                <div className={styles.modalRow}>
                  {[2, 4, 6, 8].map((w) => (
                    <button
                      key={w}
                      type="button"
                      className={`${styles.optionBtn} ${weeks === w ? styles.optionBtnActive : ''}`}
                      onClick={() => setWeeks(w as 2 | 4 | 6 | 8)}
                    >
                      {w} weeks
                    </button>
                  ))}
                </div>
                <div className={styles.modalActions}>
                  <button className={styles.secondary} type="button" onClick={() => setWizardStep(2)} disabled={pending}>
                    Back
                  </button>
                  <button className={styles.primary} type="button" onClick={runWizardGenerate} disabled={pending}>
                    {pending ? 'Generating…' : 'Generate'}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </>
      ) : null}

      <main className={styles.main}>
        <div className={styles.mainInner}>
          <div className={styles.statsGrid} aria-label="Training summary">
            <div className={styles.statCard}>
              <div className={styles.statValue}>{me && me.ok ? me.stats.assigned : 0}</div>
              <div className={styles.statLabel}>Assigned</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{me && me.ok ? me.stats.completed : 0}</div>
              <div className={styles.statLabel}>Completed</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{me && me.ok ? me.stats.remaining : 0}</div>
              <div className={styles.statLabel}>Remaining</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{me && me.ok ? me.stats.programDays : 0}</div>
              <div className={styles.statLabel}>Program days</div>
            </div>
          </div>

          <div className={styles.contentGrid}>
            <section className={styles.panel} aria-label="Assigned coach">
              <div className={styles.panelTitle}>Your coach</div>
              {me && me.ok && me.assignedCoach ? (
                <div className="mt-6">
                  <div className="text-lg font-semibold">
                    {me.assignedCoach.fullName ?? me.assignedCoach.email}
                  </div>
                  <p className={styles.muted}>
                    {me.assignedCoach.fullName ? me.assignedCoach.email : null}
                  </p>
                </div>
              ) : (
                <div className={styles.empty}>No coach assigned yet.</div>
              )}
            </section>

            <section className={styles.panel} aria-label="Coach invites">
              <div className={styles.panelTitle}>Coach invites</div>
              <p className={styles.muted}>Accepting lets that coach assign exercises to your program.</p>
              <div className={styles.inviteList}>
                {coachInvites.map((inv) => {
                  const coachName = inv.coach.coachProfile?.fullName ?? inv.coach.email
                  return (
                    <div key={inv.id} className={styles.inviteItem}>
                      <div className={styles.inviteLeft}>
                        <div className={styles.inviteTitle}>{coachName}</div>
                        <div className={styles.inviteSub}>
                          {inv.coach.coachProfile?.fullName ? inv.coach.email : 'Coach invite'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          type="button"
                          className={`${styles.smallBtn} ${styles.smallBtnPrimary}`}
                          onClick={() => respondInvite(inv.id, 'accept')}
                          disabled={pending}
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          className={`${styles.smallBtn} ${styles.smallBtnDanger}`}
                          onClick={() => respondInvite(inv.id, 'decline')}
                          disabled={pending}
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  )
                })}
                {coachInvites.length === 0 ? <div className={styles.empty}>No invites right now.</div> : null}
              </div>
            </section>

            <section className={styles.panel} aria-label="Latest assigned exercises">
              <div className={styles.panelTitle}>Latest assigned exercises</div>
              {me && me.ok && me.activeProgram?.latestExercises?.length ? (
                <ul className="mt-6 space-y-3">
                  {me.activeProgram.latestExercises.map((name) => (
                    <li key={name} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                      <span>{name}</span>
                      <span className={styles.pill}>Assigned</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className={styles.empty}>No exercises assigned yet.</div>
              )}
            </section>

            <section className={styles.panel} aria-label="Active program">
              <div className={styles.panelTitle}>Active program</div>
              {me && me.ok && me.activeProgram ? (
                <div className="mt-8">
                  <div className="text-lg font-semibold">{me.activeProgram.name}</div>
                  <p className={styles.muted}>
                    {isAiGeneratedProgramName(me.activeProgram.name)
                      ? 'This is an AI-generated plan. Remove it anytime if you want a coach-built program instead.'
                      : 'Ask your coach for progression and weekly structure.'}
                  </p>
                  {isAiGeneratedProgramName(me.activeProgram.name) ? (
                    <div className={styles.row}>
                      <button
                        type="button"
                        className={`${styles.smallBtn} ${styles.smallBtnDanger}`}
                        onClick={() => void deleteAiProgram()}
                        disabled={pending}
                      >
                        Remove AI program
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className={styles.empty}>No program assigned yet. Ask your coach!</div>
              )}
            </section>
          </div>

          <section className={styles.panel} aria-label="Request program">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className={styles.panelTitle}>Request a program</div>
                <p className={styles.muted}>Pick your goals and add details your coach should see.</p>
              </div>
              <Link className={styles.link} href="/login">
                Session help
              </Link>
            </div>

            <div className={styles.chipRow} role="group" aria-label="Goals">
              {GOAL_OPTIONS.map((g) => {
                const active = selectedGoals.includes(g.id)
                return (
                  <button
                    key={g.id}
                    type="button"
                    className={`${styles.chip} ${active ? styles.chipActive : ''}`}
                    onClick={() => toggleGoal(g.id)}
                    aria-pressed={active}
                  >
                    {g.label}
                  </button>
                )
              })}
            </div>

            <label className={styles.label} htmlFor="additional">
              Additional info (coach can see this)
            </label>
            <textarea
              id="additional"
              className={styles.textareaSmall}
              value={additionalInfo}
              onChange={(e) => setAdditionalInfo(e.target.value)}
              placeholder="Schedule, equipment, injuries, preferences, time limits…"
            />

            <div className={styles.row}>
              <button className={styles.primary} type="button" onClick={requestCoach} disabled={pending}>
                Request coach-built program
              </button>
              <button className={styles.secondary} type="button" onClick={generateGeneric} disabled={pending}>
                Get generic AI-style program
              </button>
            </div>

            {error ? <p className={styles.error}>{error}</p> : null}
            {success ? <p className={styles.success}>{success}</p> : null}
          </section>
        </div>
      </main>
    </div>
  )
}

