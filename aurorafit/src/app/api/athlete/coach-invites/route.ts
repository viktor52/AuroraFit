import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/session'

export async function GET() {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 })
  if (session.user.role !== 'ATHLETE') return NextResponse.json({ ok: false, error: 'Forbidden.' }, { status: 403 })

  const invites = await prisma.coachAthleteInvite.findMany({
    where: { athleteId: session.user.id, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      createdAt: true,
      coach: { select: { id: true, email: true, coachProfile: { select: { fullName: true } } } },
    },
  })

  return NextResponse.json({ ok: true, invites })
}

export async function POST(req: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 })
  if (session.user.role !== 'ATHLETE') return NextResponse.json({ ok: false, error: 'Forbidden.' }, { status: 403 })

  const body = (await req.json().catch(() => null)) as { inviteId?: unknown; action?: unknown } | null
  const inviteId = typeof body?.inviteId === 'string' ? body.inviteId : ''
  const action = typeof body?.action === 'string' ? body.action : ''
  if (!inviteId) return NextResponse.json({ ok: false, error: 'Missing invite.' }, { status: 400 })
  if (action !== 'accept' && action !== 'decline') {
    return NextResponse.json({ ok: false, error: 'Invalid action.' }, { status: 400 })
  }

  const invite = await prisma.coachAthleteInvite.findFirst({
    where: { id: inviteId, athleteId: session.user.id, status: 'PENDING' },
    select: { id: true, coachId: true, athleteId: true },
  })
  if (!invite) return NextResponse.json({ ok: false, error: 'Invite not found.' }, { status: 404 })

  if (action === 'decline') {
    await prisma.coachAthleteInvite.update({
      where: { id: invite.id },
      data: { status: 'DECLINED', respondedAt: new Date() },
      select: { id: true },
    })
    return NextResponse.json({ ok: true })
  }

  await prisma.$transaction(async (tx) => {
    await tx.coachAthlete.upsert({
      where: { coachId_athleteId: { coachId: invite.coachId, athleteId: invite.athleteId } },
      update: {},
      create: { coachId: invite.coachId, athleteId: invite.athleteId },
      select: { coachId: true },
    })
    await tx.coachAthleteInvite.update({
      where: { id: invite.id },
      data: { status: 'ACCEPTED', respondedAt: new Date() },
      select: { id: true },
    })
  })

  return NextResponse.json({ ok: true })
}

