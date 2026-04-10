import { NextResponse } from 'next/server'
import { compare } from 'bcryptjs'
import { prisma } from '@/lib/db'
import { createSessionForUser } from '@/lib/session'

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { email?: unknown; password?: unknown }
    | null

  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body?.password === 'string' ? body.password : ''

  if (!email || !email.includes('@') || !password) {
    return NextResponse.json({ ok: false, error: 'Invalid email or password.' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, role: true },
  })

  if (!user) {
    return NextResponse.json({ ok: false, error: 'Invalid email or password.' }, { status: 401 })
  }

  const ok = await compare(password, user.passwordHash)
  if (!ok) {
    return NextResponse.json({ ok: false, error: 'Invalid email or password.' }, { status: 401 })
  }

  const { expiresAt } = await createSessionForUser(user.id)

  return NextResponse.json({
    ok: true,
    role: user.role,
    sessionExpiresAt: expiresAt.toISOString(),
  })
}

