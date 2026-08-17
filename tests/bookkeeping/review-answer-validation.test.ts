import { describe, expect, it } from 'vitest'
import { validateBusinessPurposeAnswer } from '../../app/lib/bookkeeping/review-answer-validation'

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
