import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/session'

export async function GET() {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 })
  if (session.user.role !== 'COACH') return NextResponse.json({ ok: false, error: 'Forbidden.' }, { status: 403 })

  const coachId = session.user.id

  const [createdList, inProgramGroup, savedRows] = await Promise.all([
    prisma.exercise.findMany({
      where: { createdByCoachId: coachId },
      select: {
        id: true,
        name: true,
        description: true,
        youtubeVideoId: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.programExercise.groupBy({
      by: ['exerciseId'],
      where: { program: { createdByCoachId: coachId } },
    }),
    prisma.coachExerciseSaved.findMany({
      where: { coachId },
      select: {
        createdAt: true,
        exercise: {
          select: {
            id: true,
            name: true,
            description: true,
            youtubeVideoId: true,
            createdAt: true,
            updatedAt: true,
            createdByCoachId: true,
          },
        },
      },
    }),
  ])

  const inProgramIds = new Set(inProgramGroup.map((g) => g.exerciseId))
  const extraIds = inProgramIds.size
    ? [...inProgramIds].filter(
        (id) => !createdList.some((e) => e.id === id) && !savedRows.some((s) => s.exercise.id === id),
      )
    : []

  const extraExercises =
    extraIds.length > 0
      ? await prisma.exercise.findMany({
          where: { id: { in: extraIds } },
          select: {
            id: true,
            name: true,
            description: true,
            youtubeVideoId: true,
            createdAt: true,
            updatedAt: true,
            createdByCoachId: true,
          },
        })
      : []

  type Row = {
    id: string
    name: string
    description: string | null
    youtubeVideoId: string | null
    kind: 'created' | 'catalog'
    inProgram: boolean
    explicitlySaved: boolean
    savedAt: string | null
    createdAt: string
    updatedAt: string
  }

  const byId = new Map<string, Row>()

  for (const e of createdList) {
    byId.set(e.id, {
      id: e.id,
      name: e.name,
      description: e.description,
      youtubeVideoId: e.youtubeVideoId,
      kind: 'created',
      inProgram: inProgramIds.has(e.id),
      explicitlySaved: savedRows.some((s) => s.exercise.id === e.id),
      savedAt: savedRows.find((s) => s.exercise.id === e.id)?.createdAt.toISOString() ?? null,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    })
  }

  for (const s of savedRows) {
    const e = s.exercise
    if (byId.has(e.id)) {
      const row = byId.get(e.id)!
      row.explicitlySaved = true
      row.savedAt = s.createdAt.toISOString()
      continue
    }
    byId.set(e.id, {
      id: e.id,
      name: e.name,
      description: e.description,
      youtubeVideoId: e.youtubeVideoId,
      kind: e.createdByCoachId === coachId ? 'created' : 'catalog',
      inProgram: inProgramIds.has(e.id),
      explicitlySaved: true,
      savedAt: s.createdAt.toISOString(),
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    })
  }

  for (const e of extraExercises) {
    if (byId.has(e.id)) continue
    byId.set(e.id, {
      id: e.id,
      name: e.name,
      description: e.description,
      youtubeVideoId: e.youtubeVideoId,
      kind: e.createdByCoachId === coachId ? 'created' : 'catalog',
      inProgram: true,
      explicitlySaved: false,
      savedAt: null,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    })
  }

  const exercises = [...byId.values()].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )

  return NextResponse.json({ ok: true, exercises })
}

export async function POST(req: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 })
  if (session.user.role !== 'COACH') return NextResponse.json({ ok: false, error: 'Forbidden.' }, { status: 403 })

  const body = (await req.json().catch(() => null)) as
    | {
        name?: unknown
        instructions?: unknown
        type?: unknown
        muscle?: unknown
        equipment?: unknown
        difficulty?: unknown
      }
    | null

  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const instructions = typeof body?.instructions === 'string' ? body.instructions.trim() : ''
  if (name.length < 2 || name.length > 200) {
    return NextResponse.json({ ok: false, error: 'Exercise name must be 2–200 characters.' }, { status: 400 })
  }

  const metaBits = [
    typeof body?.type === 'string' ? body.type.trim() : '',
    typeof body?.muscle === 'string' ? body.muscle.trim() : '',
    typeof body?.equipment === 'string' ? body.equipment.trim() : '',
    typeof body?.difficulty === 'string' ? body.difficulty.trim() : '',
  ].filter(Boolean)

  const description =
    instructions ||
    (metaBits.length ? `API · ${metaBits.join(' · ')}` : 'Imported from exercise search.')

  const exercise = await prisma.exercise.upsert({
    where: { name },
    update: { description },
    create: { name, description },
    select: { id: true, name: true, description: true },
  })

  await prisma.coachExerciseSaved.upsert({
    where: {
      coachId_exerciseId: { coachId: session.user.id, exerciseId: exercise.id },
    },
    update: {},
    create: {
      coachId: session.user.id,
      exerciseId: exercise.id,
    },
  })

  return NextResponse.json({ ok: true, exercise })
}

export async function DELETE(req: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 })
  if (session.user.role !== 'COACH') return NextResponse.json({ ok: false, error: 'Forbidden.' }, { status: 403 })

  const body = (await req.json().catch(() => null)) as { exerciseId?: unknown } | null
  const exerciseId = typeof body?.exerciseId === 'string' ? body.exerciseId.trim() : ''
  if (!exerciseId) {
    return NextResponse.json({ ok: false, error: 'exerciseId is required.' }, { status: 400 })
  }

  const coachId = session.user.id

  const exercise = await prisma.exercise.findUnique({
    where: { id: exerciseId },
    select: { id: true, createdByCoachId: true, name: true },
  })
  if (!exercise) {
    return NextResponse.json({ ok: false, error: 'Exercise not found.' }, { status: 404 })
  }

  if (exercise.createdByCoachId === coachId) {
    await prisma.exercise.delete({ where: { id: exerciseId } })
    return NextResponse.json({ ok: true, removed: 'exercise' as const })
  }

  const saved = await prisma.coachExerciseSaved.findUnique({
    where: { coachId_exerciseId: { coachId, exerciseId } },
    select: { id: true },
  })
  if (saved) {
    await prisma.coachExerciseSaved.delete({ where: { id: saved.id } })
    return NextResponse.json({ ok: true, removed: 'bookmark' as const })
  }

  const inProgram = await prisma.programExercise.findFirst({
    where: { exerciseId, program: { createdByCoachId: coachId } },
    select: { id: true },
  })
  if (inProgram) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'This exercise is only linked through your programs. Remove it from those programs (or delete the program) to drop it from your library.',
      },
      { status: 409 },
    )
  }

  return NextResponse.json({ ok: false, error: 'Nothing to remove for this exercise.' }, { status: 400 })
}
