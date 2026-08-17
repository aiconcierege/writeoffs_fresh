import { describe, expect, it } from 'vitest'
import {
  validateBusinessPurposeAnswer,
  validateBusinessUseAnswer,
  validateMixedUseAmountAnswer,
  validateTransactionTypeAnswer,
} from '../../app/lib/bookkeeping/review-answer-validation'

describe('business-purpose review answer validation', () => {
  it('accepts and trims only the factual answer contract', () => {
    expect(validateBusinessPurposeAnswer({
      schemaVersion: 1,
      businessPurpose: '  Lunch with a prospective client  ',
    })).toEqual({
      schemaVersion: 1,
      businessPurpose: 'Lunch with a prospective client',
    })
  })

  it('rejects empty and over-limit purposes', () => {
    expect(() => validateBusinessPurposeAnswer({
      schemaVersion: 1, businessPurpose: '   ',
    })).toThrow('required')
    expect(() => validateBusinessPurposeAnswer({
      schemaVersion: 1, businessPurpose: 'x'.repeat(1001),
    })).toThrow('1,000')
  })

  it.each([
    ['category', { category: 'Meals' }],
    ['category_key', { category_key: 'meals' }],
    ['approval', { approval: true }],
    ['approved', { approved: true }],
    ['confidence', { confidence: 1 }],
    ['treatment', { treatment: 'business' }],
    ['allocations', { allocations: [] }],
    ['nature', { bookkeepingNature: 'expense' }],
    ['decision template', { decision: { treatment: 'business' } }],
  ])('rejects caller-supplied %s fields', (_label, extra) => {
    expect(() => validateBusinessPurposeAnswer({
      schemaVersion: 1,
      businessPurpose: 'Client meeting',
      ...extra,
    })).toThrow('Only schemaVersion and businessPurpose')
  })
})

describe('business-use review answer validation', () => {
  it.each(['business', 'personal', 'mixed'] as const)(
    'accepts only the factual %s answer',
    (use) => {
      expect(validateBusinessUseAnswer({ schemaVersion: 1, use })).toEqual({
        schemaVersion: 1,
        use,
      })
    }
  )

  it.each([
    ['category', { category: 'Meals' }],
    ['category key', { category_key: 'meals' }],
    ['approval', { approval: true }],
    ['accounting treatment', { treatment: 'business' }],
    ['allocations', { allocations: [] }],
    ['percentage', { percentage: 50 }],
    ['confidence', { confidence: 1 }],
    ['nature', { bookkeepingNature: 'expense' }],
    ['decision template', { decision: { treatment: 'business' } }],
  ])('rejects caller-supplied %s', (_label, extra) => {
    expect(() => validateBusinessUseAnswer({
      schemaVersion: 1,
      use: 'business',
      ...extra,
    })).toThrow('Only schemaVersion and use')
  })

  it('rejects unsupported choices', () => {
    expect(() => validateBusinessUseAnswer({
      schemaVersion: 1,
      use: 'approved',
    })).toThrow('business, personal, or mixed')
  })
})

describe('mixed-use dollar answer validation', () => {
  it('accepts a positive safe whole-number cent amount', () => {
    expect(validateMixedUseAmountAnswer({
      schemaVersion: 1,
      businessAmountCents: 12000,
    })).toEqual({ schemaVersion: 1, businessAmountCents: 12000 })
  })

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid amount %s',
    (businessAmountCents) => {
      expect(() => validateMixedUseAmountAnswer({
        schemaVersion: 1,
        businessAmountCents,
      })).toThrow('positive whole number of cents')
    }
  )

  it.each([
    ['percentage', { percentage: 50 }],
    ['allocation kinds', { allocationKind: 'business' }],
    ['personal amount', { personalAmountCents: 6600 }],
    ['category', { category: 'Supplies' }],
    ['treatment', { treatment: 'mixed_use' }],
    ['nature', { bookkeepingNature: 'expense' }],
    ['confidence', { confidence: 1 }],
    ['approval', { approval: true }],
    ['decision template', { decision: {} }],
  ])('rejects caller-supplied %s', (_label, extra) => {
    expect(() => validateMixedUseAmountAnswer({
      schemaVersion: 1,
      businessAmountCents: 12000,
      ...extra,
    })).toThrow('Only schemaVersion and businessAmountCents')
  })
})

describe('transaction-type factual answer validation', () => {
  it.each([
    'purchase', 'earned_money', 'moved_money', 'paid_card',
    'received_refund', 'added_own_money', 'borrowed_money',
  ] as const)('accepts the semantic %s activity', (activity) => {
    expect(validateTransactionTypeAnswer({ schemaVersion: 1, activity })).toEqual({
      schemaVersion: 1,
      activity,
    })
  })

  it('trims factual details for other', () => {
    expect(validateTransactionTypeAnswer({
      schemaVersion: 1,
      activity: 'other',
      details: '  Insurance proceeds from a damaged laptop  ',
    })).toEqual({
      schemaVersion: 1,
      activity: 'other',
      details: 'Insurance proceeds from a damaged laptop',
    })
  })

  it('requires meaningful, bounded details for other', () => {
    expect(() => validateTransactionTypeAnswer({
      schemaVersion: 1, activity: 'other', details: '   ',
    })).toThrow('required')
    expect(() => validateTransactionTypeAnswer({
      schemaVersion: 1, activity: 'other', details: 'x'.repeat(1001),
    })).toThrow('1,000')
  })

  it.each([
    ['bookkeeping nature', { bookkeepingNature: 'expense' }],
    ['category', { category: 'Meals' }],
    ['category key', { category_key: 'meals' }],
    ['treatment', { treatment: 'business' }],
    ['allocations', { allocations: [] }],
    ['percentage', { percentage: 100 }],
    ['confidence', { confidence: 1 }],
    ['approval', { approval: true }],
    ['approved', { approved: true }],
    ['decision', { decision: {} }],
    ['provenance', { provenance: 'user' }],
    ['actor', { actorUserId: 'someone' }],
  ])('rejects caller-supplied %s', (_label, extra) => {
    expect(() => validateTransactionTypeAnswer({
      schemaVersion: 1,
      activity: 'purchase',
      ...extra,
    })).toThrow('Only schemaVersion and activity')
  })

  it('rejects internal nature values as semantic activities', () => {
    expect(() => validateTransactionTypeAnswer({
      schemaVersion: 1,
      activity: 'business_income',
    })).toThrow('not supported')
    expect(() => validateTransactionTypeAnswer({
      schemaVersion: 1,
      activity: 'other',
      details: 'Factual detail',
      bookkeepingNature: 'other_non_income',
    })).toThrow('factual details')
  })
})
