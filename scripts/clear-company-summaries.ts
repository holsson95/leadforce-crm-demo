import { config } from 'dotenv'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

config({ path: '.env.local' })

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const db = new PrismaClient({ adapter })

async function main() {
  const summaries = await db.companySummary.deleteMany({})
  console.log(`Cleared ${summaries.count} cached company summaries`)
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
