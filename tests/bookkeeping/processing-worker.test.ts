import { describe, expect, it, vi } from 'vitest'
import { drainBookkeepingProcessingJobs } from '../../app/lib/bookkeeping/processing'

function fakeAdmin() {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args })
    if (name === 'claim_bookkeeping_processing_jobs') return { data: [{
      id: 'job-1', business_id: 'business-1', bookkeeping_record_id: 'record-1',
    }], error: null }
    if (name === 'complete_bookkeeping_processing_job') return { data: true, error: null }
    return { data: null, error: null }
  })
  const from = vi.fn((table: string) => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => table === 'bookkeeping_records'
          ? { maybeSingle: vi.fn(async () => ({ data: {
            id: 'record-1', business_id: 'business-1', source_kind: 'financial_transaction',
          }, error: null })) }
          : Promise.resolve({ data: [{
            id: 'decision-1', supersedes_decision_id: null, treatment: 'unresolved',
          }], error: null })),
      })),
    })),
  }))
  return { admin: { rpc, from }, calls }
}

describe('Phase 1A bookkeeping processor', () => {
  it('inspects current tenant-scoped state and completes without a decision write', async () => {
    const { admin, calls } = fakeAdmin()
    const processor = vi.fn(async () => ({ outcome: 'unresolved' }))
    const result = await drainBookkeepingProcessingJobs({
      batchSize: 100,
      admin: admin as never,
      processor,
    })
    expect(result).toEqual({ claimed: 1, completed: 1, retried: 0 })
    expect(calls.map(({ name }) => name)).toEqual([
      'claim_bookkeeping_processing_jobs',
      'complete_bookkeeping_processing_job',
    ])
    expect(calls[0].args.p_limit).toBe(25)
    expect(processor).toHaveBeenCalledWith(admin, expect.objectContaining({
      business_id: 'business-1', bookkeeping_record_id: 'record-1',
    }))
    expect(JSON.stringify(calls)).not.toMatch(/decision|allocation|question|tax_treatment/i)
  })

  it('is safe when no work is available', async () => {
    const { admin } = fakeAdmin()
    admin.rpc.mockResolvedValueOnce({ data: [], error: null })
    await expect(drainBookkeepingProcessingJobs({
      admin: admin as never,
      processor: vi.fn(),
    }))
      .resolves.toEqual({ claimed: 0, completed: 0, retried: 0 })
  })
})
