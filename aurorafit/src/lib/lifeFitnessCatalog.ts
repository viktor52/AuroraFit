/** Shape of entries in data/life_fitness.json */
export type LifeFitnessJsonMachine = {
  name: string
  brand: string
  series?: string
  purpose: string
  muscle_groups: string[]
  model_numbers: string[]
  difficulty_level: string
  movement_type: string
}

export type LifeFitnessCatalogFile = {
  catalog: string
  machines: LifeFitnessJsonMachine[]
}

export function buildLifeFitnessSearchText(m: LifeFitnessJsonMachine): string {
  const parts: string[] = [
    m.name,
    m.brand,
    m.series ?? '',
    m.purpose,
    m.difficulty_level,
    m.movement_type,
    ...(m.muscle_groups ?? []),
    ...(m.model_numbers ?? []),
  ]
  return parts.join(' ').toLowerCase()
}
