import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { AsyncLocalStorage } from 'async_hooks'

declare global {
  var __prisma: ReturnType<typeof createPrismaClient> | undefined
}

const TENANT_MODELS = new Set(['User', 'Client', 'Campaign', 'Contact', 'CallRecord', 'Session', 'Script', 'ContactNote', 'PipelineStage', 'PipelineDeal', 'Task'])
const SOFT_DELETE_MODELS = new Set(['Contact', 'ContactNote', 'Script', 'Task'])

// Exported so tests can assert that context propagates correctly through
// withTenant() without reimplementing the AsyncLocalStorage logic.
export const tenantStore = new AsyncLocalStorage<{ tenantId: string }>()

function createPrismaClient() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  })
  const adapter = new PrismaPg(pool)

  const baseClient = new PrismaClient({ adapter })

  return baseClient.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const ctx = tenantStore.getStore()
          if (!ctx || !TENANT_MODELS.has(model ?? '')) {
            return query(args)
          }
          const { tenantId } = ctx

          if (
            operation === 'findMany' ||
            operation === 'findFirst' ||
            operation === 'findFirstOrThrow'
          ) {
            const typedArgs = args as { where?: Record<string, unknown> }
            typedArgs.where = {
              ...typedArgs.where,
              tenantId,
              ...(SOFT_DELETE_MODELS.has(model ?? '') ? { deletedAt: null } : {}),
            }
          }

          if (
            operation === 'findUnique' ||
            operation === 'findUniqueOrThrow'
          ) {
            const typedArgs = args as { where?: Record<string, unknown> }
            typedArgs.where = { ...typedArgs.where, tenantId }
          }

          if (operation === 'create') {
            const typedArgs = args as { data?: Record<string, unknown> }
            typedArgs.data = { ...typedArgs.data, tenantId }
          }

          if (operation === 'createMany') {
            const typedArgs = args as { data?: Record<string, unknown> | Record<string, unknown>[] }
            if (Array.isArray(typedArgs.data)) {
              typedArgs.data = typedArgs.data.map((d) => ({ ...d, tenantId }))
            } else {
              typedArgs.data = { ...typedArgs.data, tenantId }
            }
          }

          if (operation === 'update' || operation === 'updateMany') {
            const typedArgs = args as { where?: Record<string, unknown> }
            typedArgs.where = { ...typedArgs.where, tenantId }
          }

          if (operation === 'delete' || operation === 'deleteMany') {
            const typedArgs = args as { where?: Record<string, unknown> }
            typedArgs.where = { ...typedArgs.where, tenantId }
          }

          return query(args)
        },
      },
    },
  })
}

export const db = global.__prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = db
}

export function withTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  // Prisma's extended query methods (db.contact.findUnique(...) etc.) return
  // a lazy thenable that doesn't actually run — and doesn't invoke the
  // $allOperations extension above — until something calls .then() on it.
  // tenantStore.run() only keeps its AsyncLocalStorage context active for the
  // synchronous extent of fn(); if fn just returns that lazy thenable without
  // awaiting it, the real query executes after the context has already been
  // torn down and tenantStore.getStore() reads undefined inside the
  // extension. Awaiting fn() here — regardless of whether the caller's fn is
  // itself async — forces the thenable's .then() to be invoked synchronously
  // within tenantStore.run()'s callback, so the AsyncLocalStorage context is
  // captured correctly no matter how the call site is written.
  return tenantStore.run({ tenantId }, async () => await fn())
}
