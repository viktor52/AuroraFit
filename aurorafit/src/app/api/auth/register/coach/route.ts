import { NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { prisma } from '@/lib/db'
import { digestCoachInviteKey } from '@/lib/inviteKey'

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { email?: unknown; password?: unknown; fullName?: unknown; inviteKey?: unknown }
    | null

  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  const fullName = typeof body?.fullName === 'string' ? body.fullName.trim() : undefined
  const inviteKey = typeof body?.inviteKey === 'string' ? body.inviteKey.trim() : ''

  if (!email || !email.includes('@') || password.length < 8) {
    return NextResponse.json(
      { ok: false, error: 'Invalid email or password (min 8 chars).' },
      { status: 400 },
    )
  }

  if (!inviteKey) {
    return NextResponse.json(
      { ok: false, error: 'Coach validation key is required.' },
      { status: 400 },
    )
  }

  const keyDigest = digestCoachInviteKey(inviteKey)
  const now = new Date()

  const passwordHash = await hash(password, 12)

  try {
    const user = await prisma.$transaction(async (tx) => {
      const invite = await tx.coachInviteKey.findUnique({
        where: { keyDigest },
      })

      if (!invite || invite.usedAt) {
        throw new Error('INVALID_INVITE')
      }
      if (invite.expiresAt && invite.expiresAt <= now) {
        throw new Error('EXPIRED_INVITE')
      }

      await tx.coachInviteKey.update({
        where: { id: invite.id },
        data: { usedAt: now },
      })

      return tx.user.create({
        data: {
          email,
          passwordHash,
          role: 'COACH',
          coachProfile: { create: { fullName } },
        },
        select: { id: true, email: true, role: true, createdAt: true },
      })
    })

    return NextResponse.json({ ok: true, user })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'INVALID_INVITE') {
      return NextResponse.json(
        { ok: false, error: 'Invalid or already used coach key.' },
        { status: 403 },
      )
    }
    if (msg === 'EXPIRED_INVITE') {
      return NextResponse.json(
        { ok: false, error: 'This coach key has expired. Ask your admin for a new one.' },
        { status: 403 },
      )
    }
    const code =
      e && typeof e === 'object' && 'code' in e && typeof (e as { code: unknown }).code === 'string'
        ? (e as { code: string }).code
        : null
    if (code === 'P2002') {
      return NextResponse.json(
        { ok: false, error: 'Email already registered.' },
        { status: 409 },
      )
    }
    return NextResponse.json({ ok: false, error: 'Server error.' }, { status: 500 })
  }
}
