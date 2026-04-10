import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { normalizeIncomingExercisePrescription } from '@/lib/programSetTargets'
import { validateCustomTrainingDays } from '@/lib/programWeekPlan'

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(n)))
}

const SPLIT_PATTERNS = new Set(['spread', 'consecutive', 'two_on_one_off', 'custom'])

function parseCoachTitleFromProgramName(fullName: string): string {
  const m = fullName.match(/^Coach:\s*(.+?)\s*·\s*[A-Fa-f0-9]+\s*$/i)
  if (m) return m[1].trim()
  return fullName.replace(/^Coach:\s*/i, '').replace(/\s*·\s*[A-Fa-f0-9]+\s*$/i, '').trim() || fullName
}

function replaceCoachProgramTitle(fullName: string, newTitle: string): string {
  const t = newTitle.trim()
  if (!t) return fullName
  const suffixMatch = fullName.match(/·\s*([A-Fa-f0-9]+)\s*$/i)
  const suffix = suffixMatch?.[1] ?? randomBytes(3).toString('hex').toUpperCase()
  return `Coach: ${t} · ${suffix}`
}

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

async function assertCoachCanAccessProgram(coachId: string, programId: string, athleteId: string) {
  const link = await prisma.coachAthlete.findFirst({
    where: { coachId, athleteId },
    select: { coachId: true },
  })
  if (!link) return { ok: false as const, status: 403 as const, error: 'You are not coaching this athlete.' }

  const assignment = await prisma.athleteProgramAssignment.findFirst({
    where: { programId, athleteId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      assignedBy: true,
      program: { select: { id: true, name: true } },
    },
  })
  if (!assignment) {
    return { ok: false as const, status: 404 as const, error: 'Program is not assigned to this athlete.' }
  }

  const canEdit =
    assignment.assignedBy === coachId || assignment.program.name.startsWith('Coach:')

  return { ok: true as const, assignment, canEdit }
}

export async function GET(req: Request, ctx: { params: Promise<{ programId: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 })
  if (session.user.role !== 'COACH') return NextResponse.json({ ok: false, error: 'Forbidden.' }, { status: 403 })

  const { programId } = await ctx.params
  const { searchParams } = new URL(req.url)
  const library = searchParams.get('library') === '1'
  const athleteId = (searchParams.get('athleteId') ?? '').trim()
  if (!programId) {
    return NextResponse.json({ ok: false, error: 'Missing program.' }, { status: 400 })
  }

  if (library) {
    const full = await prisma.program.findFirst({
      where: {
        id: programId,
        createdByCoachId: session.user.id,
        libraryDaysPerWeek: { not: null },
      },
      select: {
        libraryDaysPerWeek: true,
        librarySplitPattern: true,
        libraryWeeks: true,
        libraryCustomTrainingDays: true,
        id: true,
        name: true,
        description: true,
        exercises: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            weekNumber: true,
            sortOrder: true,
            templateDayIndex: true,
            sets: true,
            reps: true,
            percent1RM: true,
            setTargets: true,
            notes: true,
            progressiveOverload: true,
            exercise: {
              select: { id: true, name: true, description: true },
            },
          },
        },
      },
    })

    if (!full) {
      return NextResponse.json({ ok: false, error: 'Program not found in your library.' }, { status: 404 })
    }

    let customDays: number[] | null = null
    if (full.libraryCustomTrainingDays) {
      try {
        const p = JSON.parse(full.libraryCustomTrainingDays) as unknown
        if (Array.isArray(p) && p.every((x) => typeof x === 'number' && Number.isInteger(x))) {
          customDays = p as number[]
        }
      } catch {
        customDays = null
      }
    }

    const splitPattern = full.librarySplitPattern ?? 'spread'
    const weeks = full.libraryWeeks ?? 4
    const daysPerWeek = full.libraryDaysPerWeek ?? 3

    return NextResponse.json({
      ok: true,
      canEdit: true,
      athleteId: '',
      libraryEdit: true,
      assignment: {
        daysPerWeek,
        splitPattern,
        weeks,
        customTrainingDays: customDays,
      },
      program: {
        id: full.id,
        name: full.name,
        description: full.description,
        exercises: full.exercises,
      },
      programTitleHint: parseCoachTitleFromProgramName(full.name),
    })
  }

  if (!athleteId) {
    return NextResponse.json({ ok: false, error: 'Missing athlete.' }, { status: 400 })
  }

  const gate = await assertCoachCanAccessProgram(session.user.id, programId, athleteId)
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status })

  const full = await prisma.athleteProgramAssignment.findFirst({
    where: { programId, athleteId },
    orderBy: { createdAt: 'desc' },
    select: {
      daysPerWeek: true,
      splitPattern: true,
      weeks: true,
      customTrainingDays: true,
      program: {
        select: {
          id: true,
          name: true,
          description: true,
          exercises: {
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              weekNumber: true,
              sortOrder: true,
              templateDayIndex: true,
              sets: true,
              reps: true,
              percent1RM: true,
              setTargets: true,
              notes: true,
              progressiveOverload: true,
              exercise: {
                select: { id: true, name: true, description: true },
              },
            },
          },
        },
      },
    },
  })

  if (!full) return NextResponse.json({ ok: false, error: 'Not found.' }, { status: 404 })

  let customDays: number[] | null = null
  if (full.customTrainingDays) {
    try {
      const p = JSON.parse(full.customTrainingDays) as unknown
      if (Array.isArray(p) && p.every((x) => typeof x === 'number' && Number.isInteger(x))) {
        customDays = p as number[]
      }
    } catch {
      customDays = null
    }
  }

  return NextResponse.json({
    ok: true,
    canEdit: gate.canEdit,
    athleteId,
    assignment: {
      daysPerWeek: full.daysPerWeek,
      splitPattern: full.splitPattern,
      weeks: full.weeks,
      customTrainingDays: customDays,
    },
    program: full.program,
    programTitleHint: parseCoachTitleFromProgramName(full.program.name),
  })
}

export async function PATCH(req: Request, ctx: { params: Promise<{ programId: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 })
  if (session.user.role !== 'COACH') return NextResponse.json({ ok: false, error: 'Forbidden.' }, { status: 403 })

  const { programId } = await ctx.params
  const body = (await req.json().catch(() => null)) as
    | {
        libraryEdit?: unknown
        athleteId?: unknown
        programName?: unknown
        weeks?: unknown
        daysPerWeek?: unknown
        splitPattern?: unknown
        customTrainingDays?: unknown
        exercises?: unknown
      }
    | null

  const libraryEdit = body?.libraryEdit === true
  const athleteId = typeof body?.athleteId === 'string' ? body.athleteId.trim() : ''

  if (!programId) {
    return NextResponse.json({ ok: false, error: 'Missing program.' }, { status: 400 })
  }

  if (libraryEdit) {
    const lib = await prisma.program.findFirst({
      where: {
        id: programId,
        createdByCoachId: session.user.id,
        libraryDaysPerWeek: { not: null },
      },
      select: { id: true },
    })
    if (!lib) {
      return NextResponse.json({ ok: false, error: 'Program not found in your library.' }, { status: 404 })
    }
  } else {
    if (!athleteId) {
      return NextResponse.json({ ok: false, error: 'Missing athlete.' }, { status: 400 })
    }

    const gate = await assertCoachCanAccessProgram(session.user.id, programId, athleteId)
    if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status })
    if (!gate.canEdit) {
      return NextResponse.json({ ok: false, error: 'You can only edit coach-built programs.' }, { status: 403 })
    }
  }

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
        { ok: false, error: `Invalid training day for "${name}".` },
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

  const ordered = [...normalized].sort((a, b) =>
    a.weekNumber !== b.weekNumber
      ? a.weekNumber - b.weekNumber
      : a.templateDayIndex !== b.templateDayIndex
        ? a.templateDayIndex - b.templateDayIndex
        : a.name.localeCompare(b.name),
  )

  const currentProgram = await prisma.program.findUnique({
    where: { id: programId },
    select: { name: true },
  })
  if (!currentProgram) return NextResponse.json({ ok: false, error: 'Program not found.' }, { status: 404 })

  const nextProgramName =
    programNameRaw.length > 0 ? replaceCoachProgramTitle(currentProgram.name, programNameRaw) : currentProgram.name

  if (nextProgramName !== currentProgram.name) {
    const clash = await prisma.program.findFirst({
      where: { name: nextProgramName, NOT: { id: programId } },
      select: { id: true },
    })
    if (clash) {
      return NextResponse.json({ ok: false, error: 'That program title conflicts with another program name.' }, { status: 409 })
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.programExercise.deleteMany({ where: { programId } })

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

    await tx.program.update({
      where: { id: programId },
      data: {
        name: nextProgramName,
        description: `Coach-built ${daysPerWeek}×/week · ${splitPattern}${splitPattern === 'custom' ? ' days' : ''}`,
        ...(libraryEdit
          ? {
              libraryDaysPerWeek: daysPerWeek,
              librarySplitPattern: splitPattern,
              libraryCustomTrainingDays: customTrainingDaysJson,
              libraryWeeks: weeks,
            }
          : {}),
      },
    })

    for (let idx = 0; idx < ordered.length; idx++) {
      const item = ordered[idx]
      await tx.programExercise.create({
        data: {
          programId,
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
        },
      })
    }

    if (!libraryEdit) {
      await tx.athleteProgramAssignment.updateMany({
        where: { programId, athleteId },
        data: {
          daysPerWeek,
          splitPattern,
          customTrainingDays: customTrainingDaysJson,
          weeks,
          startsOn: new Date(),
          endsOn: new Date(Date.now() + weeks * 7 * 24 * 60 * 60 * 1000),
        },
      })
    }
  })

  const updated = await prisma.program.findUnique({
    where: { id: programId },
    select: { id: true, name: true },
  })

  return NextResponse.json({ ok: true, program: updated })
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ programId: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 })
  if (session.user.role !== 'COACH') return NextResponse.json({ ok: false, error: 'Forbidden.' }, { status: 403 })

  const { programId } = await ctx.params
  if (!programId) {
    return NextResponse.json({ ok: false, error: 'Missing program.' }, { status: 400 })
  }

  const program = await prisma.program.findFirst({
    where: {
      id: programId,
      createdByCoachId: session.user.id,
      libraryDaysPerWeek: { not: null },
    },
    select: { id: true },
  })
  if (!program) {
    return NextResponse.json({ ok: false, error: 'Program not found in your library.' }, { status: 404 })
  }

  await prisma.program.delete({ where: { id: programId } })
  return NextResponse.json({ ok: true })
}
