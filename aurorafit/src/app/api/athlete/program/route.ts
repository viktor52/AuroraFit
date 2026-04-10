import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { isAiGeneratedProgramName } from '@/lib/aiProgram'

export async function GET() {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 })
  if (session.user.role !== 'ATHLETE') {
    return NextResponse.json({ ok: false, error: 'Forbidden.' }, { status: 403 })
  }

  const assignment = await prisma.athleteProgramAssignment.findFirst({
    where: { athleteId: session.user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      createdAt: true,
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
              exercise: { select: { id: true, name: true, description: true, youtubeVideoId: true } },
            },
          },
        },
      },
    },
  })

  if (!assignment) {
    return NextResponse.json({ ok: true, program: null })
  }

  let customTrainingDays: number[] | null = null
  if (assignment.customTrainingDays) {
    try {
      const parsed = JSON.parse(assignment.customTrainingDays) as unknown
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'number' && Number.isInteger(x))) {
        customTrainingDays = parsed as number[]
      }
    } catch {
      customTrainingDays = null
    }
  }

  return NextResponse.json({
    ok: true,
    assignedAt: assignment.createdAt.toISOString(),
    schedule: {
      daysPerWeek: assignment.daysPerWeek,
      splitPattern: assignment.splitPattern,
      weeks: assignment.weeks,
      customTrainingDays,
    },
    program: assignment.program,
  })
}

/**
 * Remove the athlete’s link to an AI-generated program and delete the program if nobody else uses it.
 * Optional body: { programId?: string } — defaults to latest assignment.
 */
export async function DELETE(req: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 })
  if (session.user.role !== 'ATHLETE') {
    return NextResponse.json({ ok: false, error: 'Forbidden.' }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as { programId?: unknown } | null
  const programIdFilter = typeof body?.programId === 'string' ? body.programId.trim() : ''

  const assignment = await prisma.athleteProgramAssignment.findFirst({
    where: {
      athleteId: session.user.id,
      ...(programIdFilter ? { programId: programIdFilter } : {}),
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      programId: true,
      program: { select: { id: true, name: true } },
    },
  })

  if (!assignment) {
    return NextResponse.json({ ok: false, error: 'No matching program assignment.' }, { status: 404 })
  }

  if (!isAiGeneratedProgramName(assignment.program.name)) {
    return NextResponse.json(
      { ok: false, error: 'Only AI-generated programs can be removed here.' },
      { status: 403 },
    )
  }

  await prisma.$transaction(async (tx) => {
    await tx.athleteProgramAssignment.delete({ where: { id: assignment.id } })
    const remaining = await tx.athleteProgramAssignment.count({
      where: { programId: assignment.programId },
    })
    if (remaining === 0) {
      await tx.program.delete({ where: { id: assignment.programId } })
    }
  })

  return NextResponse.json({ ok: true })
}

