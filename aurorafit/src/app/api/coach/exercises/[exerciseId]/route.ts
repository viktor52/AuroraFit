import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { parseYoutubeVideoIdFromUrlOrId } from '@/lib/youtubeVideoId'

export async function PATCH(req: Request, ctx: { params: Promise<{ exerciseId: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 })
  if (session.user.role !== 'COACH') return NextResponse.json({ ok: false, error: 'Forbidden.' }, { status: 403 })

  const { exerciseId } = await ctx.params
  if (!exerciseId) {
    return NextResponse.json({ ok: false, error: 'Missing exercise.' }, { status: 400 })
  }

  const existing = await prisma.exercise.findFirst({
    where: { id: exerciseId, createdByCoachId: session.user.id },
    select: { id: true, name: true },
  })
  if (!existing) {
    return NextResponse.json(
      { ok: false, error: 'Exercise not found or you can only edit exercises you created.' },
      { status: 404 },
    )
  }

  const body = (await req.json().catch(() => null)) as
    | { name?: unknown; description?: unknown; youtubeUrl?: unknown }
    | null

  const nameRaw = typeof body?.name === 'string' ? body.name.trim() : ''
  const description = typeof body?.description === 'string' ? body.description.trim() : ''
  const youtubeRaw = typeof body?.youtubeUrl === 'string' ? body.youtubeUrl.trim() : ''

  if (nameRaw.length < 2 || nameRaw.length > 200) {
    return NextResponse.json({ ok: false, error: 'Name must be 2–200 characters.' }, { status: 400 })
  }
  if (description.length < 2 || description.length > 4000) {
    return NextResponse.json({ ok: false, error: 'Description must be 2–4000 characters.' }, { status: 400 })
  }
  if (!youtubeRaw) {
    return NextResponse.json({ ok: false, error: 'YouTube URL or video id is required.' }, { status: 400 })
  }

  const youtubeVideoId = parseYoutubeVideoIdFromUrlOrId(youtubeRaw)
  if (!youtubeVideoId) {
    return NextResponse.json({ ok: false, error: 'Could not read a YouTube video id from that link.' }, { status: 400 })
  }

  if (nameRaw !== existing.name) {
    const clash = await prisma.exercise.findUnique({ where: { name: nameRaw }, select: { id: true } })
    if (clash && clash.id !== exerciseId) {
      return NextResponse.json({ ok: false, error: 'Another exercise already uses that name.' }, { status: 409 })
    }
  }

  const updated = await prisma.exercise.update({
    where: { id: exerciseId },
    data: {
      name: nameRaw,
      description,
      youtubeVideoId,
    },
    select: { id: true, name: true, description: true, youtubeVideoId: true },
  })

  return NextResponse.json({ ok: true, exercise: updated })
}
