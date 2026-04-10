import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/session'

export async function POST(req: Request) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 })
  }
  if (session.user.role !== 'ATHLETE') {
    return NextResponse.json({ ok: false, error: 'Forbidden.' }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as { goals?: unknown } | null
  const goals = typeof body?.goals === 'string' ? body.goals.trim() : ''

  if (goals.length < 10) {
    return NextResponse.json(
      { ok: false, error: 'Please describe your goals (at least 10 characters).' },
      { status: 400 },
    )
  }

  const request = await prisma.programRequest.create({
    data: {
      athleteId: session.user.id,
      type: 'COACH',
      goals,
    },
    select: { id: true, status: true, createdAt: true },
  })

  return NextResponse.json({ ok: true, request })
}

