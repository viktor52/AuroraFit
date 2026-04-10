import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/session'

export async function GET() {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 })
  if (session.user.role !== 'COACH') return NextResponse.json({ ok: false, error: 'Forbidden.' }, { status: 403 })

  const programs = await prisma.program.findMany({
    where: {
      createdByCoachId: session.user.id,
      libraryDaysPerWeek: { not: null },
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      createdAt: true,
      updatedAt: true,
      libraryWeeks: true,
      libraryDaysPerWeek: true,
      librarySplitPattern: true,
      _count: { select: { assignments: true } },
    },
  })

  return NextResponse.json({
    ok: true,
    programs: programs.map((p) => ({
      id: p.id,
      name: p.name,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      libraryWeeks: p.libraryWeeks,
      libraryDaysPerWeek: p.libraryDaysPerWeek,
      librarySplitPattern: p.librarySplitPattern,
      assignmentCount: p._count.assignments,
    })),
  })
}

export async function POST(req: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 })
  if (session.user.role !== 'COACH') return NextResponse.json({ ok: false, error: 'Forbidden.' }, { status: 403 })

  const body = (await req.json().catch(() => null)) as { programId?: unknown; athleteId?: unknown } | null
  const programId = typeof body?.programId === 'string' ? body.programId.trim() : ''
  const athleteId = typeof body?.athleteId === 'string' ? body.athleteId.trim() : ''
  if (!programId || !athleteId) {
    return NextResponse.json({ ok: false, error: 'programId and athleteId are required.' }, { status: 400 })
  }

  const link = await prisma.coachAthlete.findFirst({
    where: { coachId: session.user.id, athleteId },
    select: { coachId: true },
  })
  if (!link) {
    return NextResponse.json({ ok: false, error: 'You are not coaching this athlete.' }, { status: 403 })
  }

  const program = await prisma.program.findFirst({
    where: {
      id: programId,
      createdByCoachId: session.user.id,
      libraryDaysPerWeek: { not: null },
    },
    select: {
      id: true,
      libraryDaysPerWeek: true,
      librarySplitPattern: true,
      libraryCustomTrainingDays: true,
      libraryWeeks: true,
    },
  })
  if (!program) {
    return NextResponse.json({ ok: false, error: 'Program not found in your library.' }, { status: 404 })
  }

  const daysPerWeek = program.libraryDaysPerWeek ?? 3
  const splitPattern = program.librarySplitPattern ?? 'spread'
  const weeks = program.libraryWeeks ?? 4
  const customTrainingDays = program.libraryCustomTrainingDays

  const existing = await prisma.athleteProgramAssignment.findFirst({
    where: { athleteId, programId },
    select: { id: true },
  })
  if (existing) {
    return NextResponse.json(
      { ok: false, error: 'This program is already assigned to this athlete. Remove it first if you want to re-assign.' },
      { status: 409 },
    )
  }

  await prisma.athleteProgramAssignment.create({
    data: {
      athleteId,
      programId,
      assignedBy: session.user.id,
      daysPerWeek,
      splitPattern,
      customTrainingDays,
      weeks,
      startsOn: new Date(),
      endsOn: new Date(Date.now() + weeks * 7 * 24 * 60 * 60 * 1000),
    },
    select: { id: true },
  })

  return NextResponse.json({ ok: true })
}
