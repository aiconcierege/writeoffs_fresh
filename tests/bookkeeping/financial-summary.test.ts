import { describe, expect, it } from 'vitest'
import {
  aggregateCanonicalFinancialSummary,
  type CanonicalSummaryDecision,
  type CanonicalSummaryRecord,
} from '../../app/lib/bookkeeping/financial-summary'
import { CanonicalFinancialSummaryService } from '../../app/lib/bookkeeping/financial-summary-service'
import type { CanonicalFinancialSummaryRepository } from '../../app/lib/bookkeeping/financial-summary-repository'

let sequence = 0

function decision(input: Partial<CanonicalSummaryDecision> = {}): CanonicalSummaryDecision {
  sequence += 1
  return {
    id: `decision-${sequence}`,
    supersedesDecisionId: null,
    bookkeepingNature: 'expense',
    treatment: 'business',
    allocations: [{ id: `allocation-${sequence}`, kind: 'business', amountCents: -10_000, taxCategoryKey: null }],
    ...input,
  }
}

function record(input: Partial<CanonicalSummaryRecord> = {}): CanonicalSummaryRecord {
  sequence += 1
  return {
    id: `record-${sequence}`,
    occurredOn: '2026-08-18',
    amountCents: -10_000,
    currency: 'USD',
    financialSourceAssociationId: `source-${sequence}`,
    financialTransactionId: `transaction-${sequence}`,
    decisions: [decision()],
    ...input,
  }
}

function summarize(records: CanonicalSummaryRecord[], overrides: Record<string, unknown> = {}) {
  return aggregateCanonicalFinancialSummary({
    records,
    periodStart: '2026-01-01',
    periodEnd: '2026-08-18',
    currency: 'USD',
    unresolvedCustomerQuestionCount: 0,
    ...overrides,
  })
}

describe('canonical financial summary aggregation', () => {
  it('preserves signed income including negative adjustments', () => {
    const result = summarize([
      record({ amountCents: 100_000, decisions: [decision({
        bookkeepingNature: 'business_income',
        allocations: [{ id: 'income', kind: 'business', amountCents: 100_000 }],
      })] }),
      record({ amountCents: -20_000, decisions: [decision({
        bookkeepingNature: 'business_income',
        allocations: [{ id: 'income-adjustment', kind: 'business', amountCents: -20_000 }],
      })] }),
    ])
    expect(result.businessIncomeCents).toBe(80_000)
  })

  it('nets expense outflows and positive credits without abs()', () => {
    const result = summarize([
      record(),
      record({ amountCents: 2_000, decisions: [decision({
        allocations: [{ id: 'expense-credit', kind: 'business', amountCents: 2_000 }],
      })] }),
    ])
    expect(result.businessExpensesCents).toBe(8_000)
  })

  it('calculates bookkeeping profit as income minus net expenses in exact cents', () => {
    const result = summarize([
      record({ amountCents: 100_001, decisions: [decision({
        bookkeepingNature: 'business_income',
        allocations: [{ id: 'income-exact', kind: 'business', amountCents: 100_001 }],
      })] }),
      record({ amountCents: -20_009, decisions: [decision({
        allocations: [{ id: 'expense-exact', kind: 'business', amountCents: -20_009 }],
      })] }),
    ])
    expect(result.businessProfitCents).toBe(79_992)
  })

  it('includes only the business portion of mixed-use activity', () => {
    const result = summarize([record({ decisions: [decision({
      treatment: 'mixed_use',
      allocations: [
        { id: 'mixed-business', kind: 'business', amountCents: -6_000 },
        { id: 'mixed-personal', kind: 'personal', amountCents: -4_000 },
      ],
    })] })])
    expect(result.businessExpensesCents).toBe(6_000)
    expect(result.contributors.map((item) => item.allocationId)).toEqual(['mixed-business'])
  })

  it('excludes personal, excluded, and non-counted activity natures', () => {
    const records = [
      record({ decisions: [decision({ treatment: 'personal', allocations: [
        { id: 'personal', kind: 'personal', amountCents: -10_000 },
      ] })] }),
      record({ decisions: [decision({ treatment: 'excluded', allocations: [
        { id: 'excluded', kind: 'excluded', amountCents: -10_000 },
      ] })] }),
      ...(['transfer', 'credit_card_payment', 'owner_contribution', 'loan_proceeds'] as const)
        .map((bookkeepingNature) => record({ decisions: [decision({
          bookkeepingNature,
          treatment: 'excluded',
          allocations: [{ id: bookkeepingNature, kind: 'excluded', amountCents: -10_000 }],
        })] })),
    ]
    const result = summarize(records)
    expect(result.businessIncomeCents).toBe(0)
    expect(result.businessExpensesCents).toBe(0)
    expect(result.businessProfitCents).toBe(0)
    expect(result.contributors).toEqual([])
  })

  it('excludes unresolved records and reports reliable completeness metadata', () => {
    const result = summarize([record({ amountCents: -12_345, decisions: [decision({
      bookkeepingNature: null, treatment: 'unresolved', allocations: [],
    })] })], { unresolvedCustomerQuestionCount: 2 })
    expect(result.businessExpensesCents).toBe(0)
    expect(result.completeness).toMatchObject({
      isComplete: false,
      unresolvedRecordCount: 1,
      unresolvedSignedAmountCents: -12_345,
      hasUnresolvedCustomerQuestions: true,
      unresolvedCustomerQuestionCount: 2,
    })
  })

  it('uses only the current decision leaf and never double-counts history', () => {
    const prior = decision({ allocations: [{ id: 'prior', kind: 'business', amountCents: -10_000 }] })
    const current = decision({
      supersedesDecisionId: prior.id,
      treatment: 'mixed_use',
      allocations: [
        { id: 'current', kind: 'business', amountCents: -7_000 },
        { id: 'current-personal', kind: 'personal', amountCents: -3_000 },
      ],
    })
    const result = summarize([record({ decisions: [prior, current] })])
    expect(result.businessExpensesCents).toBe(7_000)
    expect(result.contributors.map((item) => item.decisionId)).toEqual([current.id])
  })

  it('uses inclusive YTD boundaries', () => {
    const result = summarize([
      record({ occurredOn: '2026-01-01' }),
      record({ occurredOn: '2026-08-18' }),
      record({ occurredOn: '2025-12-31' }),
      record({ occurredOn: '2026-08-19' }),
    ])
    expect(result.businessExpensesCents).toBe(20_000)
  })

  it('isolates currency and marks unexpected currencies incomplete', () => {
    const result = summarize([record(), record({ currency: 'EUR' })])
    expect(result.businessExpensesCents).toBe(10_000)
    expect(result.completeness.isComplete).toBe(false)
    expect(result.completeness.unsupportedCurrencies).toEqual(['EUR'])
  })

  it('is unaffected by documentation state because evidence risk is not an arithmetic input', () => {
    const canonical = record()
    expect(summarize([canonical])).toEqual(summarize([{ ...canonical }]))
  })

  it('preserves contributor traceability through source, record, decision, and allocation', () => {
    const canonical = record()
    const result = summarize([canonical])
    expect(result.contributors[0]).toMatchObject({
      recordId: canonical.id,
      decisionId: canonical.decisions[0].id,
      allocationId: canonical.decisions[0].allocations[0].id,
      financialSourceAssociationId: canonical.financialSourceAssociationId,
      financialTransactionId: canonical.financialTransactionId,
    })
  })
})

describe('canonical financial summary service security', () => {
  it('resolves the Business from the authenticated user and scopes repository reads', async () => {
    const calls: unknown[] = []
    const repository: CanonicalFinancialSummaryRepository = {
      async findBusinessIdForUser(userId) { calls.push(['user', userId]); return 'business-a' },
      async loadRecords(input) { calls.push(['load', input]); return { records: [], undatedRecordCount: 0 } },
    }
    await new CanonicalFinancialSummaryService(repository).summarize({
      userId: 'user-a', periodStart: '2026-01-01', periodEnd: '2026-08-18',
      currency: 'USD', unresolvedCustomerQuestionCount: 0,
    })
    expect(calls).toEqual([
      ['user', 'user-a'],
      ['load', { businessId: 'business-a', periodStart: '2026-01-01', periodEnd: '2026-08-18' }],
    ])
  })

  it('rejects anonymous authority and a user without an owned Business', async () => {
    const repository: CanonicalFinancialSummaryRepository = {
      async findBusinessIdForUser() { return null },
      async loadRecords() { throw new Error('must not load') },
    }
    const service = new CanonicalFinancialSummaryService(repository)
    await expect(service.summarize({
      userId: '', periodStart: '2026-01-01', periodEnd: '2026-08-18',
      currency: 'USD', unresolvedCustomerQuestionCount: 0,
    })).rejects.toThrow(/authenticated user/i)
    await expect(service.summarize({
      userId: 'other-user', periodStart: '2026-01-01', periodEnd: '2026-08-18',
      currency: 'USD', unresolvedCustomerQuestionCount: 0,
    })).rejects.toThrow(/Business was not found/i)
  })
})
