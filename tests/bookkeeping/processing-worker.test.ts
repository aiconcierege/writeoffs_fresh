import { describe, expect, it, vi } from 'vitest'
import { drainBookkeepingProcessingJobs, safeBookkeepingProcessingDiagnostic } from '../../app/lib/bookkeeping/processing'

function fakeAdmin() {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args })
    if (name === 'claim_bookkeeping_processing_jobs') return calls.filter((call) =>
      call.name === 'claim_bookkeeping_processing_jobs').length === 1 ? { data: [{
      id: 'job-1', business_id: 'business-1', bookkeeping_record_id: 'record-1',
    }], error: null } : { data: [], error: null }
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
      'claim_bookkeeping_processing_jobs',
    ])
    expect(calls[0].args.p_limit).toBe(1)
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

  it('claims each job only when it is ready to process it', async () => {
    const { admin, calls } = fakeAdmin()
    let claim = 0
    admin.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args })
      if (name === 'claim_bookkeeping_processing_jobs') {
        claim += 1
        return claim <= 2 ? { data: [{ id: `job-${claim}`, business_id: 'business-1',
          bookkeeping_record_id: `record-${claim}` }], error: null } : { data: [], error: null }
      }
      if (name === 'complete_bookkeeping_processing_job') return { data: true, error: null }
      return { data: null, error: null }
    })
    const processor = vi.fn(async () => undefined)
    await expect(drainBookkeepingProcessingJobs({ batchSize: 25, admin: admin as never, processor }))
      .resolves.toEqual({ claimed: 2, completed: 2, retried: 0 })
    expect(calls.map(({ name }) => name)).toEqual([
      'claim_bookkeeping_processing_jobs', 'complete_bookkeeping_processing_job',
      'claim_bookkeeping_processing_jobs', 'complete_bookkeeping_processing_job',
      'claim_bookkeeping_processing_jobs',
    ])
    expect(calls.filter(({ name }) => name === 'claim_bookkeeping_processing_jobs')
      .every(({ args }) => args.p_limit === 1)).toBe(true)
  })

  it('records a safe useful diagnostic without persisting the raw error', async () => {
    const { admin, calls } = fakeAdmin()
    const processor = vi.fn(async () => {
      throw new Error('Tax-treatment conclusion key was reused with different content.')
    })
    await expect(drainBookkeepingProcessingJobs({ admin: admin as never, processor }))
      .resolves.toEqual({ claimed: 1, completed: 0, retried: 1 })
    const retry = calls.find(({ name }) => name === 'retry_bookkeeping_processing_job_diagnostic')
    expect(retry?.args).toMatchObject({
      p_error_code: 'TAX_TREATMENT_IDEMPOTENCY_CONFLICT',
      p_error_stage: 'bookkeeping_evaluation',
      p_diagnostic_code: 'TAX_TREATMENT_IDEMPOTENCY_CONFLICT',
    })
    expect(retry?.args.p_error_fingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(retry)).not.toContain('reused with different content')
  })

  it('maps unknown failures to a stable safe diagnostic', () => {
    expect(safeBookkeepingProcessingDiagnostic(new Error('customer merchant secret'))).toEqual({
      code: 'BOOKKEEPING_EVALUATION_ERROR',
      fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
  })
})
