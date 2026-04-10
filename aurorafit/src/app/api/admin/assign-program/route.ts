import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { adminSecretOk } from '@/lib/adminAuth'

export async function POST(req: Request) {
  if (!adminSecretOk(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 })
  }

  const body = (await req.json().catch(() => null)) as
    | { athleteId?: unknown; programId?: unknown; startsOn?: unknown; endsOn?: unknown }
    | null

  const athleteId = typeof body?.athleteId === 'string' ? body.athleteId : ''
  const programId = typeof body?.programId === 'string' ? body.programId : ''
  const startsOn = typeof body?.startsOn === 'string' ? new Date(body.startsOn) : undefined
  const endsOn = typeof body?.endsOn === 'string' ? new Date(body.endsOn) : undefined

  if (!athleteId || !programId) {
    return NextResponse.json(
      { ok: false, error: 'athleteId and programId are required.' },
      { status: 400 },
    )
  }

  const athlete = await prisma.user.findFirst({
    where: { id: athleteId, role: 'ATHLETE' },
    select: { id: true },
  })
  if (!athlete) {
    return NextResponse.json({ ok: false, error: 'Athlete not found.' }, { status: 404 })
  }

  const program = await prisma.program.findFirst({
    where: { id: programId },
    select: { id: true },
  })
  if (!program) {
    return NextResponse.json({ ok: false, error: 'Program not found.' }, { status: 404 })
  }

  const assignment = await prisma.athleteProgramAssignment.create({
    data: {
      athleteId,
      programId,
      assignedBy: null,
      startsOn: startsOn && !Number.isNaN(startsOn.getTime()) ? startsOn : null,
      endsOn: endsOn && !Number.isNaN(endsOn.getTime()) ? endsOn : null,
    },
    select: { id: true, athleteId: true, programId: true, createdAt: true },
  })

  return NextResponse.json({ ok: true, assignment })
}

