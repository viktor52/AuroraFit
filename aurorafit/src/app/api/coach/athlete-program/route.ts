import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/session'

/**
 * Remove the athlete’s current program assignment. Deletes the Program row if no other assignment references it.
 * Body: { athleteId, programId } — programId must match the athlete’s latest assignment.
 */
export async function DELETE(req: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 })
  if (session.user.role !== 'COACH') {
    return NextResponse.json({ ok: false, error: 'Forbidden.' }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as { athleteId?: unknown; programId?: unknown } | null
  const athleteId = typeof body?.athleteId === 'string' ? body.athleteId.trim() : ''
  const programId = typeof body?.programId === 'string' ? body.programId.trim() : ''
  if (!athleteId || !programId) {
    return NextResponse.json({ ok: false, error: 'athleteId and programId are required.' }, { status: 400 })
  }

  const link = await prisma.coachAthlete.findFirst({
    where: { coachId: session.user.id, athleteId },
    select: { coachId: true },
  })
  if (!link) {
    return NextResponse.json({ ok: false, error: 'You are not coaching this athlete.' }, { status: 403 })
  }

  const latest = await prisma.athleteProgramAssignment.findFirst({
    where: { athleteId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      programId: true,
      assignedBy: true,
      program: { select: { id: true, name: true } },
    },
  })

  if (!latest || latest.programId !== programId) {
    return NextResponse.json(
      { ok: false, error: 'That program is not this athlete’s current assignment.' },
      { status: 404 },
    )
  }

  const canDelete =
    latest.assignedBy === session.user.id || latest.program.name.startsWith('Coach:')

  if (!canDelete) {
    return NextResponse.json(
      {
        ok: false,
        error: 'You can only remove programs you assigned or programs created in the coach builder (Coach: …).',
      },
      { status: 403 },
    )
  }

  await prisma.$transaction(async (tx) => {
    await tx.athleteProgramAssignment.delete({ where: { id: latest.id } })
    const remaining = await tx.athleteProgramAssignment.count({
      where: { programId: latest.programId },
    })
    if (remaining === 0) {
      const prog = await tx.program.findUnique({
        where: { id: latest.programId },
        select: { libraryDaysPerWeek: true },
      })
      // Keep coach library templates when the last assignment is removed.
      if (prog?.libraryDaysPerWeek == null) {
        await tx.program.delete({ where: { id: latest.programId } })
      }
    }
  })

  return NextResponse.json({ ok: true })
}
