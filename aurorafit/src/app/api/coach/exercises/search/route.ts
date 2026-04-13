import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { fetchNinjaExercises } from '@/lib/apiNinjasExercises'

export async function GET(req: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 })
  if (session.user.role !== 'COACH') {
    return NextResponse.json({ ok: false, error: 'Forbidden.' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const source = (searchParams.get('source') ?? 'api_ninjas').trim()
  const name = (searchParams.get('name') ?? '').trim()
  const type = (searchParams.get('type') ?? '').trim()
  const muscle = (searchParams.get('muscle') ?? '').trim()
  const difficulty = (searchParams.get('difficulty') ?? '').trim()
  const equipment = (searchParams.get('equipment') ?? '').trim()

  if (source === 'life_fitness') {
    const parts = [name, type, muscle, difficulty, equipment].filter((p) => p.length > 0)
    const rows = await prisma.lifeFitnessMachine.findMany({
      where:
        parts.length === 0
          ? undefined
          : {
              AND: parts.map((p) => ({
                searchText: { contains: p, mode: 'insensitive' as const },
              })),
            },
      orderBy: { name: 'asc' },
      // Empty query = full catalog (capped). With filters, keep results bounded.
      take: parts.length === 0 ? 500 : 100,
    })

    const results = rows.map((row) => ({
      name: row.name,
      instructions: row.purpose,
      type: row.movementType ?? undefined,
      muscle: row.muscleGroups.length ? row.muscleGroups.join(', ') : undefined,
      equipment: [row.brand, row.series].filter(Boolean).join(' · ') || 'Life Fitness',
      difficulty: row.difficultyLevel ?? undefined,
      source: 'life_fitness' as const,
    }))

    return NextResponse.json({ ok: true, results })
  }

  if (!name && !type && !muscle && !difficulty && !equipment) {
    return NextResponse.json({ ok: true, results: [] as any[] })
  }

  const libraryWhere =
    name.length > 0
      ? {
          OR: [
            { name: { contains: name, mode: 'insensitive' as const } },
            { description: { contains: name, mode: 'insensitive' as const } },
          ],
        }
      : {}

  const library =
    name.length > 0
      ? await prisma.exercise.findMany({
          where: libraryWhere,
          take: 20,
          orderBy: { name: 'asc' },
          select: { name: true, description: true },
        })
      : []

  const libraryResults = library.map((e) => ({
    name: e.name,
    instructions: e.description ?? undefined,
    source: 'library' as const,
  }))

  const apiResults = await fetchNinjaExercises({
    name: name || undefined,
    type: type || undefined,
    muscle: muscle || undefined,
    difficulty: difficulty || undefined,
    equipment: equipment || undefined,
  })

  const fromApi = apiResults.map((e) => ({
    name: e.name,
    type: e.type,
    muscle: e.muscle,
    equipment: e.equipment,
    difficulty: e.difficulty,
    instructions: e.instructions,
    source: 'api' as const,
  }))

  const seen = new Set(libraryResults.map((r) => r.name.toLowerCase()))
  const merged: Array<{
    name: string
    instructions?: string
    type?: string
    muscle?: string
    equipment?: string
    difficulty?: string
    source?: 'library' | 'api'
  }> = [...libraryResults]
  for (const r of fromApi) {
    const k = r.name.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    merged.push(r)
  }

  return NextResponse.json({ ok: true, results: merged.slice(0, 20) })
}
