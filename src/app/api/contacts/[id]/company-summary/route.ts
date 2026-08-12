import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db, withTenant } from '@/lib/db'
import { hasPermission, getClerkMeta } from '@/lib/auth'
import { geminiService } from '@/lib/ai/gemini'

export const maxDuration = 15

function normalizeDomain(url: string): string {
  try {
    const href = url.startsWith('http') ? url : `https://${url}`
    return new URL(href).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return url.toLowerCase()
      .replace(/^(?:https?:\/\/)?(?:www\.)?/i, '')
      .split('/')[0]
      .split('?')[0]
  }
}

async function extractText(html: string): Promise<string> {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 3000)
}

async function runGeneration(domain: string, tenantId: string, companyName: string | null) {
  try {
    let html: string
    const res = await fetch(`https://${domain}`, {
      signal:  AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadForceBot/1.0)' },
    })
    html = await res.text()

    const text    = await extractText(html)
    const summary = await geminiService.summarizeCompany(text, companyName ?? undefined)
    await db.companySummary.update({
      where: { tenantId_websiteDomain: { tenantId, websiteDomain: domain } },
      data:  { summary, status: 'ready', generatedAt: new Date() },
    })
  } catch (err) {
    console.error('[company-summary] generation failed:', err)
    try {
      await db.companySummary.update({
        where: { tenantId_websiteDomain: { tenantId, websiteDomain: domain } },
        data:  { status: 'failed' },
      })
    } catch (updateErr) {
      console.error('[company-summary] failed to mark as failed:', updateErr)
    }
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (!hasPermission(role, 'calls:write') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id: contactId } = await params

    const contact = await withTenant(tenantId, () =>
      db.contact.findUnique({
        where:  { id: contactId },
        select: { website: true, companyName: true },
      })
    )
    if (!contact) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (!contact.website) {
      return NextResponse.json({ data: { status: 'unavailable' } })
    }

    const domain = normalizeDomain(contact.website)

    const existing = await db.companySummary.findUnique({
      where: { tenantId_websiteDomain: { tenantId, websiteDomain: domain } },
    })

    if (existing?.status === 'ready') {
      return NextResponse.json({ data: { status: 'ready', summary: existing.summary } })
    }
    if (existing?.status === 'failed') {
      return NextResponse.json({ data: { status: 'failed' } })
    }
    if (existing?.status === 'generating') {
      // Another concurrent request is generating — tell client to poll
      return NextResponse.json({ data: { status: 'generating' } })
    }

    // No record yet (or pending) — upsert to generating and generate synchronously
    await db.companySummary.upsert({
      where:  { tenantId_websiteDomain: { tenantId, websiteDomain: domain } },
      create: { tenantId, websiteDomain: domain, status: 'generating' },
      update: { status: 'generating' },
    })

    await runGeneration(domain, tenantId, contact.companyName)

    const result = await db.companySummary.findUnique({
      where: { tenantId_websiteDomain: { tenantId, websiteDomain: domain } },
    })

    return NextResponse.json({
      data: {
        status:  result?.status ?? 'failed',
        summary: result?.summary ?? null,
      },
    })
  } catch (err) {
    console.error('[company-summary] GET error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
