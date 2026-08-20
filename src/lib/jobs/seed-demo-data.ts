// Public demo build: seeds two fully-fictional tenants ("Acme Outreach" and
// "Nova Sales") with reps, clients, campaigns, contacts, call history,
// pipeline deals, and tasks — populated enough that the dashboard, pipeline,
// and reports don't look empty on a visitor's first click.
//
// Shared by scripts/seed-demo.ts (manual/local runs) and
// src/app/api/cron/reset-demo/route.ts (hourly Vercel Cron reset).
//
// Safe to re-run any time: the "identity" layer (Tenant, TenantSettings,
// User rows) is found-or-created so IDs stay stable — Clerk's
// publicMetadata.tenantId for the shared demo login keeps pointing at the
// same tenant. Everything downstream (clients, campaigns, contacts, calls,
// deals, tasks, scripts) is wiped and rebuilt from scratch every run, which
// is what actually resets any edits a visitor made.
import type { PrismaClient, CallOutcome, ContactStatus } from '@prisma/client'
import { computeDedupeHash } from '@/lib/csv/dedup'
import { normalizePhoneDigits } from '@/lib/utils/phone'
import { DEFAULT_STAGES } from '@/lib/pipeline-defaults'

// Typed against the plain PrismaClient. src/app/api/cron/reset-demo casts
// the app's tenant-scoping-extended client (@/lib/db) to this type at the
// call site — the extension only intercepts queries inside withTenant()'s
// AsyncLocalStorage context, which none of this file's calls run inside, so
// the extended client behaves identically to a plain one here at runtime.
type DbClient = PrismaClient

let fakePhoneCounter = 100

function fakePhone(): string {
  fakePhoneCounter += 1
  // 555-01XX is the NANP block permanently reserved for fiction/demos.
  return `(415) 555-0${String(fakePhoneCounter).padStart(3, '0')}`
}

const FIRST_NAMES = ['Jordan', 'Priya', 'Sam', 'Casey', 'Morgan', 'Elena', 'Theo', 'Nadia', 'Owen', 'Ines', 'Marcus', 'Ling', 'Ravi', 'Zoe', 'Kwame', 'Ana']
const LAST_NAMES  = ['Blake', 'Nair', 'Okafor', 'Reyes', 'Whitfield', 'Novak', 'Bergman', 'Kaur', 'Sato', 'Delgado', 'Osei', 'Petrova', 'Lindqvist', 'Marsh', 'Achebe', 'Ferreira']
const JOB_TITLES   = ['VP of Operations', 'Head of Growth', 'Director of IT', 'Procurement Manager', 'COO', 'Director of Marketing', 'VP of Sales', 'Facilities Manager']

function pick<T>(arr: readonly T[], seed: number): T {
  return arr[seed % arr.length]
}

function fakePerson(seed: number) {
  const firstName = pick(FIRST_NAMES, seed)
  const lastName  = pick(LAST_NAMES, seed * 7 + 3)
  return { firstName, lastName }
}

interface FakeCompany { name: string; domain: string; industry: string }

const TENANT_DEFS = [
  {
    slug:   'demo-acme-outreach',
    name:   'Acme Outreach',
    clients: [
      { name: 'BrightPeak Labs',       domain: 'brightpeaklabs.example',       industry: 'SaaS' },
      { name: 'Cobalt Ridge Mfg',      domain: 'cobaltridgemfg.example',       industry: 'Manufacturing' },
    ] as FakeCompany[],
    reps: [
      { firstName: 'Devon',  lastName: 'Marsh',    role: 'manager' as const },
      { firstName: 'Aliyah', lastName: 'Ferreira',  role: 'sdr' as const },
      { firstName: 'Ben',    lastName: 'Novak',     role: 'sdr' as const },
    ],
  },
  {
    slug:   'demo-nova-sales',
    name:   'Nova Sales',
    clients: [
      { name: 'Fernbridge Logistics',  domain: 'fernbridgelogistics.example',  industry: 'Logistics' },
      { name: 'Lumen Health Partners', domain: 'lumenhealthpartners.example',  industry: 'Healthcare' },
    ] as FakeCompany[],
    reps: [
      { firstName: 'Yuki',   lastName: 'Sato',     role: 'manager' as const },
      { firstName: 'Marcus', lastName: 'Delgado',  role: 'sdr' as const },
      { firstName: 'Ines',   lastName: 'Petrova',  role: 'sdr' as const },
    ],
  },
]

// One status per seeded contact, in a fixed rotation so every tenant/campaign
// gets a realistic mix instead of all-prospect.
const STATUS_ROTATION: ContactStatus[] = [
  'prospect', 'prospect', 'prospect', 'lead',
  'meeting_booked', 'prospect', 'call_back', 'prospect',
  'future', 'prospect', 'dnc', 'lead',
]

const OUTCOME_FOR_STATUS: Partial<Record<ContactStatus, CallOutcome>> = {
  lead:           'lead',
  meeting_booked: 'meeting_booked',
  call_back:      'call_back_later',
  dnc:            'disqualified',
  future:         'no_answer',
}

export async function resetAndSeedDemoTenants(db: DbClient): Promise<void> {
  const DEMO_CLERK_USER_ID = process.env.DEMO_USER_CLERK_ID ?? null
  if (!DEMO_CLERK_USER_ID) {
    console.log('⚠  DEMO_USER_CLERK_ID is not set — seeding tenant data without a shared demo login.')
    console.log('   Create one Clerk user for the "View Demo" button, then set DEMO_USER_CLERK_ID.')
  }

  async function upsertTenant(slug: string, name: string) {
    const tenant = await db.tenant.upsert({
      where:  { slug },
      create: { slug, name },
      update: { name },
    })
    await db.tenantSettings.upsert({
      where:  { tenantId: tenant.id },
      create: { tenantId: tenant.id },
      update: {},
    })
    return tenant
  }

  async function upsertUser(tenantId: string, clerkId: string, email: string, name: string, role: 'admin' | 'manager' | 'sdr') {
    return db.user.upsert({
      where:  { tenantId_clerkId: { tenantId, clerkId } },
      create: { tenantId, clerkId, email, name, role },
      update: { email, name, role },
    })
  }

  // Wipes everything under a tenant *except* Tenant/TenantSettings/User rows,
  // in FK-safe (children-first) order, then the caller rebuilds it fresh.
  async function resetTenantContent(tenantId: string) {
    await db.pipelineDeal.deleteMany({ where: { tenantId } })
    await db.pendingPipelineDeal.deleteMany({ where: { tenantId } })
    await db.task.deleteMany({ where: { tenantId } })
    await db.contactNote.deleteMany({ where: { tenantId } })
    await db.callRecord.deleteMany({ where: { tenantId } })
    await db.session.deleteMany({ where: { tenantId } })
    await db.scriptVersion.deleteMany({ where: { script: { tenantId } } })
    await db.script.deleteMany({ where: { tenantId } })
    await db.campaignSDR.deleteMany({ where: { campaign: { tenantId } } })
    await db.contact.deleteMany({ where: { tenantId } })
    await db.pipelineStage.deleteMany({ where: { tenantId } })
    await db.campaign.deleteMany({ where: { tenantId } })
    await db.client.deleteMany({ where: { tenantId } })
    await db.companySummary.deleteMany({ where: { tenantId } })
  }

  async function seedTenant(def: typeof TENANT_DEFS[number]) {
    const tenant = await upsertTenant(def.slug, def.name)
    console.log(`\n=== ${def.name} (${tenant.id}) ===`)

    // --- Identity layer: stable across resets ---
    const repUsers: Awaited<ReturnType<typeof upsertUser>>[] = []
    for (const rep of def.reps) {
      const placeholderClerkId = `demo_clerk_${def.slug}_${rep.firstName.toLowerCase()}`
      const email = `${rep.firstName.toLowerCase()}.${rep.lastName.toLowerCase()}@${def.slug}.demo`
      repUsers.push(await upsertUser(tenant.id, placeholderClerkId, email, `${rep.firstName} ${rep.lastName}`, rep.role))
    }

    let demoLoginUser = null
    if (DEMO_CLERK_USER_ID) {
      demoLoginUser = await upsertUser(tenant.id, DEMO_CLERK_USER_ID, `demo@${def.slug}.demo`, 'Demo Admin', 'admin')
    }
    const assignees = demoLoginUser ? [demoLoginUser, ...repUsers] : repUsers

    // --- Content layer: wiped and rebuilt every run ---
    await resetTenantContent(tenant.id)

    let contactSeed = 0
    let taskCount = 0

    for (const company of def.clients) {
      const client = await db.client.create({
        data: {
          tenantId:    tenant.id,
          name:        company.name,
          website:     `https://${company.domain}`,
          contactName: `${fakePerson(contactSeed).firstName} ${fakePerson(contactSeed).lastName}`,
          email:       `hello@${company.domain}`,
          phone:       fakePhone(),
        },
      })

      const stages = await Promise.all(
        DEFAULT_STAGES.map(s =>
          db.pipelineStage.create({ data: { ...s, tenantId: tenant.id, clientId: client.id } })
        )
      )

      const campaign = await db.campaign.create({
        data: {
          tenantId:         tenant.id,
          clientId:         client.id,
          name:             `${company.name} — Outbound Q3`,
          status:           'active',
          dailyTargetCalls: 40,
        },
      })

      const sdrUserIds = def.reps
        .map((rep, i) => ({ rep, user: repUsers[i] }))
        .filter(({ rep }) => rep.role === 'sdr')
        .map(({ user }) => user.id)
      await db.campaignSDR.createMany({
        data: sdrUserIds.map(userId => ({ campaignId: campaign.id, userId })),
      })

      const script = await db.script.create({ data: { tenantId: tenant.id, campaignId: campaign.id, title: `${company.name} — Cold Open` } })
      await db.scriptVersion.create({
        data: {
          scriptId: script.id,
          version:  1,
          content:  `Hi {{firstName}}, this is {{repName}} calling on behalf of a partner working with companies like ${company.name}. Do you have 30 seconds?`,
        },
      })

      // --- Contacts + call history + deals ---
      for (let i = 0; i < STATUS_ROTATION.length; i++) {
        contactSeed += 1
        const { firstName, lastName } = fakePerson(contactSeed)
        const status = STATUS_ROTATION[i]
        const mobilePhone = fakePhone()
        const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${company.domain}`
        const owner = assignees[contactSeed % assignees.length]

        const contact = await db.contact.create({
          data: {
            tenantId:       tenant.id,
            campaignId:     campaign.id,
            accountOwnerId: owner.id,
            firstName,
            lastName,
            email,
            mobilePhone,
            mobilePhoneDigits: normalizePhoneDigits(mobilePhone),
            companyName:    company.name,
            jobTitle:       pick(JOB_TITLES, contactSeed),
            industry:       company.industry,
            website:        `https://${company.domain}`,
            status,
            dncReason:      status === 'dnc' ? 'Disqualified — company-wide' : null,
            dialAttempts:   status === 'future' ? 8 : status === 'prospect' ? 0 : 1 + (contactSeed % 3),
            dedupeHash:     computeDedupeHash(email, mobilePhone),
          },
        })

        if (status !== 'prospect') {
          const outcome = OUTCOME_FOR_STATUS[status] ?? 'connected'
          const conversationTagged = status !== 'future'
          await db.callRecord.create({
            data: {
              tenantId:   tenant.id,
              campaignId: campaign.id,
              contactId:  contact.id,
              userId:     owner.id,
              outcome,
              notes: status === 'meeting_booked'
                ? 'Booked a 30-min intro call for next week — very engaged, asked about pricing tiers.'
                : status === 'lead'
                  ? 'Interested, wants a follow-up next quarter once budget resets.'
                  : status === 'call_back'
                    ? 'Asked to call back Thursday afternoon.'
                    : status === 'dnc'
                      ? 'Not a fit, requested no further contact.'
                      : null,
              conversationTagged,
              mbLeadStatus: status === 'meeting_booked' ? 'first_conversation' : null,
            },
          })

          if (status === 'meeting_booked') {
            const stage = stages[Math.min(2, stages.length - 1)] // "Demo Scheduled"
            await db.pipelineDeal.create({
              data: {
                tenantId:   tenant.id,
                clientId:   client.id,
                stageId:    stage.id,
                contactId:  contact.id,
                campaignId: campaign.id,
                title:      `${firstName} ${lastName} — ${company.name}`,
                value:      5000 + (contactSeed % 5) * 1500,
                source:     'auto',
              },
            })
          }
        }

        if (taskCount < 4 && (status === 'lead' || status === 'call_back')) {
          taskCount += 1
          await db.task.create({
            data: {
              tenantId:   tenant.id,
              assigneeId: owner.id,
              contactId:  contact.id,
              campaignId: campaign.id,
              title:      status === 'call_back' ? `Call back ${firstName} ${lastName}` : `Follow up with ${firstName} ${lastName}`,
              color:      '#f59e0b',
              status:     'pending',
            },
          })
        }
      }
    }

    console.log(`Seeded ${def.clients.length} clients, reps: ${repUsers.map(u => u.name).join(', ')}${demoLoginUser ? ` + shared demo login (${demoLoginUser.id})` : ' (no DEMO_USER_CLERK_ID set — demo login not provisioned)'}`)
  }

  for (const def of TENANT_DEFS) {
    await seedTenant(def)
  }
  console.log('\nDone. Demo tenants are ready.')
}
