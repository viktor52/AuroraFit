import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { fetchNinjaExercises } from '@/lib/apiNinjasExercises'
import { randomBytes } from 'crypto'

type GoalPreset = 'strength' | 'hypertrophy' | 'fat_loss' | 'endurance'

function goalToPreset(goals: string): GoalPreset {
  const g = goals.toLowerCase()
  if (g.includes('run') || g.includes('endurance') || g.includes('marathon')) return 'endurance'
  if (g.includes('lose') || g.includes('fat') || g.includes('cut')) return 'fat_loss'
  if (g.includes('muscle') || g.includes('hypertrophy') || g.includes('size')) return 'hypertrophy'
  return 'strength'
}

const PRESET_EXERCISES: Record<GoalPreset, Array<{ name: string; sets?: number; reps?: number; notes?: string }>> = {
  strength: [
    { name: 'Back squat', sets: 5, reps: 5, notes: 'Rest 2–3 min. Add small weight weekly.' },
    { name: 'Bench press', sets: 5, reps: 5, notes: 'Keep 1–2 reps in reserve.' },
    { name: 'Deadlift', sets: 3, reps: 5, notes: 'Perfect form > load.' },
    { name: 'Row', sets: 4, reps: 8, notes: 'Controlled tempo.' },
  ],
  hypertrophy: [
    { name: 'Leg press', sets: 4, reps: 10, notes: '1–2 reps in reserve.' },
    { name: 'Dumbbell bench press', sets: 4, reps: 10, notes: 'Full range of motion.' },
    { name: 'Lat pulldown', sets: 4, reps: 12, notes: 'Pause at the bottom.' },
    { name: 'Romanian deadlift', sets: 3, reps: 10, notes: 'Stretch hamstrings.' },
  ],
  fat_loss: [
    { name: 'Incline walk', sets: 1, reps: 1, notes: '20–30 min steady pace.' },
    { name: 'Goblet squat', sets: 3, reps: 12, notes: 'Short rests (60–90s).' },
    { name: 'Push-up', sets: 3, reps: 10, notes: 'Scale as needed.' },
    { name: 'Plank', sets: 3, reps: 1, notes: '30–60s holds.' },
  ],
  endurance: [
    { name: 'Easy run', sets: 1, reps: 1, notes: '20–40 min conversational pace.' },
    { name: 'Tempo run', sets: 1, reps: 1, notes: '10–20 min comfortably hard.' },
    { name: 'Intervals', sets: 1, reps: 1, notes: '6×2 min hard / 2 min easy.' },
    { name: 'Single-leg strength', sets: 3, reps: 10, notes: 'Split squats each leg.' },
  ],
}

function musclesForPreset(preset: GoalPreset) {
  if (preset === 'endurance') return [{ muscle: 'quadriceps', type: 'cardio' as const }]
  if (preset === 'fat_loss') return [{ muscle: 'abdominals', type: 'cardio' as const }]
  if (preset === 'hypertrophy')
    return [
      { muscle: 'chest', type: 'strength' as const },
      { muscle: 'lats', type: 'strength' as const },
      { muscle: 'quadriceps', type: 'strength' as const },
    ]
  return [
    { muscle: 'quadriceps', type: 'strength' as const },
    { muscle: 'chest', type: 'strength' as const },
    { muscle: 'lower_back', type: 'strength' as const },
  ]
}

async function getAiExercises(preset: GoalPreset) {
  // API Ninjas returns ~5 items per call; fetch a few muscles then dedupe.
  const queries = musclesForPreset(preset)
  const results = await Promise.all(
    queries.map((q) => fetchNinjaExercises({ muscle: q.muscle, type: q.type, difficulty: 'beginner' })),
  )
  const flat = results.flat()
  const seen = new Set<string>()
  const unique = flat.filter((x) => {
    const k = x.name.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  return unique.slice(0, 8)
}

export async function POST(req: Request) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 })
  }
  if (session.user.role !== 'ATHLETE') {
    return NextResponse.json({ ok: false, error: 'Forbidden.' }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as
    | { goals?: unknown; daysPerWeek?: unknown; splitPattern?: unknown; weeks?: unknown }
    | null
  const goals = typeof body?.goals === 'string' ? body.goals.trim() : ''
  const daysPerWeek = typeof body?.daysPerWeek === 'number' ? Math.floor(body.daysPerWeek) : 3
  const splitPattern = typeof body?.splitPattern === 'string' ? body.splitPattern : 'spread'
  const weeks = typeof body?.weeks === 'number' ? Math.floor(body.weeks) : 4

  const safeDays = Math.max(2, Math.min(daysPerWeek, 6))
  const safeWeeks = Math.max(1, Math.min(weeks, 16))
  const safePattern =
    splitPattern === 'consecutive' || splitPattern === 'two_on_one_off' || splitPattern === 'spread'
      ? splitPattern
      : 'spread'

  if (goals.length < 10) {
    return NextResponse.json(
      { ok: false, error: 'Please describe your goals (at least 10 characters).' },
      { status: 400 },
    )
  }

  const preset = goalToPreset(goals)
  const ninja = await getAiExercises(preset)
  const items =
    ninja.length > 0
      ? ninja.map((e) => ({
          name: e.name,
          sets: preset === 'fat_loss' || preset === 'endurance' ? 3 : 4,
          reps: preset === 'strength' ? 6 : 10,
          notes: e.instructions ?? undefined,
        }))
      : PRESET_EXERCISES[preset]

  const result = await prisma.$transaction(async (tx) => {
    // record request for traceability
    await tx.programRequest.create({
      data: { athleteId: session.user.id, type: 'AI', goals, status: 'COMPLETED' },
      select: { id: true },
    })

    // upsert exercises by unique name
    const exerciseIds: string[] = []
    for (const item of items) {
      const ex = await tx.exercise.upsert({
        where: { name: item.name },
        update: { description: item.notes ?? null },
        create: { name: item.name, description: item.notes ?? null },
        select: { id: true },
      })
      exerciseIds.push(ex.id)
    }

    const baseName = `AI: ${preset.replace('_', ' ')} (${safeWeeks}w)`
    const suffix = randomBytes(3).toString('hex').toUpperCase()
    const name = `${baseName} · ${suffix}`

    let program: { id: string; name: string }
    try {
      program = await tx.program.create({
        data: {
          name,
          description: `Generic plan generated from your goals: ${goals}`,
          exercises: {
            create: items.map((item, idx) => ({
              exerciseId: exerciseIds[idx],
              sortOrder: idx,
              weekNumber: null,
              sets: item.sets ?? null,
              reps: item.reps ?? null,
              notes: item.notes ?? null,
            })),
          },
        },
        select: { id: true, name: true },
      })
    } catch (e: unknown) {
      const code =
        e && typeof e === 'object' && 'code' in e && typeof (e as { code: unknown }).code === 'string'
          ? (e as { code: string }).code
          : null
      if (code !== 'P2002') throw e

      // rare collision, retry once
      const suffix2 = randomBytes(4).toString('hex').toUpperCase()
      program = await tx.program.create({
        data: {
          name: `${baseName} · ${suffix2}`,
          description: `Generic plan generated from your goals: ${goals}`,
          exercises: {
            create: items.map((item, idx) => ({
              exerciseId: exerciseIds[idx],
              sortOrder: idx,
              weekNumber: null,
              sets: item.sets ?? null,
              reps: item.reps ?? null,
              notes: item.notes ?? null,
            })),
          },
        },
        select: { id: true, name: true },
      })
    }

    const assignment = await tx.athleteProgramAssignment.create({
      data: {
        athleteId: session.user.id,
        programId: program.id,
        assignedBy: null,
        daysPerWeek: safeDays,
        splitPattern: safePattern,
        weeks: safeWeeks,
        startsOn: new Date(),
        endsOn: new Date(Date.now() + safeWeeks * 7 * 24 * 60 * 60 * 1000),
      },
      select: { id: true },
    })

    return { program, assignment }
  })

  return NextResponse.json({ ok: true, ...result })
}

