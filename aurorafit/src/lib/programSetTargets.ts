/** Per-set prescription (reps and optional %1RM). */
export type SetTargetLine = {
  reps: number
  percent1RM: number | null
}

export const SET_TARGETS_MAX = 20
export const PROGRESSIVE_PERCENT_STEP = 5
export const PROGRESSIVE_REPS_STEP = 2

export function normalizeSetTargetLines(
  sets: number | null | undefined,
  reps: number | null | undefined,
  percent1RM: number | null | undefined,
): SetTargetLine[] {
  const n = Math.max(1, Math.min(SET_TARGETS_MAX, sets != null && sets > 0 ? sets : 3))
  const r = reps ?? 10
  const p = percent1RM
  return Array.from({ length: n }, () => ({
    reps: Math.max(1, Math.min(50, r)),
    percent1RM: p != null ? Math.max(1, Math.min(100, p)) : null,
  }))
}

/** Parse DB JSON or return null to use legacy columns. */
export function parseSetTargetsJson(raw: unknown): SetTargetLine[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const out: SetTargetLine[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') return null
    const o = row as Record<string, unknown>
    const repsRaw = o.reps
    const pctRaw = o.percent1RM
    const reps = typeof repsRaw === 'number' ? repsRaw : Number(repsRaw)
    if (!Number.isFinite(reps)) return null
    const r = Math.max(1, Math.min(50, Math.floor(reps)))
    let p: number | null = null
    if (pctRaw !== null && pctRaw !== undefined && pctRaw !== '') {
      const n = typeof pctRaw === 'number' ? pctRaw : Number(pctRaw)
      if (!Number.isFinite(n)) return null
      p = Math.max(1, Math.min(100, Math.floor(n)))
    }
    out.push({ reps: r, percent1RM: p })
  }
  return out.length > 0 ? out : null
}

export function resolveSetTargetLines(args: {
  setTargets: unknown
  sets: number | null | undefined
  reps: number | null | undefined
  percent1RM: number | null | undefined
}): SetTargetLine[] {
  const parsed = parseSetTargetsJson(args.setTargets)
  if (parsed && parsed.length > 0) return parsed
  return normalizeSetTargetLines(args.sets, args.reps, args.percent1RM)
}

export function mapSetTargetsProgressive(
  lines: SetTargetLine[],
  anchorWeek: number,
  targetWeek: number,
): SetTargetLine[] {
  const a = Math.floor(Number(anchorWeek))
  const t = Math.floor(Number(targetWeek))
  const steps = Number.isFinite(a) && Number.isFinite(t) ? t - a : 0
  if (steps <= 0) return lines.map((l) => ({ ...l }))
  return lines.map((s) => ({
    reps: Math.max(1, s.reps - PROGRESSIVE_REPS_STEP * steps),
    percent1RM:
      s.percent1RM != null
        ? Math.min(100, s.percent1RM + PROGRESSIVE_PERCENT_STEP * steps)
        : null,
  }))
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(n)))
}

/**
 * Coach API body: either `setTargets: [{ reps, percent1RM? }, ...]` or legacy `sets` + `reps` + `percent1RM`.
 */
export function normalizeIncomingExercisePrescription(row: {
  sets?: unknown
  reps?: unknown
  percent1RM?: unknown
  setTargets?: unknown
}): { ok: true; lines: SetTargetLine[] } | { ok: false; error: string } {
  if (Array.isArray(row.setTargets) && row.setTargets.length > 0) {
    const lines: SetTargetLine[] = []
    for (const item of row.setTargets) {
      if (!item || typeof item !== 'object') {
        return { ok: false, error: 'Invalid setTargets entry.' }
      }
      const o = item as Record<string, unknown>
      const repsRaw = o.reps
      const pctRaw = o.percent1RM
      const repsN = typeof repsRaw === 'number' ? repsRaw : Number(repsRaw)
      if (!Number.isFinite(repsN)) {
        return { ok: false, error: 'Each set needs a valid reps value.' }
      }
      const reps = clampInt(repsN, 1, 50)
      let percent1RM: number | null = null
      if (pctRaw !== null && pctRaw !== undefined && pctRaw !== '') {
        const pN = typeof pctRaw === 'number' ? pctRaw : Number(pctRaw)
        if (!Number.isFinite(pN)) {
          return { ok: false, error: 'Invalid percent1RM in setTargets.' }
        }
        percent1RM = clampInt(pN, 1, 100)
      }
      lines.push({ reps, percent1RM })
    }
    if (lines.length > SET_TARGETS_MAX) {
      return { ok: false, error: `At most ${SET_TARGETS_MAX} sets per exercise.` }
    }
    return { ok: true, lines }
  }

  const setsRaw = row.sets
  const repsRaw = row.reps
  const pctRaw = row.percent1RM
  const sets = Number.isFinite(setsRaw as number) ? clampInt(setsRaw as number, 1, SET_TARGETS_MAX) : 3
  const reps = Number.isFinite(repsRaw as number) ? clampInt(repsRaw as number, 1, 50) : 10
  const percent1RM =
    typeof pctRaw === 'number' && Number.isFinite(pctRaw) ? clampInt(pctRaw, 1, 100) : null
  const lines: SetTargetLine[] = Array.from({ length: sets }, () => ({ reps, percent1RM }))
  return { ok: true, lines }
}

export function formatSetMetaSummary(lines: SetTargetLine[]): string {
  if (lines.length === 0) return '—'
  if (lines.length === 1) {
    const a = lines[0]
    const base = `1×${a.reps}`
    return a.percent1RM != null ? `${base} @ ${a.percent1RM}%` : base
  }
  return lines
    .map((a, i) => {
      const bit = `${a.reps}${a.percent1RM != null ? `@${a.percent1RM}%` : ''}`
      return `S${i + 1}:${bit}`
    })
    .join(' ')
}
