import 'dotenv/config'
import { readFileSync } from 'fs'
import { join } from 'path'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import type { LifeFitnessCatalogFile } from '../src/lib/lifeFitnessCatalog'
import { buildLifeFitnessSearchText } from '../src/lib/lifeFitnessCatalog'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL is required to seed Life Fitness catalog.')
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

async function main() {
  const jsonPath = join(process.cwd(), 'data', 'life_fitness.json')
  const raw = readFileSync(jsonPath, 'utf8')
  const data = JSON.parse(raw) as LifeFitnessCatalogFile
  if (!data.machines?.length) {
    throw new Error('life_fitness.json: missing machines array')
  }

  await prisma.lifeFitnessMachine.deleteMany({})

  const batchSize = 40
  for (let i = 0; i < data.machines.length; i += batchSize) {
    const chunk = data.machines.slice(i, i + batchSize)
    await prisma.lifeFitnessMachine.createMany({
      data: chunk.map((m) => ({
        name: m.name,
        brand: m.brand,
        series: m.series ?? null,
        purpose: m.purpose,
        muscleGroups: m.muscle_groups ?? [],
        modelNumbers: m.model_numbers ?? [],
        difficultyLevel: m.difficulty_level ?? null,
        movementType: m.movement_type ?? null,
        searchText: buildLifeFitnessSearchText(m),
      })),
    })
  }

  console.log(`Seeded ${data.machines.length} Life Fitness machines (${data.catalog}).`)
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e)
    void prisma.$disconnect()
    process.exit(1)
  })
