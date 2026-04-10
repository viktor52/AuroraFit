import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { fetchNinjaExercises } from '@/lib/apiNinjasExercises'
import { getSessionUser } from '@/lib/session'
import { resolveYoutubeEmbedVideoId } from '@/lib/youtubeSearch'

export async function GET(req: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 })
  if (session.user.role !== 'ATHLETE') {
    return NextResponse.json({ ok: false, error: 'Forbidden.' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const raw = searchParams.get('name') ?? ''
  const name = raw.trim().slice(0, 200)
  const exerciseId = (searchParams.get('exerciseId') ?? '').trim()

  if (exerciseId) {
    if (name.length < 2) {
      return NextResponse.json({ ok: false, error: 'Missing name.' }, { status: 400 })
    }

    const latest = await prisma.athleteProgramAssignment.findFirst({
      where: { athleteId: session.user.id },
      orderBy: { createdAt: 'desc' },
      select: { programId: true },
    })
    if (!latest) {
      return NextResponse.json({ ok: false, error: 'No program.' }, { status: 404 })
    }

    const pe = await prisma.programExercise.findFirst({
      where: { programId: latest.programId, exerciseId },
      select: {
        exercise: {
          select: { id: true, name: true, description: true, youtubeVideoId: true },
        },
      },
    })
    if (!pe || pe.exercise.name.toLowerCase() !== name.toLowerCase()) {
      return NextResponse.json({ ok: false, error: 'Exercise not in your current program.' }, { status: 404 })
    }

    const ex = pe.exercise
    const list = await fetchNinjaExercises({ name: ex.name })
    const lower = ex.name.toLowerCase()
    const ninjaFromApi =
      list.find((x) => x.name.toLowerCase() === lower) ??
      list.find((x) => x.name.toLowerCase().includes(lower) || lower.includes(x.name.toLowerCase())) ??
      list[0] ??
      null

    const ninjaFromDb =
      ex.description?.trim() && !ninjaFromApi
        ? {
            name: ex.name,
            type: null as string | null,
            muscle: null as string | null,
            equipment: null as string | null,
            difficulty: null as string | null,
            instructions: ex.description.trim(),
          }
        : null

    const ninja = ninjaFromApi
      ? {
          name: ninjaFromApi.name,
          type: ninjaFromApi.type ?? null,
          muscle: ninjaFromApi.muscle ?? null,
          equipment: ninjaFromApi.equipment ?? null,
          difficulty: ninjaFromApi.difficulty ?? null,
          instructions: ninjaFromApi.instructions ?? ex.description?.trim() ?? null,
        }
      : ninjaFromDb

    const searchQuery = `${ex.name} exercise form tutorial`
    const videoId =
      ex.youtubeVideoId && /^[\w-]{11}$/.test(ex.youtubeVideoId)
        ? ex.youtubeVideoId
        : await resolveYoutubeEmbedVideoId(searchQuery)
    const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`
    const watchUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : youtubeSearchUrl

    return NextResponse.json({
      ok: true,
      ninja,
      videoId,
      watchUrl,
    })
  }

  if (name.length < 2) {
    return NextResponse.json({ ok: false, error: 'Missing name.' }, { status: 400 })
  }

  const list = await fetchNinjaExercises({ name })
  const lower = name.toLowerCase()
  const ninja =
    list.find((x) => x.name.toLowerCase() === lower) ??
    list.find((x) => x.name.toLowerCase().includes(lower) || lower.includes(x.name.toLowerCase())) ??
    list[0] ??
    null

  const searchQuery = `${name} exercise form tutorial`
  const videoId = await resolveYoutubeEmbedVideoId(searchQuery)
  const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`
  const watchUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : youtubeSearchUrl

  return NextResponse.json({
    ok: true,
    ninja: ninja
      ? {
          name: ninja.name,
          type: ninja.type ?? null,
          muscle: ninja.muscle ?? null,
          equipment: ninja.equipment ?? null,
          difficulty: ninja.difficulty ?? null,
          instructions: ninja.instructions ?? null,
        }
      : null,
    videoId,
    watchUrl,
  })
}
