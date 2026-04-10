import {
  mapSetTargetsProgressive,
  resolveSetTargetLines,
  type SetTargetLine,
} from '@/lib/programSetTargets'

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

export function dayIndicesForSplit(daysPerWeek: number, splitPattern: string): number[] {
  const d = Math.max(2, Math.min(daysPerWeek, 6))
  if (splitPattern === 'consecutive') return Array.from({ length: d }, (_, i) => i)
  if (splitPattern === 'two_on_one_off') {
    const base = [0, 1, 3, 4, 5]
    return base.slice(0, d)
  }
  if (d === 2) return [1, 4]
  if (d === 3) return [0, 2, 4]
  if (d === 4) return [0, 1, 3, 5]
  if (d === 5) return [0, 1, 2, 4, 5]
  return [0, 1, 2, 3, 4, 5]
}

export function resolveTrainingDayIndices(
  daysPerWeek: number,
  splitPattern: string,
  customTrainingDays: number[] | null | undefined,
): number[] {
  if (splitPattern === 'custom' && customTrainingDays && customTrainingDays.length > 0) {
    return [...customTrainingDays].sort((a, b) => a - b)
  }
  return dayIndicesForSplit(daysPerWeek, splitPattern)
}

export function validateCustomTrainingDays(
  days: number[] | undefined,
  daysPerWeek: number,
): { ok: true; sorted: number[] } | { ok: false; error: string } {
  if (!days || !Array.isArray(days)) {
    return { ok: false, error: 'customTrainingDays array is required for custom split.' }
  }
  if (days.length !== daysPerWeek) {
    return { ok: false, error: `Select exactly ${daysPerWeek} training days (weekdays).` }
  }
  const sorted = [...days].sort((a, b) => a - b)
  for (let i = 0; i < sorted.length; i++) {
    const v = sorted[i]
    if (!Number.isInteger(v) || v < 0 || v > 6) {
      return { ok: false, error: 'Training days must be indices 0–6 (Mon–Sun).' }
    }
    if (i > 0 && sorted[i] === sorted[i - 1]) {
      return { ok: false, error: 'Training days must be unique.' }
    }
  }
  return { ok: true, sorted }
}

export type WeekPlanExercise = {
  id: string
  sortOrder: number
  weekNumber: number | null
  sets: number | null
  reps: number | null
  percent1RM: number | null
  setTargets?: SetTargetLine[] | null
  notes: string | null
  templateDayIndex: number | null
  progressiveOverload?: boolean
  /** Set when this line is computed from progressive overload (not stored on its own row). */
  progressiveDerived?: boolean
  exercise: { id: string; name: string; description: string | null; youtubeVideoId?: string | null }
}

export const PROGRESSIVE_OVERLOAD_PERCENT_STEP = 5
export const PROGRESSIVE_OVERLOAD_REPS_STEP = 2

export function progressiveOverloadVirtualLineId(anchorLineId: string, calendarWeek: number): string {
  return `${anchorLineId}:po:${calendarWeek}`
}

export function computeProgressiveOverloadValues(
  anchorWeek: number,
  targetWeek: number,
  reps: number | null,
  percent1RM: number | null,
): { reps: number | null; percent1RM: number | null } {
  const steps = targetWeek - anchorWeek
  if (steps <= 0) return { reps, percent1RM }
  const baseReps = reps ?? 10
  const newReps = Math.max(1, baseReps - PROGRESSIVE_OVERLOAD_REPS_STEP * steps)
  const newPct =
    percent1RM != null
      ? Math.min(100, percent1RM + PROGRESSIVE_OVERLOAD_PERCENT_STEP * steps)
      : null
  return { reps: newReps, percent1RM: newPct }
}

function exerciseDaySlotKey(exerciseId: string, templateDayIndex: number): string {
  return `${exerciseId}:${templateDayIndex}`
}

/** Coerce API/DB week numbers so JSON numbers and numeric strings both work. */
function coerceWeekNumber(w: unknown): number | null {
  if (w == null) return null
  const n = typeof w === 'number' ? w : Number(w)
  if (!Number.isFinite(n)) return null
  return Math.floor(n)
}

function coerceTemplateDayIndex(w: unknown): number | null {
  return coerceWeekNumber(w)
}

function normalizeWeekPlanExercises(exercises: WeekPlanExercise[]): WeekPlanExercise[] {
  return exercises.map((e) => ({
    ...e,
    weekNumber: coerceWeekNumber(e.weekNumber),
    templateDayIndex: coerceTemplateDayIndex(e.templateDayIndex),
  }))
}

export function mergeProgressiveOverloadVirtuals(
  allExercises: WeekPlanExercise[],
  explicitPool: WeekPlanExercise[],
  calendarWeek: number,
): WeekPlanExercise[] {
  const multiWeek = allExercises.some((e) => e.weekNumber != null && e.weekNumber >= 1)
  if (!multiWeek) return explicitPool

  const explicitKeys = new Set<string>()
  for (const ex of explicitPool) {
    if (ex.templateDayIndex != null) {
      explicitKeys.add(exerciseDaySlotKey(ex.exercise.id, ex.templateDayIndex))
    }
  }

  const bestByKey = new Map<string, WeekPlanExercise>()
  for (const anchor of allExercises) {
    if (!anchor.progressiveOverload) continue
    if (anchor.templateDayIndex == null) continue
    // Missing week = legacy “template” row; treat as week 1 so PO can project forward.
    const aw = anchor.weekNumber ?? 1
    if (aw >= calendarWeek) continue
    const key = exerciseDaySlotKey(anchor.exercise.id, anchor.templateDayIndex)
    const prev = bestByKey.get(key)
    const prevAw = prev?.weekNumber ?? 1
    if (!prev || aw > prevAw) bestByKey.set(key, anchor)
  }

  const virtuals: WeekPlanExercise[] = []
  for (const anchor of bestByKey.values()) {
    const aw = anchor.weekNumber ?? 1
    const key = exerciseDaySlotKey(anchor.exercise.id, anchor.templateDayIndex!)
    if (explicitKeys.has(key)) continue
    const baseLines = resolveSetTargetLines({
      setTargets: anchor.setTargets,
      sets: anchor.sets,
      reps: anchor.reps,
      percent1RM: anchor.percent1RM,
    })
    const newLines = mapSetTargetsProgressive(baseLines, aw, calendarWeek)
    const first = newLines[0]
    virtuals.push({
      ...anchor,
      id: progressiveOverloadVirtualLineId(anchor.id, calendarWeek),
      weekNumber: calendarWeek,
      sets: newLines.length,
      reps: first?.reps ?? anchor.reps,
      percent1RM: first?.percent1RM ?? anchor.percent1RM,
      setTargets: newLines,
      progressiveOverload: false,
      progressiveDerived: true,
    })
  }

  return [...explicitPool, ...virtuals].sort((a, b) => a.sortOrder - b.sortOrder)
}

/** Coach builder row: merge derived progressive rows into the week being viewed. */
export type CoachPlannedExercise = {
  clientId: string
  name: string
  description: string
  setLines: Array<{ reps: number; percent1RM: number | '' }>
  notes: string
  progressiveOverload: boolean
  exerciseId?: string
  progressiveDerived?: boolean
}

function coachSlotIdentity(row: CoachPlannedExercise, dayIndex: number): string {
  const idPart = row.exerciseId?.trim() || row.name.trim().toLowerCase()
  return `${idPart}:${dayIndex}`
}

export function mergeCoachWeekSlotsWithProgressive(
  slotsByWeek: CoachPlannedExercise[][][],
  viewWeek1Based: number,
  programWeeks: number,
  daysPerWeek: number,
): CoachPlannedExercise[][] {
  const wi = viewWeek1Based - 1
  const out: CoachPlannedExercise[][] = []
  for (let d = 0; d < daysPerWeek; d++) {
    out[d] = wi >= 0 && wi < slotsByWeek.length ? [...(slotsByWeek[wi]?.[d] ?? [])] : []
  }

  const occupied = new Set<string>()
  for (let d = 0; d < daysPerWeek; d++) {
    for (const row of out[d]) {
      occupied.add(coachSlotIdentity(row, d))
    }
  }

  type Best = { row: CoachPlannedExercise; anchorWeek: number; anchorDay: number }
  const bestByKey = new Map<string, Best>()
  const wMax = Math.min(programWeeks, slotsByWeek.length)
  for (let w = 0; w < wMax; w++) {
    const weekNum = w + 1
    if (weekNum >= viewWeek1Based) break
    for (let d = 0; d < daysPerWeek; d++) {
      for (const row of slotsByWeek[w]?.[d] ?? []) {
        if (!row.progressiveOverload || row.progressiveDerived) continue
        const key = coachSlotIdentity(row, d)
        const prev = bestByKey.get(key)
        if (!prev || weekNum > prev.anchorWeek) {
          bestByKey.set(key, { row, anchorWeek: weekNum, anchorDay: d })
        }
      }
    }
  }

  for (const { row, anchorWeek, anchorDay } of bestByKey.values()) {
    const key = coachSlotIdentity(row, anchorDay)
    if (occupied.has(key)) continue
    const lines = row.setLines.map((s) => ({
      reps: s.reps,
      percent1RM: s.percent1RM === '' ? null : s.percent1RM,
    }))
    const adjLines = mapSetTargetsProgressive(lines, anchorWeek, viewWeek1Based)
    out[anchorDay].push({
      ...row,
      clientId: progressiveOverloadVirtualLineId(row.clientId, viewWeek1Based),
      setLines: adjLines.map((l) => ({
        reps: l.reps,
        percent1RM: l.percent1RM ?? '',
      })),
      progressiveOverload: false,
      progressiveDerived: true,
    })
  }

  return out
}

function hashStringToUint32(input: string) {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number) {
  return function rand() {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Places exercises into Mon–Sun buckets. If every exercise has `templateDayIndex`, uses coach/structured layout;
 * otherwise uses the legacy rotating pool (AI programs and old coach adds).
 */
export function buildWeekPlan(args: {
  exercises: WeekPlanExercise[]
  daysPerWeek: number
  splitPattern: string
  customTrainingDays: number[] | null
  weekIndex: number
  seedKey: string
}): WeekPlanExercise[][] {
  const { daysPerWeek, splitPattern, weekIndex, seedKey, customTrainingDays } = args
  const exercises = normalizeWeekPlanExercises(args.exercises)
  const buckets: WeekPlanExercise[][] = Array.from({ length: 7 }, () => [])
  const trainingDays = resolveTrainingDayIndices(daysPerWeek, splitPattern, customTrainingDays)
  if (exercises.length === 0) return buckets

  const calendarWeek = weekIndex + 1
  const multiWeek = exercises.some((e) => e.weekNumber != null && e.weekNumber >= 1)
  let pool = multiWeek
    ? exercises.filter((e) => e.weekNumber === calendarWeek)
    : exercises
  if (multiWeek) {
    pool = mergeProgressiveOverloadVirtuals(exercises, pool, calendarWeek)
  }
  if (multiWeek && pool.length === 0) return buckets

  const explicit =
    pool.length > 0 &&
    pool.every((e) => e.templateDayIndex !== null && e.templateDayIndex !== undefined)

  if (explicit) {
    const ordered = [...pool].sort((a, b) => a.sortOrder - b.sortOrder)
    for (const ex of ordered) {
      const t = ex.templateDayIndex!
      if (t < 0 || t >= trainingDays.length) continue
      const calDay = trainingDays[t]
      buckets[calDay].push(ex)
    }
    return buckets
  }

  const seed = hashStringToUint32(
    `${seedKey}:${weekIndex}:${daysPerWeek}:${splitPattern}:${(customTrainingDays ?? []).join(',')}`,
  )
  const rand = mulberry32(seed)
  let cursor = pool.length ? (weekIndex * 3) % pool.length : 0

  for (const day of trainingDays) {
    const target = 3 + Math.floor(rand() * 4)
    for (let i = 0; i < target; i++) {
      buckets[day].push(pool[cursor])
      cursor = (cursor + 1) % pool.length
    }
  }

  return buckets
}
