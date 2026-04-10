import { NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { prisma } from '@/lib/db'

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { email?: unknown; password?: unknown; fullName?: unknown }
    | null

  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  const fullName = typeof body?.fullName === 'string' ? body.fullName.trim() : undefined

  if (!email || !email.includes('@') || password.length < 8) {
    return NextResponse.json(
      { ok: false, error: 'Invalid email or password (min 8 chars).' },
      { status: 400 },
    )
  }

  const passwordHash = await hash(password, 12)

  try {
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: 'ATHLETE',
        athleteProfile: { create: { fullName } },
      },
      select: { id: true, email: true, role: true, createdAt: true },
    })

    return NextResponse.json({ ok: true, user })
  } catch (e: unknown) {
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
