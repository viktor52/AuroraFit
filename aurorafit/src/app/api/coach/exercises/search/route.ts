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
  const name = (searchParams.get('name') ?? '').trim()
  const type = (searchParams.get('type') ?? '').trim()
  const muscle = (searchParams.get('muscle') ?? '').trim()
  const difficulty = (searchParams.get('difficulty') ?? '').trim()
  const equipment = (searchParams.get('equipment') ?? '').trim()

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

