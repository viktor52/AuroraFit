import 'dotenv/config'
import { defineConfig } from 'prisma/config'

/**
 * Prisma CLI (migrate, db push) connection.
 * - Neon: set DIRECT_URL to the non-pooler "direct" host; keep DATABASE_URL as the pooled URL for the app (see src/lib/db.ts).
 * - Local Docker: only DATABASE_URL is required (DIRECT_URL optional).
 */
function prismaCliUrl(): string {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!url) {
    throw new Error('Missing DATABASE_URL or DIRECT_URL for Prisma CLI.')
  }
  return url
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: prismaCliUrl(),
  },
})
