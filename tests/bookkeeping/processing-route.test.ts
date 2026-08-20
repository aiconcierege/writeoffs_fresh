import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const route = readFileSync(join(
  process.cwd(), 'app/api/internal/bookkeeping/process/route.ts',
), 'utf8')

describe('internal bookkeeping worker route', () => {
  it('requires a dedicated bearer secret and never accepts Business authority', () => {
    expect(route).toContain('BOOKKEEPING_WORKER_SECRET')
    expect(route).toContain("request.headers.get('authorization')")
    expect(route).toContain('timingSafeEqual')
    expect(route).not.toMatch(/business_?id|SUPABASE_SERVICE_ROLE|plaid|access.?token/i)
  })

  it('bounds work and exposes only an explicit bounded reconciliation switch', () => {
    expect(route).toContain('MAX_BOOKKEEPING_PROCESSING_BATCH')
    expect(route).toContain('body.reconcile_unresolved === true')
    expect(route).toContain('enqueueUnresolvedBookkeepingRecords({ limit: 100 })')
    expect(route).toContain('drainBookkeepingProcessingJobs({ batchSize })')
  })
})
