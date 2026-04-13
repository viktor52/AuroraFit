import 'dotenv/config'
import { defineConfig } from 'prisma/config'

/**
 * Prisma CLI (`migrate deploy`, etc.). Prefer Neon `DIRECT_URL` when set (non-pooler);
 * otherwise `DATABASE_URL` (local Docker or pooled Neon).
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
