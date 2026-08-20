import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { config } from 'dotenv'

config({ path: '.env.local' })

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  // --- Tenant ---
  let tenant = await prisma.tenant.findFirst({ where: { slug: 'leadforce-demo' } })
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: { name: 'LeadForce Demo', slug: 'leadforce-demo' },
    })
    console.log('Created demo tenant:', tenant.id)
  } else {
    console.log('Demo tenant already exists:', tenant.id)
  }

  // --- User ---
  // CLERK_USER_ID can be set in .env.local or passed as an env var when running the seed:
  //   CLERK_USER_ID=user_xxx npx prisma db seed
  // Find your Clerk user ID in: Clerk Dashboard → Users → click your user → copy "User ID"
  const clerkId = process.env.CLERK_USER_ID ?? 'REPLACE_WITH_YOUR_CLERK_USER_ID'

  const existing = await prisma.user.findUnique({ where: { tenantId_clerkId: { tenantId: tenant.id, clerkId } } })
  if (existing) {
    console.log('User already exists:', existing.id)
  } else {
    const user = await prisma.user.create({
      data: {
        clerkId,
        tenantId: tenant.id,
        email:    'admin@leadforce-demo.com',
        name:     'Demo Admin',
        role:     'admin',
      },
    })
    console.log('Created demo user:', user.id)
  }

  console.log('')
  console.log('Next steps:')
  console.log('→ Clerk Dashboard → Users → your user → publicMetadata')
  console.log(`→ Set: { "role": "admin", "tenantId": "${tenant.id}" }`)
  if (clerkId === 'REPLACE_WITH_YOUR_CLERK_USER_ID') {
    console.log('')
    console.log('⚠  User record was created with a placeholder clerkId.')
    console.log('   Run: CLERK_USER_ID=<your-clerk-id> npx prisma db seed')
    console.log('   Or update the clerkId column in the User table via Prisma Studio:')
    console.log('   npx prisma studio')
  }
}

main()
  .catch(console.error)
  .finally(() => pool.end())
