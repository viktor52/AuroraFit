import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { normalizeIncomingExercisePrescription } from '@/lib/programSetTargets'
import { validateCustomTrainingDays } from '@/lib/programWeekPlan'

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(n)))
}

const SPLIT_PATTERNS = new Set(['spread', 'consecutive', 'two_on_one_off', 'custom'])

type InExercise = {
  name?: unknown
  description?: unknown
  weekNumber?: unknown
  templateDayIndex?: unknown
  sets?: unknown
  reps?: unknown
  percent1RM?: unknown
  setTargets?: unknown
  notes?: unknown
  progressiveOverload?: unknown
}

export async function POST(req: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 })
  if (session.user.role !== 'COACH') return NextResponse.json({ ok: false, error: 'Forbidden.' }, { status: 403 })

  const body = (await req.json().catch(() => null)) as
    | {
        athleteId?: unknown
        programName?: unknown
        weeks?: unknown
        daysPerWeek?: unknown
        splitPattern?: unknown
        customTrainingDays?: unknown
        exercises?: unknown
      }
    | null

  const athleteId = typeof body?.athleteId === 'string' ? body.athleteId.trim() : ''
  const programNameRaw = typeof body?.programName === 'string' ? body.programName.trim() : ''
  const weeksRaw = typeof body?.weeks === 'number' ? body.weeks : Number.NaN
  const daysRaw = typeof body?.daysPerWeek === 'number' ? body.daysPerWeek : Number.NaN
  const splitPattern = typeof body?.splitPattern === 'string' ? body.splitPattern : ''
  const customRaw = body?.customTrainingDays

  if (!SPLIT_PATTERNS.has(splitPattern)) {
    return NextResponse.json({ ok: false, error: 'Invalid split pattern.' }, { status: 400 })
  }

  const daysPerWeek = Number.isFinite(daysRaw) ? clampInt(daysRaw, 2, 6) : 3
  const weeks = Number.isFinite(weeksRaw) ? clampInt(weeksRaw, 1, 16) : 4

  let customTrainingDaysJson: string | null = null
  if (splitPattern === 'custom') {
    const arr = Array.isArray(customRaw) ? customRaw.filter((x): x is number => typeof x === 'number') : undefined
    const v = validateCustomTrainingDays(arr, daysPerWeek)
    if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: 400 })
    customTrainingDaysJson = JSON.stringify(v.sorted)
  }

  const rawList = Array.isArray(body?.exercises) ? body.exercises : []
  if (rawList.length === 0) {
    return NextResponse.json({ ok: false, error: 'Add at least one exercise.' }, { status: 400 })
  }

  const normalized: Array<{
    name: string
    description: string | null
    weekNumber: number
    templateDayIndex: number
    sets: number
    reps: number
    percent1RM: number | null
    setTargets: { reps: number; percent1RM: number | null }[]
    notes: string | null
    progressiveOverload: boolean
  }> = []

  for (const row of rawList as InExercise[]) {
    const name = typeof row.name === 'string' ? row.name.trim() : ''
    if (!name) return NextResponse.json({ ok: false, error: 'Each exercise needs a name.' }, { status: 400 })

    const wRaw = typeof row.weekNumber === 'number' ? row.weekNumber : Number.NaN
    if (!Number.isInteger(wRaw) || wRaw < 1 || wRaw > weeks) {
      return NextResponse.json(
        { ok: false, error: `Invalid week for "${name}" (use week 1–${weeks}).` },
        { status: 400 },
      )
    }

    const tRaw = typeof row.templateDayIndex === 'number' ? row.templateDayIndex : Number.NaN
    if (!Number.isInteger(tRaw) || tRaw < 0 || tRaw >= daysPerWeek) {
      return NextResponse.json(
        { ok: false, error: `Invalid training day for "${name}" (use day index 0–${daysPerWeek - 1}).` },
        { status: 400 },
      )
    }

    const presc = normalizeIncomingExercisePrescription(row)
    if (!presc.ok) {
      return NextResponse.json({ ok: false, error: `${presc.error} (${name})` }, { status: 400 })
    }
    const lines = presc.lines
    const sets = lines.length
    const reps = lines[0].reps
    const percent1RM = lines[0].percent1RM
    const description =
      typeof row.description === 'string' && row.description.trim() ? row.description.trim() : null
    const notes = typeof row.notes === 'string' && row.notes.trim() ? row.notes.trim() : null
    const progressiveOverload = row.progressiveOverload === true

    normalized.push({
      name,
      description,
      weekNumber: wRaw,
      templateDayIndex: tRaw,
      sets,
      reps,
      percent1RM,
      setTargets: lines,
      notes,
      progressiveOverload,
    })
  }

  if (athleteId) {
    const relation = await prisma.coachAthlete.findFirst({
      where: { coachId: session.user.id, athleteId },
      select: { coachId: true },
    })
    if (!relation) {
      return NextResponse.json({ ok: false, error: 'You are not coaching this athlete.' }, { status: 403 })
    }
  }

  const ordered = [...normalized].sort((a, b) =>
    a.weekNumber !== b.weekNumber
      ? a.weekNumber - b.weekNumber
      : a.templateDayIndex !== b.templateDayIndex
        ? a.templateDayIndex - b.templateDayIndex
        : a.name.localeCompare(b.name),
  )

  const baseTitle = programNameRaw || 'Program'
  const suffix = randomBytes(3).toString('hex').toUpperCase()
  const programTitle = `Coach: ${baseTitle} · ${suffix}`

  const result = await prisma.$transaction(async (tx) => {
    const exerciseRows: { id: string }[] = []
    for (const item of ordered) {
      const ex = await tx.exercise.upsert({
        where: { name: item.name },
        update: { description: item.description },
        create: { name: item.name, description: item.description },
        select: { id: true },
      })
      exerciseRows.push(ex)
    }

    const program = await tx.program.create({
      data: {
        name: programTitle,
        description: `Coach-built ${daysPerWeek}×/week · ${splitPattern}${splitPattern === 'custom' ? ' days' : ''}`,
        createdByCoachId: session.user.id,
        libraryDaysPerWeek: athleteId ? null : daysPerWeek,
        librarySplitPattern: athleteId ? null : splitPattern,
        libraryCustomTrainingDays: athleteId ? null : customTrainingDaysJson,
        libraryWeeks: athleteId ? null : weeks,
        exercises: {
          create: ordered.map((item, idx) => ({
            exerciseId: exerciseRows[idx].id,
            sortOrder: idx,
            weekNumber: item.weekNumber,
            templateDayIndex: item.templateDayIndex,
            sets: item.sets,
            reps: item.reps,
            percent1RM: item.percent1RM,
            setTargets: item.setTargets,
            notes: item.notes,
            progressiveOverload: item.progressiveOverload,
          })),
        },
      },
      select: { id: true, name: true },
    })

    if (athleteId) {
      await tx.athleteProgramAssignment.create({
        data: {
          athleteId,
          programId: program.id,
          assignedBy: session.user.id,
          daysPerWeek,
          splitPattern,
          customTrainingDays: customTrainingDaysJson,
          weeks,
          startsOn: new Date(),
          endsOn: new Date(Date.now() + weeks * 7 * 24 * 60 * 60 * 1000),
        },
        select: { id: true },
      })
    }

    return program
  })

  return NextResponse.json({ ok: true, program: result })
}
