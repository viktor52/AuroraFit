import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/session'

export async function GET() {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 })
  if (session.user.role !== 'COACH') {
    return NextResponse.json({ ok: false, error: 'Forbidden.' }, { status: 403 })
  }

  return NextResponse.json({
    ok: true,
    user: session.user,
    sessionExpiresAt: session.expiresAt.toISOString(),
  })
}

