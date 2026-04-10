import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/session'

export async function GET() {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 })
  }
  if (session.user.role !== 'ATHLETE') {
    return NextResponse.json({ ok: false, error: 'Forbidden.' }, { status: 403 })
  }

  const assignments = await prisma.athleteProgramAssignment.findMany({
    where: { athleteId: session.user.id },
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: {
      createdAt: true,
      program: {
        select: {
          id: true,
          name: true,
          exercises: {
            orderBy: { sortOrder: 'asc' },
            take: 4,
            select: { exercise: { select: { name: true } } },
          },
        },
      },
    },
  })

  const assignedCount = await prisma.athleteProgramAssignment.count({
    where: { athleteId: session.user.id },
  })

  const coaches = await prisma.coachAthlete.findMany({
    where: { athleteId: session.user.id },
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: {
      createdAt: true,
      coach: { select: { id: true, email: true, coachProfile: { select: { fullName: true } } } },
    },
  })

  const assignedCoach = coaches[0]
    ? {
        id: coaches[0].coach.id,
        email: coaches[0].coach.email,
        fullName: coaches[0].coach.coachProfile?.fullName ?? null,
        since: coaches[0].createdAt.toISOString(),
      }
    : null

  const activeProgram =
    assignments[0]?.program
      ? {
          id: assignments[0].program.id,
          name: assignments[0].program.name,
          latestExercises: assignments[0].program.exercises.map((e) => e.exercise.name),
        }
      : null

  return NextResponse.json({
    ok: true,
    user: session.user,
    sessionExpiresAt: session.expiresAt.toISOString(),
    stats: {
      assigned: assignedCount,
      completed: 0,
      remaining: 0,
      programDays: 0,
    },
    assignedCoach,
    activeProgram,
  })
}

