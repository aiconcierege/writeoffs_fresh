import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { MockBookkeepingAiGateway, type BookkeepingAiGateway } from '../../app/lib/bookkeeping/ai-gateway'
import { runAiShadowEvaluation } from '../../app/lib/bookkeeping/ai-shadow'
import { loadBookkeepingEvaluationSnapshot } from '../../app/lib/bookkeeping/evaluation-snapshot'
import { provisionLocalCanonicalOwner } from '../helpers/local-canonical'

const url = process.env.LOCAL_SUPABASE_URL
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY
const enabled = process.env.RUN_LOCAL_SUPABASE_INTEGRATION === '1' && Boolean(url && anonKey && serviceKey)
const suite = enabled ? describe.sequential : describe.skip

suite('AI bookkeeping shadow audit against local PostgreSQL', () => {
  it('persists one audit result without changing any canonical accounting state', async () => {
    const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
    const owner = await provisionLocalCanonicalOwner({
      admin, url: url!, anonKey: anonKey!, label: 'ai-shadow', amounts: [-4321],
    })
    const { data: record } = await admin.from('bookkeeping_records')
      .select('id').eq('business_id', owner.businessId).single()
    const snapshot = await loadBookkeepingEvaluationSnapshot({
      admin, businessId: owner.businessId, recordId: record!.id,
    })
    const { data: decisionsBefore } = await admin.from('bookkeeping_decisions')
      .select('*').eq('business_id', owner.businessId)
    const gateway = new MockBookkeepingAiGateway({
      output: {
        outcome: 'abstain', reason: 'insufficient_evidence', evidenceReferences: [],
        support: 'insufficient_or_conflicting', conflictCodes: [],
      },
      providerRequestId: 'mock-request', inputTokens: 10, outputTokens: 5, totalTokens: 15,
    })
    const first = await runAiShadowEvaluation({ admin, snapshot, gateway })
    const second = await runAiShadowEvaluation({ admin, snapshot, gateway })
    expect(first).toMatchObject({ outcome: 'recorded', accepted: true })
    expect(second).toEqual({ outcome: 'cached' })
    expect(gateway.calls).toHaveLength(1)

    const { data: audits } = await admin.from('bookkeeping_ai_shadow_evaluations')
      .select('*').eq('business_id', owner.businessId)
    expect(audits).toHaveLength(1)
    expect(audits?.[0]).toMatchObject({
      bookkeeping_record_id: record!.id,
      provider: 'mock', model: 'mock-bookkeeping-model',
      model_outcome: 'abstain', validation_status: 'accepted', write_enabled: false,
      provider_request_id: 'mock-request',
      input_tokens: 10, output_tokens: 5, total_tokens: 15,
    })
    expect(JSON.stringify(audits)).not.toMatch(/chain.of.thought|credential|access_token/i)
    const customerRead = await owner.customer.from('bookkeeping_ai_shadow_evaluations').select('*')
    expect(customerRead.error).not.toBeNull()
    const customerInsert = await owner.customer.from('bookkeeping_ai_shadow_evaluations').insert(audits![0])
    expect(customerInsert.error).not.toBeNull()

    const { data: decisionsAfter } = await admin.from('bookkeeping_decisions')
      .select('*').eq('business_id', owner.businessId)
    const { count: allocationCount } = await admin.from('bookkeeping_allocations')
      .select('*', { count: 'exact', head: true }).eq('business_id', owner.businessId)
    const { count: questionCount } = await admin.from('bookkeeping_review_events')
      .select('*', { count: 'exact', head: true }).eq('business_id', owner.businessId)
    const { count: taxCount } = await admin.from('bookkeeping_tax_treatments')
      .select('*', { count: 'exact', head: true }).eq('business_id', owner.businessId)
    expect(decisionsAfter).toEqual(decisionsBefore)
    expect({ allocationCount, questionCount, taxCount }).toEqual({
      allocationCount: 0, questionCount: 0, taxCount: 0,
    })

    const other = await provisionLocalCanonicalOwner({
      admin, url: url!, anonKey: anonKey!, label: 'ai-shadow-other', amounts: [-999],
    })
    const crossTenant = await admin.from('bookkeeping_ai_shadow_evaluations').insert({
      ...audits![0], id: crypto.randomUUID(), business_id: other.businessId,
      correlation_id: crypto.randomUUID(),
    })
    expect(crossTenant.error).not.toBeNull()
  })

  it('persists sanitized structural diagnostics for rejected output without canonical writes', async () => {
    const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
    const owner = await provisionLocalCanonicalOwner({
      admin, url: url!, anonKey: anonKey!, label: 'ai-shadow-diagnostic', amounts: [-6543],
    })
    const { data: record } = await admin.from('bookkeeping_records')
      .select('id').eq('business_id', owner.businessId).single()
    const snapshot = await loadBookkeepingEvaluationSnapshot({
      admin, businessId: owner.businessId, recordId: record!.id,
    })
    const { data: decisionsBefore } = await admin.from('bookkeeping_decisions')
      .select('*').eq('business_id', owner.businessId)
    const gateway = new MockBookkeepingAiGateway({
      output: {
        outcome: 'abstain', reason: 'not-an-approved-reason', evidenceReferences: [],
        support: 'strong', conflictCodes: [], hiddenThought: 'must not be retained',
      },
      providerRequestId: 'mock-invalid-request', inputTokens: 8, outputTokens: 3, totalTokens: 11,
    }, 'mock-invalid-model')
    await expect(runAiShadowEvaluation({ admin, snapshot, gateway }))
      .resolves.toMatchObject({
        outcome: 'recorded', accepted: false,
        validationCodes: ['MALFORMED_STRUCTURED_OUTPUT'],
      })
    const { data: audits } = await admin.from('bookkeeping_ai_shadow_evaluations')
      .select('structured_proposal,validation_status,validation_codes')
      .eq('business_id', owner.businessId)
    expect(audits).toHaveLength(1)
    expect(audits?.[0]).toMatchObject({
      validation_status: 'rejected',
      validation_codes: ['MALFORMED_STRUCTURED_OUTPUT'],
      structured_proposal: {
        outcome: 'abstain', reason: 'invalid_model_output',
        diagnostics: expect.arrayContaining([
          { field: 'reason', issue: 'invalid_value', received: 'not-an-approved-reason' },
          { field: 'support', issue: 'invalid_value', received: 'strong' },
          { field: '$extra', issue: 'extra' },
        ]),
      },
    })
    expect(JSON.stringify(audits)).not.toContain('must not be retained')
    const { data: decisionsAfter } = await admin.from('bookkeeping_decisions')
      .select('*').eq('business_id', owner.businessId)
    const { count: allocations } = await admin.from('bookkeeping_allocations')
      .select('*', { count: 'exact', head: true }).eq('business_id', owner.businessId)
    const { count: questions } = await admin.from('bookkeeping_review_events')
      .select('*', { count: 'exact', head: true }).eq('business_id', owner.businessId)
    const { count: taxTreatments } = await admin.from('bookkeeping_tax_treatments')
      .select('*', { count: 'exact', head: true }).eq('business_id', owner.businessId)
    expect(decisionsAfter).toEqual(decisionsBefore)
    expect({ allocations, questions, taxTreatments }).toEqual({
      allocations: 0, questions: 0, taxTreatments: 0,
    })
  })

  it('records safe provider failure and leaves the evaluation retryable', async () => {
    const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
    const owner = await provisionLocalCanonicalOwner({
      admin, url: url!, anonKey: anonKey!, label: 'ai-shadow-failure', amounts: [-321],
    })
    const { data: record } = await admin.from('bookkeeping_records')
      .select('id').eq('business_id', owner.businessId).single()
    const snapshot = await loadBookkeepingEvaluationSnapshot({
      admin, businessId: owner.businessId, recordId: record!.id,
    })
    const failing: BookkeepingAiGateway = {
      provider: 'mock', model: 'failing-model',
      async evaluate() { throw new Error('AI_PROVIDER_TIMEOUT') },
    }
    await expect(runAiShadowEvaluation({ admin, snapshot, gateway: failing }))
      .rejects.toThrow('AI_PROVIDER_TIMEOUT')
    const { data: audits } = await admin.from('bookkeeping_ai_shadow_evaluations')
      .select('validation_status,provider_error_code,structured_proposal')
      .eq('business_id', owner.businessId)
    expect(audits).toEqual([{
      validation_status: 'provider_error',
      provider_error_code: 'AI_PROVIDER_TIMEOUT',
      structured_proposal: null,
    }])
  })
})
