import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { parseYoutubeVideoIdFromUrlOrId } from '@/lib/youtubeVideoId'

export async function POST(req: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 })
  if (session.user.role !== 'COACH') return NextResponse.json({ ok: false, error: 'Forbidden.' }, { status: 403 })

  const body = (await req.json().catch(() => null)) as
    | { name?: unknown; description?: unknown; youtubeUrl?: unknown }
    | null

  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const description = typeof body?.description === 'string' ? body.description.trim() : ''
  const youtubeRaw = typeof body?.youtubeUrl === 'string' ? body.youtubeUrl.trim() : ''

  if (name.length < 2) {
    return NextResponse.json({ ok: false, error: 'Name must be at least 2 characters.' }, { status: 400 })
  }
  if (name.length > 200) {
    return NextResponse.json({ ok: false, error: 'Name is too long.' }, { status: 400 })
  }
  if (!description || description.length < 2) {
    return NextResponse.json({ ok: false, error: 'Description is required.' }, { status: 400 })
  }
  if (description.length > 4000) {
    return NextResponse.json({ ok: false, error: 'Description is too long.' }, { status: 400 })
  }
  if (!youtubeRaw) {
    return NextResponse.json({ ok: false, error: 'YouTube URL or video id is required.' }, { status: 400 })
  }

  const youtubeVideoId = parseYoutubeVideoIdFromUrlOrId(youtubeRaw)
  if (!youtubeVideoId) {
    return NextResponse.json({ ok: false, error: 'Could not read a YouTube video id from that link.' }, { status: 400 })
  }

  const existing = await prisma.exercise.findUnique({ where: { name }, select: { id: true } })
  if (existing) {
    return NextResponse.json(
      { ok: false, error: 'An exercise with this name already exists. Choose a different name.' },
      { status: 409 },
    )
  }

  const ex = await prisma.exercise.create({
    data: {
      name,
      description,
      youtubeVideoId,
      createdByCoachId: session.user.id,
    },
    select: { id: true, name: true, description: true, youtubeVideoId: true },
  })

  return NextResponse.json({ ok: true, exercise: ex })
}
