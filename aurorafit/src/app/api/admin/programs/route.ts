import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { adminSecretOk } from '@/lib/adminAuth'

type ProgramExerciseInput = {
  exerciseId: string
  sortOrder?: number
  sets?: number
  reps?: number
  notes?: string
}

export async function GET(req: Request) {
  if (!adminSecretOk(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 })
  }
  const programs = await prisma.program.findMany({
    select: {
      id: true,
      name: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      exercises: {
        select: {
          id: true,
          weekNumber: true,
          exerciseId: true,
          sortOrder: true,
          sets: true,
          reps: true,
          notes: true,
          exercise: { select: { name: true } },
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json({ ok: true, programs })
}

export async function POST(req: Request) {
  if (!adminSecretOk(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 })
  }

  const body = (await req.json().catch(() => null)) as
    | { name?: unknown; description?: unknown; exercises?: unknown }
    | null

  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const description = typeof body?.description === 'string' ? body.description.trim() : undefined
  const exercises = Array.isArray(body?.exercises) ? (body?.exercises as unknown[]) : []

  if (!name) {
    return NextResponse.json({ ok: false, error: 'Name is required.' }, { status: 400 })
  }

  const links: ProgramExerciseInput[] = exercises
    .map((x) => (x && typeof x === 'object' ? (x as any) : null))
    .filter(Boolean)
    .map((x) => ({
      exerciseId: String((x as any).exerciseId ?? ''),
      sortOrder: typeof (x as any).sortOrder === 'number' ? (x as any).sortOrder : undefined,
      sets: typeof (x as any).sets === 'number' ? (x as any).sets : undefined,
      reps: typeof (x as any).reps === 'number' ? (x as any).reps : undefined,
      notes: typeof (x as any).notes === 'string' ? (x as any).notes : undefined,
    }))
    .filter((x) => x.exerciseId.length > 0)

  try {
    const program = await prisma.program.create({
      data: {
        name,
        description,
        exercises: {
          create: links.map((l) => ({
            exerciseId: l.exerciseId,
            weekNumber: null,
            sortOrder: l.sortOrder ?? 0,
            sets: l.sets ?? null,
            reps: l.reps ?? null,
            notes: l.notes ?? null,
          })),
        },
      },
      select: { id: true, name: true },
    })
    return NextResponse.json({ ok: true, program })
  } catch (e: unknown) {
    const code =
      e && typeof e === 'object' && 'code' in e && typeof (e as { code: unknown }).code === 'string'
        ? (e as { code: string }).code
        : null
    if (code === 'P2002') {
      return NextResponse.json({ ok: false, error: 'Program name already exists.' }, { status: 409 })
    }
    return NextResponse.json({ ok: false, error: 'Server error.' }, { status: 500 })
  }
}

