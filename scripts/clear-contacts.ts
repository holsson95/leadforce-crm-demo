import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const db = new PrismaClient({ adapter })

async function main() {
  const scriptVersions = await db.scriptVersion.deleteMany({})
  const callRecords    = await db.callRecord.deleteMany({})
  const sessions       = await db.session.deleteMany({})
  const notes          = await db.contactNote.deleteMany({})
  const deals          = await db.pipelineDeal.deleteMany({})
  const tasks          = await db.task.deleteMany({
    where: { OR: [{ contactId: { not: null } }, { campaignId: { not: null } }] },
  })
  const campaignSdrs   = await db.campaignSDR.deleteMany({})
  const scripts        = await db.script.deleteMany({})
  const contacts       = await db.contact.deleteMany({})
  const campaigns      = await db.campaign.deleteMany({})

  console.log('Purge complete:')
  console.log(`  ${campaigns.count} campaigns`)
  console.log(`  ${contacts.count} contacts`)
  console.log(`  ${callRecords.count} call records`)
  console.log(`  ${sessions.count} sessions`)
  console.log(`  ${notes.count} contact notes`)
  console.log(`  ${deals.count} pipeline deals`)
  console.log(`  ${tasks.count} tasks`)
  console.log(`  ${scripts.count} scripts (${scriptVersions.count} versions)`)
  console.log(`  ${campaignSdrs.count} campaign SDR assignments`)
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
