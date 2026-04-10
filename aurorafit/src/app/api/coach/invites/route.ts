import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/session'

export async function GET() {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 })
  if (session.user.role !== 'COACH') return NextResponse.json({ ok: false, error: 'Forbidden.' }, { status: 403 })

  const invites = await prisma.coachAthleteInvite.findMany({
    where: { coachId: session.user.id, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      createdAt: true,
      athlete: { select: { id: true, email: true, athleteProfile: { select: { fullName: true } } } },
    },
  })

  return NextResponse.json({ ok: true, invites })
}

export async function POST(req: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 })
  if (session.user.role !== 'COACH') return NextResponse.json({ ok: false, error: 'Forbidden.' }, { status: 403 })

  const body = (await req.json().catch(() => null)) as { athleteEmail?: unknown } | null
  const athleteEmail = typeof body?.athleteEmail === 'string' ? body.athleteEmail.trim().toLowerCase() : ''
  if (!athleteEmail || !athleteEmail.includes('@')) {
    return NextResponse.json({ ok: false, error: 'Enter a valid athlete email.' }, { status: 400 })
  }

  const athlete = await prisma.user.findFirst({
    where: { email: athleteEmail, role: 'ATHLETE' },
    select: { id: true },
  })
  if (!athlete) {
    return NextResponse.json({ ok: false, error: 'No athlete account found for that email.' }, { status: 404 })
  }

  const existingRel = await prisma.coachAthlete.findFirst({
    where: { coachId: session.user.id, athleteId: athlete.id },
    select: { coachId: true },
  })
  if (existingRel) {
    return NextResponse.json({ ok: false, error: 'You are already coaching this athlete.' }, { status: 409 })
  }

  try {
    const invite = await prisma.coachAthleteInvite.create({
      data: { coachId: session.user.id, athleteId: athlete.id, status: 'PENDING' },
      select: {
        id: true,
        createdAt: true,
        athlete: { select: { id: true, email: true } },
      },
    })
    return NextResponse.json({ ok: true, invite })
  } catch (e: unknown) {
    const code =
      e && typeof e === 'object' && 'code' in e && typeof (e as { code: unknown }).code === 'string'
        ? (e as { code: string }).code
        : null
    if (code === 'P2002') {
      return NextResponse.json({ ok: false, error: 'Invite already pending for this athlete.' }, { status: 409 })
    }
    return NextResponse.json({ ok: false, error: 'Server error.' }, { status: 500 })
  }
}

