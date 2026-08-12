import { defineConfig } from 'prisma/config'
import { config } from 'dotenv'

config({ path: '.env.local' })

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'npx tsx ./prisma/seed.ts',
  },
  datasource: {
    // DIRECT_URL bypasses Supabase PgBouncer for migrations (required for session-mode pooler)
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  }
})
