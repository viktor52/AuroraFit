import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/session'

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(n)))
}

export async function POST(req: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 })
  if (session.user.role !== 'COACH') return NextResponse.json({ ok: false, error: 'Forbidden.' }, { status: 403 })

  const body = (await req.json().catch(() => null)) as
    | {
        athleteId?: unknown
        name?: unknown
        description?: unknown
        sets?: unknown
        reps?: unknown
        percent1RM?: unknown
        notes?: unknown
      }
    | null

  const athleteId = typeof body?.athleteId === 'string' ? body.athleteId : ''
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const description = typeof body?.description === 'string' ? body.description.trim() : ''
  const notes = typeof body?.notes === 'string' ? body.notes.trim() : ''

  const setsRaw = typeof body?.sets === 'number' ? body.sets : Number.NaN
  const repsRaw = typeof body?.reps === 'number' ? body.reps : Number.NaN
  const pctRaw = typeof body?.percent1RM === 'number' ? body.percent1RM : Number.NaN

  if (!athleteId) return NextResponse.json({ ok: false, error: 'Missing athlete.' }, { status: 400 })
  if (!name) return NextResponse.json({ ok: false, error: 'Missing exercise name.' }, { status: 400 })

  const sets = Number.isFinite(setsRaw) ? clampInt(setsRaw, 1, 20) : 3
  const reps = Number.isFinite(repsRaw) ? clampInt(repsRaw, 1, 50) : 10
  const percent1RM = Number.isFinite(pctRaw) ? clampInt(pctRaw, 1, 100) : null

  const relation = await prisma.coachAthlete.findFirst({
    where: { coachId: session.user.id, athleteId },
    select: { coachId: true },
  })
  if (!relation) {
    return NextResponse.json({ ok: false, error: 'You are not coaching this athlete.' }, { status: 403 })
  }

  const result = await prisma.$transaction(async (tx) => {
    const ex = await tx.exercise.upsert({
      where: { name },
      update: { description: description || null },
      create: { name, description: description || null },
      select: { id: true, name: true },
    })

    const latest = await tx.athleteProgramAssignment.findFirst({
      where: { athleteId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, programId: true, program: { select: { name: true } } },
    })

    let programId = latest?.programId ?? null
    const hasExplicitLayout =
      programId != null
        ? !!(await tx.programExercise.findFirst({
            where: { programId, templateDayIndex: { not: null } },
            select: { programId: true },
          }))
        : false

    if (!programId) {
      const suffix = Math.random().toString(16).slice(2, 8).toUpperCase()
      const program = await tx.program.create({
        data: {
          name: `Coach plan · ${suffix}`,
          description: `Coach-assigned plan.`,
        },
        select: { id: true },
      })
      programId = program.id
      await tx.athleteProgramAssignment.create({
        data: {
          athleteId,
          programId,
          assignedBy: session.user.id,
          startsOn: new Date(),
          endsOn: null,
        },
        select: { id: true },
      })
    }

    const existing = await tx.programExercise.findFirst({
      where: { programId, exerciseId: ex.id, weekNumber: null },
      select: { id: true, sortOrder: true },
    })
    const sortOrder =
      existing?.sortOrder ??
      ((await tx.programExercise.aggregate({
        where: { programId },
        _max: { sortOrder: true },
      }))._max.sortOrder ?? 0) + 1

    if (existing) {
      await tx.programExercise.update({
        where: { id: existing.id },
        data: {
          sets,
          reps,
          percent1RM,
          notes: notes || null,
        },
      })
    } else {
      await tx.programExercise.create({
        data: {
          programId,
          exerciseId: ex.id,
          weekNumber: null,
          sortOrder,
          templateDayIndex: hasExplicitLayout ? 0 : null,
          sets,
          reps,
          percent1RM,
          notes: notes || null,
        },
      })
    }

    return { programId, exerciseId: ex.id }
  })

  return NextResponse.json({ ok: true, ...result })
}

