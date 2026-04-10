type ApiNinjasExercise = {
  name: string
  type?: string
  muscle?: string
  equipment?: string
  difficulty?: string
  instructions?: string
}

function buildUrl(params: Record<string, string>) {
  const url = new URL('https://api.api-ninjas.com/v1/exercises')
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v)
  }
  return url
}

export async function fetchNinjaExercises(params: {
  name?: string
  type?: string
  muscle?: string
  difficulty?: string
  equipment?: string
}): Promise<ApiNinjasExercise[]> {
  const key = process.env.API_NINJAS_KEY
  if (!key) return []

  const url = buildUrl({
    name: params.name ?? '',
    type: params.type ?? '',
    muscle: params.muscle ?? '',
    difficulty: params.difficulty ?? '',
    equipment: params.equipment ?? '',
  })

  const res = await fetch(url, {
    headers: { 'X-Api-Key': key },
    // keep it snappy in dev
    cache: 'no-store',
  })

  if (!res.ok) return []

  const data = (await res.json().catch(() => [])) as unknown
  if (!Array.isArray(data)) return []

  return data
    .map((x) => (x && typeof x === 'object' ? (x as any) : null))
    .filter(Boolean)
    .map((x) => ({
      name: typeof x.name === 'string' ? x.name : '',
      type: typeof x.type === 'string' ? x.type : undefined,
      muscle: typeof x.muscle === 'string' ? x.muscle : undefined,
      equipment: typeof x.equipment === 'string' ? x.equipment : undefined,
      difficulty: typeof x.difficulty === 'string' ? x.difficulty : undefined,
      instructions: typeof x.instructions === 'string' ? x.instructions : undefined,
    }))
    .filter((x) => x.name.length > 0)
}

