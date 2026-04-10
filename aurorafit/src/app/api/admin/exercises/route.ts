import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { adminSecretOk } from '@/lib/adminAuth'

export async function GET(req: Request) {
  if (!adminSecretOk(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 })
  }
  const exercises = await prisma.exercise.findMany({
    select: { id: true, name: true, description: true, createdAt: true, updatedAt: true },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json({ ok: true, exercises })
}

export async function POST(req: Request) {
  if (!adminSecretOk(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 })
  }

  const body = (await req.json().catch(() => null)) as
    | { name?: unknown; description?: unknown }
    | null
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const description = typeof body?.description === 'string' ? body.description.trim() : undefined

  if (!name) {
    return NextResponse.json({ ok: false, error: 'Name is required.' }, { status: 400 })
  }

  try {
    const exercise = await prisma.exercise.create({
      data: { name, description },
      select: { id: true, name: true, description: true },
    })
    return NextResponse.json({ ok: true, exercise })
  } catch (e: unknown) {
    const code =
      e && typeof e === 'object' && 'code' in e && typeof (e as { code: unknown }).code === 'string'
        ? (e as { code: string }).code
        : null
    if (code === 'P2002') {
      return NextResponse.json({ ok: false, error: 'Exercise name already exists.' }, { status: 409 })
    }
    return NextResponse.json({ ok: false, error: 'Server error.' }, { status: 500 })
  }
}

