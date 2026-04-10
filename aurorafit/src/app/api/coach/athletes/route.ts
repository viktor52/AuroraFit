import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/session'

export async function GET() {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 })
  if (session.user.role !== 'COACH') return NextResponse.json({ ok: false, error: 'Forbidden.' }, { status: 403 })

  const rows = await prisma.coachAthlete.findMany({
    where: { coachId: session.user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      athlete: { select: { id: true, email: true, athleteProfile: { select: { fullName: true } } } },
      createdAt: true,
    },
  })

  const athleteIds = rows.map((r) => r.athlete.id)
  const assignments =
    athleteIds.length === 0
      ? []
      : await prisma.athleteProgramAssignment.findMany({
          where: { athleteId: { in: athleteIds } },
          orderBy: { createdAt: 'desc' },
          select: {
            athleteId: true,
            assignedBy: true,
            program: { select: { id: true, name: true } },
          },
        })

  const latestByAthlete = new Map<
    string,
    { programId: string; name: string; assignedBy: string | null }
  >()
  for (const a of assignments) {
    if (!latestByAthlete.has(a.athleteId)) {
      latestByAthlete.set(a.athleteId, {
        programId: a.program.id,
        name: a.program.name,
        assignedBy: a.assignedBy,
      })
    }
  }

  const athletes = rows.map((r) => {
    const latest = latestByAthlete.get(r.athlete.id)
    const canEdit = latest
      ? latest.assignedBy === session.user.id || latest.name.startsWith('Coach:')
      : false
    return {
      id: r.athlete.id,
      email: r.athlete.email,
      fullName: r.athlete.athleteProfile?.fullName ?? null,
      since: r.createdAt.toISOString(),
      latestProgram: latest
        ? { id: latest.programId, name: latest.name, canEdit }
        : null,
    }
  })

  return NextResponse.json({ ok: true, athletes })
}

