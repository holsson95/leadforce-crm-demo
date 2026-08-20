// CLI entry point for local/manual runs: `npm run db:seed:demo`.
// The actual seeding logic lives in src/lib/jobs/seed-demo-data.ts, shared
// with the hourly Vercel Cron reset job (src/app/api/cron/reset-demo).
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { config } from 'dotenv'
import { resetAndSeedDemoTenants } from '../src/lib/jobs/seed-demo-data'

config({ path: '.env.local' })

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const db = new PrismaClient({ adapter })

resetAndSeedDemoTenants(db)
  .catch(err => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => pool.end())
