import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { digestCoachInviteKey, generateCoachInvitePlainKey } from '@/lib/inviteKey'
import { adminSecretOk } from '@/lib/adminAuth'

/**
 * Mint a one-time coach registration key. Protect with ADMIN_SETUP_SECRET until you have real admin auth.
 * Headers: X-Admin-Secret: <same as env>
 * Body (optional): { "expiresInDays": number, "createdByUserId": string }
 */
export async function POST(req: Request) {
  if (!adminSecretOk(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    expiresInDays?: unknown
    createdByUserId?: unknown
  }

  let expiresAt: Date | undefined
  if (typeof body.expiresInDays === 'number' && Number.isFinite(body.expiresInDays) && body.expiresInDays > 0) {
    expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + Math.min(Math.floor(body.expiresInDays), 365))
  }

  const createdByUserId =
    typeof body.createdByUserId === 'string' && body.createdByUserId.length > 0
      ? body.createdByUserId
      : undefined

  if (createdByUserId) {
    const admin = await prisma.user.findFirst({
      where: { id: createdByUserId, role: 'ADMIN' },
      select: { id: true },
    })
    if (!admin) {
      return NextResponse.json(
        { ok: false, error: 'createdByUserId must be an existing admin user.' },
        { status: 400 },
      )
    }
  }

  const plainKey = generateCoachInvitePlainKey()
  const keyDigest = digestCoachInviteKey(plainKey)

  try {
    await prisma.coachInviteKey.create({
      data: {
        keyDigest,
        expiresAt: expiresAt ?? null,
        createdByUserId: createdByUserId ?? null,
      },
    })
  } catch {
    return NextResponse.json({ ok: false, error: 'Could not create key.' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    key: plainKey,
    expiresAt: expiresAt?.toISOString() ?? null,
    message: 'Share this key with the coach once. It cannot be shown again.',
  })
}
