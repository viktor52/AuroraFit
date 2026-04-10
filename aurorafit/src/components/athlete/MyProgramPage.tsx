'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { isAiGeneratedProgramName } from '@/lib/aiProgram'
import {
  buildWeekPlan,
  progressiveOverloadVirtualLineId,
  WEEKDAY_LABELS,
  type WeekPlanExercise,
} from '@/lib/programWeekPlan'
import { formatSetMetaSummary, resolveSetTargetLines } from '@/lib/programSetTargets'
import styles from './MyProgram.module.css'

type ProgramExercise = WeekPlanExercise

type ExerciseDemoResponse =
  | { ok: true; ninja: NinjaPayload | null; videoId: string | null; watchUrl: string }
  | { ok: false; error: string }

type NinjaPayload = {
  name: string
  type: string | null
  muscle: string | null
  equipment: string | null
  difficulty: string | null
  instructions: string | null
}

type WorkoutEntry = {
  bodyWeight: boolean
  weights: string[]
}

const WORKOUT_STORAGE_KEY = 'af_program_workout_v1'

function setCountForExercise(ex: ProgramExercise) {
  const lines = resolveSetTargetLines({
    setTargets: ex.setTargets,
    sets: ex.sets,
    reps: ex.reps,
    percent1RM: ex.percent1RM,
  })
  return Math.max(1, Math.min(lines.length, 20))
}

function normalizeWorkoutEntry(raw: WorkoutEntry | undefined, setCount: number): WorkoutEntry {
  const weights = [...(raw?.weights ?? [])]
  while (weights.length < setCount) weights.push('')
  if (weights.length > setCount) weights.length = setCount
  return { bodyWeight: raw?.bodyWeight ?? false, weights }
}

function workoutLogKey(programId: string, week: number, rowKey: string) {
  return `${programId}|w${week}|${rowKey}`
}

function parseLogKey(key: string): { programId: string; week: number; rowKey: string } | null {
  const m = key.match(/^(.+)\|w(\d+)\|(.+)$/)
  if (!m) return null
  const week = Number(m[2])
  if (Number.isNaN(week)) return null
  return { programId: m[1], week, rowKey: m[3] }
}

/** Legacy log row keys: `{exerciseId}-{day}-{slot}`. New keys: program line id (UUID). */
function parseLegacyExerciseRowKey(rowKey: string): { exerciseId: string; day: number; slot: number } | null {
  const m = rowKey.match(/-(\d+)-(\d+)$/)
  if (!m) return null
  const day = Number(m[1])
  const slot = Number(m[2])
  const exerciseId = rowKey.slice(0, -m[0].length)
  if (Number.isNaN(day) || Number.isNaN(slot)) return null
  return { exerciseId, day, slot }
}

function parseWeightNum(raw: string): number | null {
  const t = raw.trim().replace(',', '.')
  if (!t) return null
  const n = Number.parseFloat(t)
  if (Number.isNaN(n) || n <= 0) return null
  return n
}

/** True when the athlete marked body weight or logged a valid weight for every set (this week). */
function isWorkoutEntryComplete(entry: WorkoutEntry, setCount: number): boolean {
  const n = Math.max(1, Math.min(20, setCount))
  const e = normalizeWorkoutEntry(entry, n)
  if (e.bodyWeight) return true
  for (let i = 0; i < n; i++) {
    const raw = (e.weights[i] ?? '').trim()
    if (!raw) return false
    if (parseWeightNum(raw) == null) return false
  }
  return true
}

/**
 * Highest per-set load logged anywhere for this program + exercise (all weeks), plus BW when
 * there is no numeric load anywhere for that exercise in this program.
 */
function computeProgramExerciseMax(
  programId: string,
  exerciseId: string,
  lineIds: Set<string>,
  log: Record<string, WorkoutEntry>,
): { weights: string[]; bodyWeight: boolean } {
  const numericMax: number[] = []
  let anyNumeric = false
  let anyBodyWeight = false

  for (const [key, entry] of Object.entries(log)) {
    const pk = parseLogKey(key)
    if (!pk || pk.programId !== programId) continue
    const rk = pk.rowKey
    const matchesLine = lineIds.has(rk)
    const leg = !matchesLine ? parseLegacyExerciseRowKey(rk) : null
    const matchesLegacy = leg?.exerciseId === exerciseId
    if (!matchesLine && !matchesLegacy) continue

    if (entry.bodyWeight) {
      anyBodyWeight = true
      continue
    }
    entry.weights.forEach((w, s) => {
      const n = parseWeightNum(w)
      if (n == null) return
      anyNumeric = true
      numericMax[s] = Math.max(numericMax[s] ?? 0, n)
    })
  }

  let hi = 0
  numericMax.forEach((n, s) => {
    if (n != null && n > 0) hi = Math.max(hi, s + 1)
  })
  const len = Math.max(hi, 1)
  const weights = Array.from({ length: len }, (_, s) => {
    const v = numericMax[s]
    return v != null && v > 0 ? String(v) : ''
  })

  const bodyWeight = !anyNumeric && anyBodyWeight

  return { weights, bodyWeight }
}

function IconInfoCircle({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 16v-5M12 8h.01"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function ExerciseEntry({
  ex,
  rowKey,
  isOpen,
  onToggle,
  workoutEntry,
  patchWorkout,
  weekNum,
  dayIndex,
  peakHints,
  peakBodyWeightOnly,
  completed,
}: {
  ex: ProgramExercise
  rowKey: string
  isOpen: boolean
  onToggle: () => void
  workoutEntry: WorkoutEntry
  patchWorkout: (fn: (cur: WorkoutEntry) => WorkoutEntry) => void
  weekNum: number
  dayIndex: number
  peakHints: string[]
  peakBodyWeightOnly: boolean
  completed: boolean
}) {
  const [demo, setDemo] = useState<ExerciseDemoResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [exerciseInfoModalOpen, setExerciseInfoModalOpen] = useState(false)
  const [portalReady, setPortalReady] = useState(false)

  const setCount = setCountForExercise(ex)
  const prescriptionLines = resolveSetTargetLines({
    setTargets: ex.setTargets,
    sets: ex.sets,
    reps: ex.reps,
    percent1RM: ex.percent1RM,
  })

  useEffect(() => {
    setPortalReady(true)
  }, [])

  useEffect(() => {
    if (!isOpen) setExerciseInfoModalOpen(false)
  }, [isOpen])

  useEffect(() => {
    if (!exerciseInfoModalOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setExerciseInfoModalOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [exerciseInfoModalOpen])

  useEffect(() => {
    if ((!isOpen && !exerciseInfoModalOpen) || demo !== null) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const q = new URLSearchParams({ name: ex.exercise.name })
        if (ex.exercise.id) q.set('exerciseId', ex.exercise.id)
        const res = await fetch(`/api/athlete/exercise-demo?${q.toString()}`)
        const json = (await res.json().catch(() => ({
          ok: false,
          error: 'Could not load details.',
        }))) as ExerciseDemoResponse
        if (!cancelled) setDemo(json.ok ? json : { ok: false, error: 'Could not load details.' })
      } catch {
        if (!cancelled) setDemo({ ok: false, error: 'Could not load details.' })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isOpen, exerciseInfoModalOpen, demo, ex.exercise.id, ex.exercise.name])

  const progressiveHint =
    ex.progressiveDerived === true
      ? 'Auto progression: +5% 1RM and −2 reps for each week after the anchor week.'
      : ex.progressiveOverload === true
        ? 'Progressive overload: later weeks add +5% 1RM and −2 reps until you add a custom week.'
        : null

  const prescriptionSummary = formatSetMetaSummary(prescriptionLines)

  const exerciseInfoModal =
    portalReady && exerciseInfoModalOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            className={styles.modalOverlay}
            role="presentation"
            onClick={() => setExerciseInfoModalOpen(false)}
          >
            <div
              className={styles.modalCard}
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${rowKey}-exercise-info-title`}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className={styles.modalClose}
                aria-label="Close"
                onClick={() => setExerciseInfoModalOpen(false)}
              >
                ×
              </button>
              <h3 id={`${rowKey}-exercise-info-title`} className={styles.modalTitle}>
                {ex.exercise.name}
              </h3>
              <div className={styles.modalBody}>
                {ex.notes?.trim() ? (
                  <div>
                    <p className={styles.modalSectionLabel}>Coach notes</p>
                    <p className="text-sm text-slate-300">{ex.notes.trim()}</p>
                  </div>
                ) : null}

                {ex.notes?.trim() ? <div className={styles.modalDivider} /> : null}

                <p className={styles.modalSectionLabel}>{'Demo & how-to'}</p>
                {loading ? <p className={styles.modalMuted}>Loading video and exercise details…</p> : null}
                {!loading && demo && !demo.ok ? <p className={styles.modalMuted}>{demo.error}</p> : null}
                {!loading && demo && demo.ok ? (
                  <>
                    {demo.videoId ? (
                      <div className={styles.modalVideoWrap}>
                        <iframe
                          className={styles.videoIframe}
                          src={`https://www.youtube-nocookie.com/embed/${demo.videoId}?rel=0`}
                          title={`${ex.exercise.name} demo`}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          allowFullScreen
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <p className={styles.modalMuted}>
                        No embeddable video was found. Use the YouTube link below.
                      </p>
                    )}
                    <a
                      className={styles.youtubeLink}
                      href={demo.watchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {demo.videoId ? 'Open the same video on YouTube' : 'Search on YouTube'}
                    </a>
                    {demo.ninja ? (
                      <>
                        <div className={styles.ninjaMeta}>
                          {[demo.ninja.muscle, demo.ninja.equipment, demo.ninja.difficulty, demo.ninja.type]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                        {demo.ninja.instructions ? (
                          <p className={styles.modalNinjaInstructions}>{demo.ninja.instructions.trim()}</p>
                        ) : null}
                      </>
                    ) : (
                      <p className={styles.modalMuted}>No API Ninjas match for this name.</p>
                    )}
                  </>
                ) : null}
                {ex.exercise.description?.trim() && (!demo?.ok || !demo.ninja?.instructions) ? (
                  <div className="mt-3">
                    <p className={styles.modalSectionLabel}>About this exercise</p>
                    <p className="text-sm leading-relaxed text-slate-300">{ex.exercise.description.trim()}</p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <div
      className={`${styles.exerciseCard} ${completed ? styles.exerciseCardComplete : ''}`}
      data-completed={completed ? 'true' : undefined}
    >
      {exerciseInfoModal}
      <button
        type="button"
        className={`${styles.exerciseThumb} ${completed ? styles.exerciseThumbComplete : ''}`}
        aria-expanded={isOpen}
        aria-controls={`${rowKey}-panel`}
        id={`${rowKey}-btn`}
        onClick={onToggle}
      >
        <span className={styles.exerciseThumbName}>{ex.exercise.name}</span>
        <span className={styles.chevron} aria-hidden>
          {isOpen ? '▾' : '▸'}
        </span>
      </button>
      <div
        id={`${rowKey}-panel`}
        role="region"
        aria-labelledby={`${rowKey}-btn`}
        className={`${styles.exerciseExpand} ${!isOpen ? styles.exerciseExpandHidden : ''}`}
      >
        <div className={styles.prescriptionBtnRow}>
          <button
            type="button"
            className={styles.infoPrescriptionBtn}
            onClick={() => setExerciseInfoModalOpen(true)}
          >
            <IconInfoCircle />
            Exercise info
          </button>
        </div>

        <p className={styles.prescriptionSummary} aria-label="Prescription for this week">
          <span className={styles.prescriptionSummaryLabel}>This week · </span>
          {prescriptionSummary}
        </p>

        {progressiveHint ? <p className={styles.expandMuted}>{progressiveHint}</p> : null}

        <div className={styles.logSection}>
          <div className={styles.logTitle}>Weights this session</div>
          <div className={styles.logActions}>
            <button
              type="button"
              className={`${styles.bodyWeightBtn} ${workoutEntry.bodyWeight ? styles.bodyWeightBtnActive : ''}`}
              aria-pressed={workoutEntry.bodyWeight}
              onClick={() =>
                patchWorkout((cur) => ({ ...cur, bodyWeight: !cur.bodyWeight }))
              }
            >
              Body weight
            </button>
          </div>
          <div className={styles.setRows}>
            <div className={styles.setColumnLabels} aria-hidden="true">
              <span>#</span>
              <span>Weight</span>
            </div>
            {Array.from({ length: setCount }, (_, i) => {
              const peak = (peakHints[i] ?? '').trim()
              const usePeakPlaceholder =
                !workoutEntry.bodyWeight && (weekNum > 1 || dayIndex > 0) && (!!peak || peakBodyWeightOnly)
              const placeholder = workoutEntry.bodyWeight
                ? '—'
                : usePeakPlaceholder
                  ? peak || (peakBodyWeightOnly ? 'Body weight' : '')
                  : 'e.g. 60'
              return (
                <div key={i} className={styles.setRow}>
                  <span className={styles.setIndex}>{i + 1}</span>
                  <div className={styles.setWeightCell}>
                    <input
                      type="text"
                      inputMode="decimal"
                      className={styles.setInput}
                      disabled={workoutEntry.bodyWeight}
                      placeholder={placeholder}
                      value={workoutEntry.bodyWeight ? '' : (workoutEntry.weights[i] ?? '')}
                      onChange={(e) =>
                        patchWorkout((cur) => {
                          const w = [...cur.weights]
                          w[i] = e.target.value
                          return { ...cur, weights: w }
                        })
                      }
                      aria-label={`Weight for set ${i + 1}`}
                    />
                    <span className={styles.setSuffix}>{workoutEntry.bodyWeight ? 'BW' : 'kg'}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

type ProgramResponse =
  | { ok: true; program: null }
  | {
      ok: true
      assignedAt: string
      schedule: {
        daysPerWeek: number
        splitPattern: string
        weeks: number
        customTrainingDays: number[] | null
      }
      program: { id: string; name: string; description: string | null; exercises: ProgramExercise[] }
    }
  | { ok: false; error: string }

const DAYS = [...WEEKDAY_LABELS]

export function MyProgramPage() {
  const [data, setData] = useState<ProgramResponse | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeWeek, setActiveWeek] = useState(1)
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null)
  const [workoutLog, setWorkoutLog] = useState<Record<string, WorkoutEntry>>({})
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(WORKOUT_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        setWorkoutLog(parsed as Record<string, WorkoutEntry>)
      }
    } catch {
      /* ignore */
    }
  }, [])

  const programId = data && data.ok && data.program ? data.program.id : null
  useEffect(() => {
    setExpandedRowKey(null)
  }, [activeWeek, programId])

  useEffect(() => {
    ;(async () => {
      const res = await fetch('/api/athlete/program')
      const json = (await res.json().catch(() => ({ ok: false, error: 'Unauthorized.' }))) as ProgramResponse
      if (!res.ok) setData({ ok: false, error: 'Unauthorized.' })
      else setData(json)
    })()
  }, [])

  const week = useMemo(() => {
    if (!data || !data.ok || !data.program) return null
    const totalWeeks = Math.max(1, data.schedule?.weeks ?? 4)
    const clamped = Math.max(1, Math.min(activeWeek, totalWeeks))
    if (clamped !== activeWeek) setActiveWeek(clamped)
    return buildWeekPlan({
      exercises: data.program.exercises,
      daysPerWeek: data.schedule?.daysPerWeek ?? 3,
      splitPattern: data.schedule?.splitPattern ?? 'spread',
      customTrainingDays: data.schedule?.customTrainingDays ?? null,
      weekIndex: clamped - 1,
      seedKey: data.program.id,
    })
  }, [data, activeWeek])

  const lineIdsByExerciseId = useMemo(() => {
    const m = new Map<string, Set<string>>()
    if (!data || !data.ok || !data.program) return m
    const totalWeeks = Math.max(1, data.schedule?.weeks ?? 4)
    for (const row of data.program.exercises) {
      const eid = row.exercise.id
      if (!m.has(eid)) m.set(eid, new Set())
      m.get(eid)!.add(row.id)
      if (row.progressiveOverload) {
        const anchorWeek = row.weekNumber ?? 1
        for (let w = anchorWeek + 1; w <= totalWeeks; w++) {
          m.get(eid)!.add(progressiveOverloadVirtualLineId(row.id, w))
        }
      }
    }
    return m
  }, [data])

  const peakByExerciseId = useMemo(() => {
    if (!data || !data.ok || !data.program) return {} as Record<string, ReturnType<typeof computeProgramExerciseMax>>
    const pid = data.program.id
    const map: Record<string, ReturnType<typeof computeProgramExerciseMax>> = {}
    for (const pe of data.program.exercises) {
      const id = pe.exercise.id
      if (!map[id]) {
        const lines = lineIdsByExerciseId.get(id) ?? new Set<string>()
        map[id] = computeProgramExerciseMax(pid, id, lines, workoutLog)
      }
    }
    return map
  }, [data, workoutLog, lineIdsByExerciseId])

  function patchWorkoutForRow(logKey: string, setCount: number, fn: (cur: WorkoutEntry) => WorkoutEntry) {
    setWorkoutLog((prev) => {
      const cur = normalizeWorkoutEntry(prev[logKey], setCount)
      const nextEntry = normalizeWorkoutEntry(fn(cur), setCount)
      const merged = { ...prev, [logKey]: nextEntry }
      try {
        localStorage.setItem(WORKOUT_STORAGE_KEY, JSON.stringify(merged))
      } catch {
        /* ignore */
      }
      return merged
    })
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  async function deleteAiProgram() {
    if (!data?.ok || !data.program) return
    if (!isAiGeneratedProgramName(data.program.name)) return
    if (
      !window.confirm(
        'Remove this AI program from your account? Workout notes saved in the browser for this program will no longer apply.',
      )
    ) {
      return
    }
    setDeleteError(null)
    setDeletePending(true)
    try {
      const res = await fetch('/api/athlete/program', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programId: data.program.id }),
      })
      const json = (await res.json().catch(() => ({ ok: false, error: 'Request failed.' }))) as
        | { ok: true }
        | { ok: false; error: string }
      if (!res.ok || !json.ok) {
        setDeleteError('error' in json ? json.error : 'Could not remove program.')
        return
      }
      const next = await fetch('/api/athlete/program')
      const nextJson = (await next.json().catch(() => ({
        ok: false,
        error: 'Unauthorized.',
      }))) as ProgramResponse
      if (!next.ok) setData({ ok: false, error: 'Unauthorized.' })
      else setData(nextJson)
    } catch {
      setDeleteError('Network error.')
    } finally {
      setDeletePending(false)
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <div className={styles.brand}>
            <button className={styles.hamburger} type="button" onClick={() => setMenuOpen(true)}>
              Menu
            </button>
            <div className={styles.brandText}>
              <div className="text-[11px] uppercase tracking-wide text-slate-400">AuroraFit</div>
              <div className="text-sm font-semibold tracking-tight text-slate-100">My program</div>
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
        <nav className={styles.nav}>
          <a className={styles.navItem} href="/athlete" onClick={() => setMenuOpen(false)}>
            Dashboard <span className={styles.pill}>Home</span>
          </a>
          <a className={styles.navItem} href="/athlete/program" onClick={() => setMenuOpen(false)}>
            My Program <span className={styles.pill}>This week</span>
          </a>
        </nav>
      </aside>

      <main className={styles.mainInner}>
        {data && !data.ok ? (
          <div className={styles.empty}>You’re not signed in. Please log in again.</div>
        ) : null}

        {data && data.ok && !data.program ? (
          <div className={styles.empty}>No program assigned yet. Generate one on the dashboard or ask a coach.</div>
        ) : null}

        {data && data.ok && data.program ? (
          <>
            <h1 className={styles.title}>{data.program.name}</h1>
            <p className={styles.muted}>
              {data.program.description ?? 'This is your current weekly plan.'}
            </p>
            <p className={styles.muted}>
              Schedule: {data.schedule.daysPerWeek}x/week · {data.schedule.weeks} weeks
            </p>
            {isAiGeneratedProgramName(data.program.name) ? (
              <>
                <button
                  type="button"
                  className={styles.removeAiBtn}
                  onClick={() => void deleteAiProgram()}
                  disabled={deletePending}
                >
                  {deletePending ? 'Removing…' : 'Remove AI program'}
                </button>
                {deleteError ? <p className={styles.error}>{deleteError}</p> : null}
              </>
            ) : null}

            <div className={styles.tabs} role="tablist" aria-label="Program weeks">
              {Array.from({ length: Math.max(1, data.schedule.weeks) }, (_, i) => i + 1).map((w) => (
                <button
                  key={w}
                  type="button"
                  role="tab"
                  aria-selected={activeWeek === w}
                  className={`${styles.tab} ${activeWeek === w ? styles.tabActive : ''}`}
                  onClick={() => setActiveWeek(w)}
                >
                  Week {w}
                </button>
              ))}
            </div>

            <div className={styles.grid} aria-label="Weekly program grid">
              {DAYS.map((day, i) => (
                <section key={day} className={styles.dayCard} aria-label={`${day} plan`}>
                  <div className={styles.dayTitle}>{day}</div>
                  {week && week[i].length ? (
                    week[i].map((ex) => {
                      const rowKey = ex.id
                      const logKey = workoutLogKey(data.program.id, activeWeek, rowKey)
                      const setCount = setCountForExercise(ex)
                      const entry = normalizeWorkoutEntry(workoutLog[logKey], setCount)
                      const peak = peakByExerciseId[ex.exercise.id] ?? {
                        weights: [] as string[],
                        bodyWeight: false,
                      }
                      const peakHints = normalizeWorkoutEntry(
                        { bodyWeight: false, weights: peak.weights },
                        setCount,
                      ).weights
                      const peakBodyWeightOnly = peak.bodyWeight
                      const completed = isWorkoutEntryComplete(entry, setCount)
                      return (
                        <ExerciseEntry
                          key={rowKey}
                          rowKey={rowKey}
                          ex={ex}
                          isOpen={expandedRowKey === rowKey}
                          onToggle={() =>
                            setExpandedRowKey((k) => (k === rowKey ? null : rowKey))
                          }
                          workoutEntry={entry}
                          weekNum={activeWeek}
                          dayIndex={i}
                          peakHints={peakHints}
                          peakBodyWeightOnly={peakBodyWeightOnly}
                          completed={completed}
                          patchWorkout={(fn) => patchWorkoutForRow(logKey, setCount, fn)}
                        />
                      )
                    })
                  ) : (
                    <div className={styles.muted} style={{ marginTop: '0.75rem' }}>
                      Rest / mobility
                    </div>
                  )}
                </section>
              ))}
            </div>
          </>
        ) : null}
      </main>
    </div>
  )
}

