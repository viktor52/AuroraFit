import { NextResponse } from 'next/server'
import { POST as athletePost } from './athlete/route'

/**
 * Legacy endpoint: athletes only. Prefer POST /api/auth/register/athlete.
 * Coach signup must use POST /api/auth/register/coach with an admin-issued key.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { email?: unknown; password?: unknown; role?: unknown; fullName?: unknown }
    | null

  const role = body?.role
  if (role === 'COACH' || role === 'ADMIN') {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Coach and admin accounts cannot be created through this endpoint. Use /register/coach with a validation key.',
      },
      { status: 403 },
    )
  }

  const forward = new Request(req.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: body?.email,
      password: body?.password,
      fullName: body?.fullName,
    }),
  })

  return athletePost(forward)
}
