import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { adminSecretOk } from '@/lib/adminAuth'

export async function GET(req: Request) {
  if (!adminSecretOk(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 })
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      role: true,
      createdAt: true,
      athleteProfile: { select: { fullName: true } },
      coachProfile: { select: { fullName: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ ok: true, users })
}

