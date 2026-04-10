'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { resolveTrainingDayIndices, WEEKDAY_LABELS } from '@/lib/programWeekPlan'
import {
  mapSetTargetsProgressive,
  normalizeSetTargetLines,
  parseSetTargetsJson,
  SET_TARGETS_MAX,
} from '@/lib/programSetTargets'
import styles from './CoachProgramBuilder.module.css'

type SearchResult = {
  name: string
  type?: string
  muscle?: string
  equipment?: string
  difficulty?: string
  instructions?: string
  source?: 'library' | 'api'
}

type SearchResponse = { ok: true; results: SearchResult[] } | { ok: false; error: string }

type Athlete = { id: string; email: string; fullName: string | null }
type AthletesResponse = { ok: true; athletes: Athlete[] } | { ok: false; error: string }

type PlannedExercise = {
  clientId: string
  name: string
  description: string
  setLines: Array<{ reps: number; percent1RM: number | '' }>
  notes: string
  progressiveOverload: boolean
  exerciseId?: string
  progressiveDerived?: boolean
}

type LoadResponse =
  | {
      ok: true
      canEdit: boolean
      athleteId: string
      assignment: {
        daysPerWeek: number
        splitPattern: string
        weeks: number
        customTrainingDays: number[] | null
      }
      program: {
        id: string
        name: string
        exercises: Array<{
          id: string
          weekNumber: number | null
          sortOrder: number
          templateDayIndex: number | null
          sets: number | null
          reps: number | null
          percent1RM: number | null
          setTargets: unknown
          notes: string | null
          progressiveOverload: boolean
          exercise: { id: string; name: string; description: string | null }
        }>
      }
      programTitleHint: string
      libraryEdit?: boolean
    }
  | { ok: false; error: string }

function newClientId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `x-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function clonePlannedExercise(row: PlannedExercise): PlannedExercise {
  return {
    ...row,
    clientId: newClientId(),
    setLines: row.setLines.map((l) => ({ reps: l.reps, percent1RM: l.percent1RM })),
    progressiveDerived: undefined,
  }
}

/** Deep-copy week grid; empty days in weeks 2+ are filled from week 1 (same training day). PO adjusts reps/% when the week 1 row has progressive overload. */
function fillFollowingWeeksFromWeekOne(
  slots: PlannedExercise[][][],
  totalWeeks: number,
  daysPerWeek: number,
): PlannedExercise[][][] {
  const next = slots.map((week) =>
    week.map((day) =>
      day.map((row) => ({
        ...row,
        setLines: row.setLines.map((l) => ({ reps: l.reps, percent1RM: l.percent1RM })),
      })),
    ),
  )
  const template = next[0]
  if (!template) return next

  for (let w = 1; w < totalWeeks; w++) {
    for (let d = 0; d < daysPerWeek; d++) {
      if ((next[w][d]?.length ?? 0) > 0) continue
      const source = template[d] ?? []
      if (source.length === 0) continue
      next[w][d] = source.map((row) => {
        const cloned = clonePlannedExercise(row)
        if (row.progressiveOverload) {
          const lines = row.setLines.map((l) => ({
            reps: l.reps,
            percent1RM: l.percent1RM === '' ? null : l.percent1RM,
          }))
          const adj = mapSetTargetsProgressive(lines, 1, w + 1)
          cloned.setLines = adj.map((l) => ({ reps: l.reps, percent1RM: l.percent1RM ?? '' }))
        }
        cloned.progressiveOverload = false
        return cloned
      })
    }
  }
  return next
}

function emptySlots(n: number): PlannedExercise[][] {
  return Array.from({ length: n }, () => [])
}

function emptyWeeks(weekCount: number, dayCount: number): PlannedExercise[][][] {
  return Array.from({ length: weekCount }, () => emptySlots(dayCount))
}

function buildMeta(r: SearchResult) {
  if (r.source === 'library') {
    const rest = [r.muscle, r.equipment, r.difficulty, r.type].filter(Boolean).join(' · ')
    return rest ? `Library · ${rest}` : 'Library'
  }
  return [r.muscle, r.equipment, r.difficulty, r.type].filter(Boolean).join(' · ')
}

function coachSetLinesFromProgramExercise(pe: {
  setTargets?: unknown
  sets: number | null
  reps: number | null
  percent1RM: number | null
}): PlannedExercise['setLines'] {
  const parsed = parseSetTargetsJson(pe.setTargets)
  if (parsed && parsed.length > 0) {
    return parsed.map((l) => ({ reps: l.reps, percent1RM: l.percent1RM ?? '' }))
  }
  return normalizeSetTargetLines(pe.sets, pe.reps, pe.percent1RM).map((l) => ({
    reps: l.reps,
    percent1RM: l.percent1RM ?? '',
  }))
}

export function CoachProgramBuilderPage() {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const programIdParam = searchParams.get('programId') ?? ''
  const athleteIdParam = searchParams.get('athleteId') ?? ''
  const libraryEditMode = Boolean(programIdParam && searchParams.get('library') === '1')
  const athleteEditMode = Boolean(programIdParam && athleteIdParam)
  const isEditMode = athleteEditMode || libraryEditMode

  const [menuOpen, setMenuOpen] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [viewOnly, setViewOnly] = useState(false)
  const [hydrated, setHydrated] = useState(!isEditMode)

  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [athleteId, setAthleteId] = useState('')
  const [programName, setProgramName] = useState('')
  const [weeks, setWeeks] = useState(4)
  const [daysPerWeek, setDaysPerWeek] = useState(3)
  const [splitPattern, setSplitPattern] = useState<'spread' | 'consecutive' | 'two_on_one_off' | 'custom'>(
    'spread',
  )
  const [customPick, setCustomPick] = useState<boolean[]>(() => Array(7).fill(false))
  const [activeProgramWeek, setActiveProgramWeek] = useState(1)
  const [activeSlot, setActiveSlot] = useState(0)
  const [slotsByWeek, setSlotsByWeek] = useState<PlannedExercise[][][]>(() => emptyWeeks(4, 3))

  const [name, setName] = useState('')
  const [muscle, setMuscle] = useState('')
  const [type, setType] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [equipment, setEquipment] = useState('')
  const [pending, setPending] = useState(false)
  const [publishPending, setPublishPending] = useState(false)
  const [removePending, setRemovePending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [results, setResults] = useState<SearchResult[]>([])

  const [ceName, setCeName] = useState('')
  const [ceDesc, setCeDesc] = useState('')
  const [ceYoutube, setCeYoutube] = useState('')
  const [cePending, setCePending] = useState(false)
  const [saveLibKey, setSaveLibKey] = useState<string | null>(null)

  const formLocked = viewOnly || !hydrated || !!loadError
  const navProgramActive = pathname === '/coach/program'
  const navLibraryActive = pathname === '/coach/program-library'
  const navExerciseLibraryActive = pathname === '/coach/exercise-library'

  useEffect(() => {
    if (!menuOpen) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  useEffect(() => {
    if (!isEditMode) {
      setHydrated(true)
      setViewOnly(false)
      setLoadError(null)
      return
    }
    setHydrated(false)
    setLoadError(null)
    let cancelled = false
    ;(async () => {
      const res = await fetch(
        libraryEditMode
          ? `/api/coach/programs/${encodeURIComponent(programIdParam)}?library=1`
          : `/api/coach/programs/${encodeURIComponent(programIdParam)}?athleteId=${encodeURIComponent(athleteIdParam)}`,
      )
      const data = (await res.json().catch(() => ({ ok: false, error: 'Load failed.' }))) as LoadResponse
      if (cancelled) return
      if (!res.ok || !data.ok) {
        setLoadError((data as { error?: string }).error ?? 'Could not load program.')
        setHydrated(true)
        return
      }
      setAthleteId(data.athleteId || '')
      setProgramName(data.programTitleHint)
      setWeeks(data.assignment.weeks)
      setDaysPerWeek(data.assignment.daysPerWeek)
      setSplitPattern(data.assignment.splitPattern as typeof splitPattern)
      if (data.assignment.splitPattern === 'custom' && data.assignment.customTrainingDays) {
        const pick = Array(7).fill(false) as boolean[]
        for (const i of data.assignment.customTrainingDays) {
          if (i >= 0 && i < 7) pick[i] = true
        }
        setCustomPick(pick)
      } else {
        setCustomPick(Array(7).fill(false))
      }
      const W = data.assignment.weeks
      const n = data.assignment.daysPerWeek
      const next = emptyWeeks(W, n)
      const allLegacy = data.program.exercises.every((pe) => pe.weekNumber == null)
      if (allLegacy) {
        const template = emptySlots(n)
        for (const pe of data.program.exercises) {
          const t = pe.templateDayIndex != null ? pe.templateDayIndex : 0
          const d = Math.min(Math.max(0, t), n - 1)
          template[d].push({
            clientId: pe.exercise.id,
            name: pe.exercise.name,
            description: pe.exercise.description ?? '',
            setLines: coachSetLinesFromProgramExercise(pe),
            notes: pe.notes ?? '',
            progressiveOverload: pe.progressiveOverload ?? false,
            exerciseId: pe.exercise.id,
          })
        }
        for (let w = 0; w < W; w++) {
          for (let d = 0; d < n; d++) {
            next[w][d] = template[d].map((row) => ({
              ...row,
              clientId: newClientId(),
            }))
          }
        }
      } else {
        for (const pe of data.program.exercises) {
          const wn = pe.weekNumber ?? 1
          const wi = wn - 1
          if (wi < 0 || wi >= W) continue
          const t = pe.templateDayIndex != null ? pe.templateDayIndex : 0
          const d = Math.min(Math.max(0, t), n - 1)
          next[wi][d].push({
            clientId: pe.id,
            name: pe.exercise.name,
            description: pe.exercise.description ?? '',
            setLines: coachSetLinesFromProgramExercise(pe),
            notes: pe.notes ?? '',
            progressiveOverload: pe.progressiveOverload ?? false,
            exerciseId: pe.exercise.id,
          })
        }
      }
      setSlotsByWeek(next)
      setActiveProgramWeek(1)
      setViewOnly(!data.canEdit)
      setHydrated(true)
    })()
    return () => {
      cancelled = true
    }
  }, [isEditMode, programIdParam, athleteIdParam, libraryEditMode])

  useEffect(() => {
    ;(async () => {
      const res = await fetch('/api/coach/athletes')
      const json = (await res.json().catch(() => ({ ok: false, athletes: [] }))) as AthletesResponse
      if (res.ok && json.ok) {
        setAthletes(json.athletes ?? [])
      }
    })()
  }, [])

  useEffect(() => {
    setSlotsByWeek((prev) => {
      const wCount = Math.max(1, weeks)
      const dCount = Math.max(2, daysPerWeek)
      const next = emptyWeeks(wCount, dCount)
      for (let wi = 0; wi < Math.min(prev.length, wCount); wi++) {
        for (let di = 0; di < Math.min(prev[wi]?.length ?? 0, dCount); di++) {
          next[wi][di] = prev[wi][di] ? [...prev[wi][di]] : []
        }
      }
      return next
    })
    setActiveSlot((s) => Math.min(s, Math.max(0, daysPerWeek - 1)))
    setActiveProgramWeek((aw) => Math.min(aw, Math.max(1, weeks)))
  }, [daysPerWeek, weeks])

  const customIndicesSorted = useMemo(() => {
    const out: number[] = []
    for (let i = 0; i < 7; i++) if (customPick[i]) out.push(i)
    return out.sort((a, b) => a - b)
  }, [customPick])

  const calendarLabels = useMemo(() => {
    const idx = resolveTrainingDayIndices(
      daysPerWeek,
      splitPattern,
      splitPattern === 'custom' ? customIndicesSorted : null,
    )
    return idx.map((i) => WEEKDAY_LABELS[i])
  }, [daysPerWeek, splitPattern, customIndicesSorted])

  const coachWeekIndex = Math.min(
    Math.max(0, activeProgramWeek - 1),
    Math.max(0, slotsByWeek.length - 1),
  )
  /** Raw week data only — each program week is editable (no read-only progressive “preview” rows). */
  const coachWeekSlots = useMemo(() => {
    const week = slotsByWeek[coachWeekIndex]
    return Array.from({ length: daysPerWeek }, (_, d) => (week?.[d] ? [...week[d]] : []))
  }, [slotsByWeek, coachWeekIndex, daysPerWeek])

  const canSearch = !!(name.trim() || muscle.trim() || type.trim() || difficulty.trim() || equipment.trim())

  async function runSearch() {
    setError(null)
    setSuccess(null)
    setPending(true)
    try {
      const url = new URL('/api/coach/exercises/search', window.location.origin)
      if (name.trim()) url.searchParams.set('name', name.trim())
      if (muscle.trim()) url.searchParams.set('muscle', muscle.trim())
      if (type.trim()) url.searchParams.set('type', type.trim())
      if (difficulty.trim()) url.searchParams.set('difficulty', difficulty.trim())
      if (equipment.trim()) url.searchParams.set('equipment', equipment.trim())
      const res = await fetch(url.toString())
      const json = (await res.json().catch(() => ({ ok: false, error: 'Search failed.' }))) as SearchResponse
      if (!res.ok || !json.ok) {
        setError((json as { error?: string }).error ?? 'Search failed.')
        setResults([])
        return
      }
      setResults(json.results ?? [])
    } catch {
      setError('Network error.')
      setResults([])
    } finally {
      setPending(false)
    }
  }

  async function saveExerciseToLibrary(r: SearchResult) {
    setError(null)
    setSuccess(null)
    setSaveLibKey(`${r.name}-${r.source ?? 'x'}`)
    try {
      const res = await fetch('/api/coach/exercise-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: r.name,
          instructions: r.instructions ?? '',
          type: r.type,
          muscle: r.muscle,
          equipment: r.equipment,
          difficulty: r.difficulty,
        }),
      })
      const json = (await res.json().catch(() => ({ ok: false, error: 'Save failed.' }))) as
        | { ok: true }
        | { ok: false; error: string }
      if (!res.ok || !json.ok) {
        setError((json as { error?: string }).error ?? 'Could not save to library.')
        return
      }
      setSuccess(`Saved “${r.name}” to My exercise library.`)
    } catch {
      setError('Network error.')
    } finally {
      setSaveLibKey(null)
    }
  }

  async function createLibraryExercise() {
    setError(null)
    setSuccess(null)
    setCePending(true)
    try {
      const res = await fetch('/api/coach/exercises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: ceName.trim(),
          description: ceDesc.trim(),
          youtubeUrl: ceYoutube.trim(),
        }),
      })
      const json = (await res.json().catch(() => ({ ok: false, error: 'Request failed.' }))) as
        | { ok: true; exercise?: { name: string } }
        | { ok: false; error: string }
      if (!res.ok || !json.ok) {
        setError((json as { error?: string }).error ?? 'Could not create exercise.')
        return
      }
      setCeName('')
      setCeDesc('')
      setCeYoutube('')
      setSuccess(
        `Saved “${json.exercise?.name ?? 'exercise'}” to the shared library. Search by name to add it to a day.`,
      )
    } catch {
      setError('Network error.')
    } finally {
      setCePending(false)
    }
  }

  function addExercise(r: SearchResult) {
    const ex: PlannedExercise = {
      clientId: newClientId(),
      name: r.name,
      description: r.instructions?.trim() ?? '',
      setLines: [{ reps: 10, percent1RM: '' }],
      notes: '',
      progressiveOverload: false,
    }
    setSlotsByWeek((prev) => {
      const next = prev.map((week) => week.map((day) => [...day]))
      const wi = Math.min(Math.max(0, activeProgramWeek - 1), next.length - 1)
      const slot = Math.min(activeSlot, daysPerWeek - 1)
      next[wi][slot] = [...next[wi][slot], ex]
      return next
    })
  }

  function removeExercise(weekIndex: number, slotIndex: number, clientId: string) {
    setSlotsByWeek((prev) => {
      const next = prev.map((week) => week.map((day) => [...day]))
      next[weekIndex][slotIndex] = next[weekIndex][slotIndex].filter((x) => x.clientId !== clientId)
      return next
    })
  }

  function patchExercise(
    weekIndex: number,
    slotIndex: number,
    clientId: string,
    fn: (p: PlannedExercise) => PlannedExercise,
  ) {
    setSlotsByWeek((prev) => {
      const next = prev.map((week) => week.map((day) => [...day]))
      next[weekIndex][slotIndex] = next[weekIndex][slotIndex].map((x) =>
        x.clientId === clientId ? fn(x) : x,
      )
      return next
    })
  }

  /** Replace the same training day in all later weeks with a deep copy of this week’s day. */
  function copyDayToFollowingWeeks(dayIndex: number) {
    setError(null)
    setSuccess(null)
    const wi = coachWeekIndex
    const source = slotsByWeek[wi]?.[dayIndex] ?? []
    if (source.length === 0) {
      setError('Add at least one exercise to this day before copying.')
      return
    }
    if (wi >= slotsByWeek.length - 1) {
      setError('There are no later weeks to copy into.')
      return
    }
    let willReplace = false
    for (let w = wi + 1; w < slotsByWeek.length; w++) {
      if ((slotsByWeek[w]?.[dayIndex]?.length ?? 0) > 0) {
        willReplace = true
        break
      }
    }
    if (
      willReplace &&
      !window.confirm(
        'This will replace all exercises on this day in every later week with a copy of this week’s day. Continue?',
      )
    ) {
      return
    }
    setSlotsByWeek((prev) => {
      const next = prev.map((week) => week.map((day) => [...day]))
      const sourceRows = prev[wi]?.[dayIndex] ?? []
      for (let w = wi + 1; w < next.length; w++) {
        next[w][dayIndex] = sourceRows.map((row) => clonePlannedExercise(row))
      }
      return next
    })
    const wkLabel =
      wi + 2 === weeks ? `week ${weeks}` : `weeks ${wi + 2}–${weeks}`
    setSuccess(`Copied day ${dayIndex + 1} to ${wkLabel}. Each week stays editable.`)
  }

  function toggleCustomDay(i: number) {
    setCustomPick((prev) => {
      const next = [...prev]
      if (next[i]) {
        next[i] = false
        return next
      }
      const count = next.filter(Boolean).length
      if (count >= daysPerWeek) return prev
      next[i] = true
      return next
    })
  }

  async function publish() {
    setError(null)
    setSuccess(null)
    if (athleteEditMode && !athleteId.trim()) {
      setError('Missing athlete.')
      return
    }
    if (splitPattern === 'custom') {
      if (customIndicesSorted.length !== daysPerWeek) {
        setError(`Pick exactly ${daysPerWeek} weekdays for a custom schedule.`)
        return
      }
    }

    const slotsForPublish = fillFollowingWeeksFromWeekOne(slotsByWeek, weeks, daysPerWeek)

    const flat: Array<{
      name: string
      description: string
      weekNumber: number
      templateDayIndex: number
      setTargets: Array<{ reps: number; percent1RM: number | null }>
      notes: string
      progressiveOverload: boolean
    }> = []

    for (let w = 0; w < weeks; w++) {
      for (let d = 0; d < daysPerWeek; d++) {
        for (const row of slotsForPublish[w]?.[d] ?? []) {
          const setTargets = row.setLines.map((sl) => ({
            reps: Math.max(1, Math.min(50, sl.reps)),
            percent1RM: sl.percent1RM === '' ? null : Math.max(1, Math.min(100, sl.percent1RM)),
          }))
          flat.push({
            name: row.name,
            description: row.description,
            weekNumber: w + 1,
            templateDayIndex: d,
            setTargets,
            notes: row.notes,
            progressiveOverload: row.progressiveOverload === true,
          })
        }
      }
    }

    if (flat.length === 0) {
      setError('Add at least one exercise to a training day.')
      return
    }

    setPublishPending(true)
    try {
      if (libraryEditMode) {
        const res = await fetch(`/api/coach/programs/${encodeURIComponent(programIdParam)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            libraryEdit: true,
            programName: programName.trim() || undefined,
            weeks,
            daysPerWeek,
            splitPattern,
            customTrainingDays: splitPattern === 'custom' ? customIndicesSorted : undefined,
            exercises: flat,
          }),
        })
        const json = (await res.json().catch(() => ({ ok: false, error: 'Save failed.' }))) as
          | { ok: true; program?: { name: string } }
          | { ok: false; error: string }
        if (!res.ok || !json.ok) {
          setError((json as { error?: string }).error ?? 'Save failed.')
          return
        }
        setSlotsByWeek(slotsForPublish)
        setSuccess(`Saved to library: ${json.program?.name ?? 'Program'}.`)
      } else if (athleteEditMode) {
        const res = await fetch(`/api/coach/programs/${encodeURIComponent(programIdParam)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            athleteId,
            programName: programName.trim() || undefined,
            weeks,
            daysPerWeek,
            splitPattern,
            customTrainingDays: splitPattern === 'custom' ? customIndicesSorted : undefined,
            exercises: flat,
          }),
        })
        const json = (await res.json().catch(() => ({ ok: false, error: 'Save failed.' }))) as
          | { ok: true; program?: { name: string } }
          | { ok: false; error: string }
        if (!res.ok || !json.ok) {
          setError((json as { error?: string }).error ?? 'Save failed.')
          return
        }
        setSlotsByWeek(slotsForPublish)
        setSuccess(`Saved: ${json.program?.name ?? 'Program'}.`)
      } else {
        const res = await fetch('/api/coach/publish-program', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(athleteId ? { athleteId } : {}),
            programName: programName.trim() || undefined,
            weeks,
            daysPerWeek,
            splitPattern,
            customTrainingDays: splitPattern === 'custom' ? customIndicesSorted : undefined,
            exercises: flat,
          }),
        })
        const json = (await res.json().catch(() => ({ ok: false, error: 'Publish failed.' }))) as
          | { ok: true; program?: { name: string } }
          | { ok: false; error: string }
        if (!res.ok || !json.ok) {
          setError((json as { error?: string }).error ?? 'Publish failed.')
          return
        }
        setSlotsByWeek(slotsForPublish)
        setSuccess(
          athleteId
            ? `Published: ${json.program?.name ?? 'Program'}. The athlete will see it on My program.`
            : `Saved to My program library: ${json.program?.name ?? 'Program'}. You can assign it from the library page.`,
        )
      }
    } catch {
      setError('Network error.')
    } finally {
      setPublishPending(false)
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  async function removeProgramFromAthlete() {
    if (!athleteEditMode || !athleteIdParam || !programIdParam) return
    if (
      !window.confirm(
        'Remove this program from the athlete? They will have no active program until you assign a new one.',
      )
    ) {
      return
    }
    setError(null)
    setSuccess(null)
    setRemovePending(true)
    try {
      const res = await fetch('/api/coach/athlete-program', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ athleteId: athleteIdParam, programId: programIdParam }),
      })
      const json = (await res.json().catch(() => ({ ok: false, error: 'Request failed.' }))) as
        | { ok: true }
        | { ok: false; error: string }
      if (!res.ok || !json.ok) {
        setError('error' in json ? json.error : 'Could not remove program.')
        return
      }
      window.location.href = '/coach'
    } catch {
      setError('Network error.')
    } finally {
      setRemovePending(false)
    }
  }

  if (isEditMode && !hydrated && !loadError) {
    return (
      <div className={styles.page}>
        <main className={styles.mainInner}>
          <p className={styles.muted}>Loading program…</p>
        </main>
      </div>
    )
  }

  if (isEditMode && loadError) {
    return (
      <div className={styles.page}>
        <main className={styles.mainInner}>
          <p className={styles.error}>{loadError}</p>
          <a className={styles.secondary} href="/coach" style={{ marginTop: '1rem', display: 'inline-block' }}>
            Back to dashboard
          </a>
        </main>
      </div>
    )
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
              <div className="text-sm font-semibold tracking-tight text-slate-100">
                {libraryEditMode ? 'Library program' : isEditMode ? 'Edit program' : 'Program builder'}
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
        <nav className={styles.nav}>
          <a className={styles.navItem} href="/coach" onClick={() => setMenuOpen(false)}>
            Dashboard <span className={styles.pill}>Home</span>
          </a>
          <a className={styles.navItem} href="/coach/exercises" onClick={() => setMenuOpen(false)}>
            Exercise search <span className={styles.pill}>API</span>
          </a>
          <a
            className={`${styles.navItem} ${navProgramActive ? styles.navItemActive : ''}`}
            href="/coach/program"
            onClick={() => setMenuOpen(false)}
          >
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
      </aside>

      <main className={styles.mainInner}>
        <h1 className={styles.title}>
          {libraryEditMode ? 'Edit library program' : isEditMode ? 'Edit weekly program' : 'Build a weekly program'}
        </h1>
        <p className={styles.muted}>
          {libraryEditMode
            ? 'Changes stay in your library until you assign this program to an athlete.'
            : isEditMode
              ? 'Update weeks, days, layout, and exercises, then save. Athletes see the same week tabs on My program.'
              : 'Set length of the program in weeks, then use the week tabs to plan each week. Leave athlete empty to save to My program library, or pick an athlete to publish directly.'}
        </p>
        {viewOnly ? (
          <div className={styles.error} style={{ marginTop: '0.75rem' }}>
            This program is read-only (e.g. athlete is on an AI-generated plan). Publish a new coach program to replace
            it.
          </div>
        ) : null}

        <section className={styles.panel}>
          <div className={styles.label}>Athlete (optional)</div>
          <p className={styles.muted} style={{ marginTop: '0.25rem', marginBottom: '0.5rem' }}>
            Empty = save to My program library. Pick an athlete to publish straight to them.
          </p>
          <select
            className={styles.select}
            value={athleteId}
            onChange={(e) => setAthleteId(e.target.value)}
            disabled={publishPending || formLocked || athleteEditMode || libraryEditMode}
          >
            {!athleteEditMode && !libraryEditMode ? <option value="">— Library only —</option> : null}
            {athletes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.fullName ? `${a.fullName} — ${a.email}` : a.email}
              </option>
            ))}
          </select>

          <div className={`${styles.formGrid} mt-4`}>
            <div>
              <div className={styles.label}>Program title (optional)</div>
              <input
                className={styles.input}
                value={programName}
                onChange={(e) => setProgramName(e.target.value)}
                placeholder="e.g. Off-season strength"
                disabled={publishPending || formLocked}
              />
            </div>
            <div>
              <div className={styles.label}>Weeks</div>
              <select
                className={styles.select}
                value={weeks}
                onChange={(e) => setWeeks(Number(e.target.value))}
                disabled={publishPending || formLocked}
              >
                {[2, 4, 6, 8, 10, 12, 16].map((w) => (
                  <option key={w} value={w}>
                    {w} weeks
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className={styles.label}>Training days per week</div>
              <select
                className={styles.select}
                value={daysPerWeek}
                onChange={(e) => setDaysPerWeek(Number(e.target.value))}
                disabled={publishPending || formLocked}
              >
                {[2, 3, 4, 5, 6].map((d) => (
                  <option key={d} value={d}>
                    {d} days
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className={styles.label}>Calendar layout</div>
              <select
                className={styles.select}
                value={splitPattern}
                onChange={(e) => setSplitPattern(e.target.value as typeof splitPattern)}
                disabled={publishPending || formLocked}
              >
                <option value="spread">Spread (e.g. Mon / Wed / Fri)</option>
                <option value="consecutive">Consecutive from Monday</option>
                <option value="two_on_one_off">2 on / 1 off style</option>
                <option value="custom">Custom weekdays</option>
              </select>
            </div>
          </div>

          {splitPattern === 'custom' ? (
            <div className="mt-4">
              <div className={styles.label}>
                Select {daysPerWeek} weekdays ({customIndicesSorted.length}/{daysPerWeek})
              </div>
              <div className={styles.customDays}>
                {WEEKDAY_LABELS.map((label, i) => (
                  <button
                    key={label}
                    type="button"
                    className={`${styles.dayToggle} ${customPick[i] ? styles.dayToggleOn : ''}`}
                    onClick={() => toggleCustomDay(i)}
                    disabled={publishPending || formLocked}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-6">
            <div className={styles.label}>Training plan by week</div>
            <p className={styles.muted} style={{ marginTop: '0.35rem' }}>
              Build week 1 first. When you publish or save, empty days in later weeks are filled automatically from the
              same training day in week 1. If progressive overload is on for an exercise in week 1, reps and % are
              stepped for each later week; otherwise later weeks match week 1. Days you already filled in later weeks
              are not overwritten. Each exercise starts with one set; use “+ Add set” for more (up to 20 sets).
            </p>
            <div className={styles.tabs} role="tablist" aria-label="Program weeks">
              {Array.from({ length: Math.max(1, weeks) }, (_, i) => i + 1).map((w) => (
                <button
                  key={w}
                  type="button"
                  role="tab"
                  aria-selected={activeProgramWeek === w}
                  className={`${styles.tab} ${activeProgramWeek === w ? styles.tabActive : ''}`}
                  onClick={() => setActiveProgramWeek(w)}
                  disabled={publishPending || formLocked}
                >
                  Week {w}
                </button>
              ))}
            </div>
            <div className={styles.dayGrid}>
              {Array.from({ length: daysPerWeek }, (_, d) => (
                <div
                  key={d}
                  className={`${styles.dayCard} ${activeSlot === d ? styles.dayCardActive : ''}`}
                >
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => setActiveSlot(d)}
                    disabled={publishPending || formLocked}
                  >
                    <div className={styles.dayTitle}>
                      Day {d + 1}
                      {calendarLabels[d] ? (
                        <span className="text-slate-400"> · {calendarLabels[d]}</span>
                      ) : null}
                    </div>
                    <div className={styles.daySub}>
                      {coachWeekSlots[d]?.length ?? 0} exercise
                      {(coachWeekSlots[d]?.length ?? 0) === 1 ? '' : 's'}
                    </div>
                  </button>
                  <div className={styles.slotList}>
                    {(coachWeekSlots[d] ?? []).map((row) => {
                      const rowDisabled = publishPending || formLocked
                      return (
                      <div key={row.clientId} className={styles.slotRow}>
                        <div className={styles.slotRowTitle}>{row.name}</div>
                        <div className="mt-2 space-y-2">
                          {row.setLines.map((line, si) => (
                            <div
                              key={si}
                              className="flex flex-wrap items-end gap-2 rounded-lg border border-white/10 bg-black/25 p-2"
                            >
                              <div className="min-w-[3.5rem] text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                Set {si + 1}
                              </div>
                              <div className="min-w-[4.5rem] flex-1">
                                <div className={styles.label}>Reps</div>
                                <input
                                  className={styles.tinyInput}
                                  type="number"
                                  min={1}
                                  max={50}
                                  value={line.reps}
                                  onChange={(e) =>
                                    patchExercise(coachWeekIndex, d, row.clientId, (p) => ({
                                      ...p,
                                      setLines: p.setLines.map((ln, i) =>
                                        i === si
                                          ? {
                                              ...ln,
                                              reps: Math.max(1, Math.min(50, Number(e.target.value) || 1)),
                                            }
                                          : ln,
                                      ),
                                    }))
                                  }
                                  disabled={rowDisabled}
                                />
                              </div>
                              <div className="min-w-[4.5rem] flex-1">
                                <div className={styles.label}>% 1RM</div>
                                <input
                                  className={styles.tinyInput}
                                  type="number"
                                  min={1}
                                  max={100}
                                  value={line.percent1RM === '' ? '' : line.percent1RM}
                                  placeholder="—"
                                  onChange={(e) => {
                                    const raw = e.target.value
                                    patchExercise(coachWeekIndex, d, row.clientId, (p) => ({
                                      ...p,
                                      setLines: p.setLines.map((ln, i) => {
                                        if (i !== si) return ln
                                        if (raw === '') return { ...ln, percent1RM: '' }
                                        const n = Number(raw)
                                        if (!Number.isFinite(n)) return ln
                                        return {
                                          ...ln,
                                          percent1RM: Math.max(1, Math.min(100, Math.floor(n))),
                                        }
                                      }),
                                    }))
                                  }}
                                  disabled={rowDisabled}
                                />
                              </div>
                              {row.setLines.length > 1 ? (
                                <button
                                  type="button"
                                  className={`${styles.removeBtn} !mt-0 self-center`}
                                  onClick={() =>
                                    patchExercise(coachWeekIndex, d, row.clientId, (p) => ({
                                      ...p,
                                      setLines: p.setLines.filter((_, i) => i !== si),
                                    }))
                                  }
                                  disabled={publishPending || formLocked}
                                >
                                  Remove set
                                </button>
                              ) : null}
                            </div>
                          ))}
                        </div>
                        {row.setLines.length < SET_TARGETS_MAX ? (
                          <button
                            type="button"
                            className="mt-2 inline-flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/20"
                            disabled={publishPending || formLocked}
                            onClick={() =>
                              patchExercise(coachWeekIndex, d, row.clientId, (p) => {
                                if (p.setLines.length >= SET_TARGETS_MAX) return p
                                const last = p.setLines[p.setLines.length - 1]
                                return {
                                  ...p,
                                  setLines: [
                                    ...p.setLines,
                                    { reps: last?.reps ?? 10, percent1RM: last?.percent1RM ?? '' },
                                  ],
                                }
                              })
                            }
                          >
                            + Add set
                          </button>
                        ) : null}
                        <label className="mt-2 flex cursor-pointer items-center gap-2 text-[12px] text-slate-300">
                          <input
                            type="checkbox"
                            checked={row.progressiveOverload}
                            onChange={(e) =>
                              patchExercise(coachWeekIndex, d, row.clientId, (p) => ({
                                ...p,
                                progressiveOverload: e.target.checked,
                              }))
                            }
                            disabled={publishPending || formLocked}
                          />
                          Progressive overload (+5% 1RM, −2 reps each later week without a same-day copy)
                        </label>
                        <button
                          type="button"
                          className={styles.removeBtn}
                          onClick={() => removeExercise(coachWeekIndex, d, row.clientId)}
                          disabled={publishPending || formLocked}
                        >
                          Remove
                        </button>
                      </div>
                      )
                    })}
                  </div>
                  {athleteEditMode || libraryEditMode ? (
                    <button
                      type="button"
                      className="mt-3 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-left text-xs font-medium text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={(e) => {
                        e.stopPropagation()
                        copyDayToFollowingWeeks(d)
                      }}
                      disabled={
                        publishPending ||
                        formLocked ||
                        coachWeekIndex >= slotsByWeek.length - 1 ||
                        (coachWeekSlots[d]?.length ?? 0) === 0
                      }
                      title={
                        coachWeekIndex >= slotsByWeek.length - 1
                          ? 'Switch to an earlier week to copy into later weeks'
                          : 'Replace this training day in all following weeks with a copy of the exercises listed above'
                      }
                    >
                      Copy this day to later weeks
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className={styles.actions}>
            <button
              className={styles.primary}
              type="button"
              onClick={publish}
              disabled={publishPending || formLocked}
            >
              {publishPending
                ? isEditMode
                  ? 'Saving…'
                  : athleteId
                    ? 'Publishing…'
                    : 'Saving…'
                : libraryEditMode
                  ? 'Save to library'
                  : athleteEditMode
                    ? 'Save changes'
                    : athleteId
                      ? 'Publish program to athlete'
                      : 'Save to My program library'}
            </button>
            {isEditMode ? (
              <a className={styles.secondary} href="/coach/program">
                New program
              </a>
            ) : null}
            {isEditMode ? (
              <a className={styles.secondary} href="/coach/program-library">
                Program library
              </a>
            ) : null}
            {isEditMode ? (
              <a className={styles.secondary} href="/coach/exercise-library">
                Exercise library
              </a>
            ) : null}
          </div>
          {athleteEditMode && !viewOnly ? (
            <div className="mt-6 rounded-xl border border-red-500/25 bg-red-500/5 p-4">
              <div className={styles.label} style={{ color: 'rgb(252 165 165)' }}>
                Remove assignment
              </div>
              <p className={styles.muted} style={{ marginTop: '0.35rem' }}>
                The athlete will see no program until you publish another one. The program is deleted if no other
                athlete uses it.
              </p>
              <div className={styles.actions} style={{ marginTop: '0.75rem' }}>
                <button
                  type="button"
                  className={styles.danger}
                  disabled={removePending || publishPending}
                  onClick={() => void removeProgramFromAthlete()}
                >
                  {removePending ? 'Removing…' : 'Remove program from athlete'}
                </button>
              </div>
            </div>
          ) : null}
          {error ? <div className={styles.error}>{error}</div> : null}
          {success ? <div className={styles.success}>{success}</div> : null}
        </section>

        <section className={styles.panel}>
          <h2 className="text-lg font-semibold text-slate-100">Create library exercise</h2>
          <p className={styles.muted}>
            Saves to the shared database so any coach can find it when searching. Athletes see your description and an
            embedded video from the YouTube link.
          </p>
          <div className={styles.formGrid}>
            <div>
              <div className={styles.label}>Name</div>
              <input
                className={styles.input}
                value={ceName}
                onChange={(e) => setCeName(e.target.value)}
                placeholder="e.g. Landmine press — athlete variation"
                disabled={cePending}
              />
            </div>
            <div>
              <div className={styles.label}>YouTube URL or video id</div>
              <input
                className={styles.input}
                value={ceYoutube}
                onChange={(e) => setCeYoutube(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=…"
                disabled={cePending}
              />
            </div>
          </div>
          <div className="mt-3">
            <div className={styles.label}>Description (coaching cues, setup, reps guidance)</div>
            <textarea
              className={styles.input}
              style={{ minHeight: '100px', resize: 'vertical' }}
              value={ceDesc}
              onChange={(e) => setCeDesc(e.target.value)}
              disabled={cePending}
            />
          </div>
          <div className={styles.actions}>
            <button
              className={styles.primary}
              type="button"
              onClick={createLibraryExercise}
              disabled={cePending || !ceName.trim() || !ceDesc.trim() || !ceYoutube.trim()}
            >
              {cePending ? 'Saving…' : 'Save to library'}
            </button>
          </div>
        </section>

        <section className={styles.panel}>
          <h2 className="text-lg font-semibold text-slate-100">Search exercises</h2>
          <p className={styles.muted}>
            Library matches appear first; API Ninjas fills the rest. Adds to week {activeProgramWeek}, day{' '}
            {activeSlot + 1}.
            {athleteEditMode || libraryEditMode
              ? ' You can use “Copy this day to later weeks” on a day card to duplicate that day forward.'
              : ''}
          </p>
          <div className={styles.formGrid}>
            <div>
              <div className={styles.label}>Name</div>
              <input
                className={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={formLocked}
              />
            </div>
            <div>
              <div className={styles.label}>Muscle</div>
              <input
                className={styles.input}
                value={muscle}
                onChange={(e) => setMuscle(e.target.value)}
                disabled={formLocked}
              />
            </div>
            <div>
              <div className={styles.label}>Type</div>
              <input
                className={styles.input}
                value={type}
                onChange={(e) => setType(e.target.value)}
                disabled={formLocked}
              />
            </div>
            <div>
              <div className={styles.label}>Difficulty</div>
              <input
                className={styles.input}
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                disabled={formLocked}
              />
            </div>
            <div>
              <div className={styles.label}>Equipment</div>
              <input
                className={styles.input}
                value={equipment}
                onChange={(e) => setEquipment(e.target.value)}
                disabled={formLocked}
              />
            </div>
          </div>
          <div className={styles.actions}>
            <button
              className={styles.primary}
              type="button"
              onClick={runSearch}
              disabled={pending || !canSearch || formLocked}
            >
              {pending ? 'Searching…' : 'Search'}
            </button>
          </div>
          <div className={styles.results}>
            {results.map((r, idx) => (
              <div key={`${r.name}-${idx}`} className={styles.card}>
                <div className={styles.cardTitle}>{r.name}</div>
                <div className={styles.cardMeta}>{buildMeta(r) || '—'}</div>
                {r.instructions ? <div className={styles.instructions}>{r.instructions}</div> : null}
                <div className={styles.actions} style={{ marginTop: '0.75rem' }}>
                  <button
                    className={styles.secondary}
                    type="button"
                    onClick={() => addExercise(r)}
                    disabled={publishPending || formLocked}
                  >
                    Add to W{activeProgramWeek} · day {activeSlot + 1}
                  </button>
                  <button
                    className={styles.secondary}
                    type="button"
                    onClick={() => void saveExerciseToLibrary(r)}
                    disabled={
                      publishPending || formLocked || saveLibKey === `${r.name}-${r.source ?? 'x'}`
                    }
                  >
                    {saveLibKey === `${r.name}-${r.source ?? 'x'}` ? 'Saving…' : 'Save to exercise library'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
