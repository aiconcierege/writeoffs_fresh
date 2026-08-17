import { describe, expect, it } from 'vitest'
import { validateConflictingEvidenceAnswer } from '../../app/lib/bookkeeping/review-answer-validation'

describe('conflicting-evidence customer answer validation', () => {
  it('accepts only a factual option id', () => {
    expect(validateConflictingEvidenceAnswer({ schemaVersion: 1, optionId: 'bank_is_right' }))
      .toEqual({ schemaVersion: 1, optionId: 'bank_is_right' })
    for (const forbidden of ['bookkeepingNature', 'category', 'treatment', 'allocations',
      'confidence', 'approval', 'provenance', 'outcome', 'evidenceRefs']) {
      expect(() => validateConflictingEvidenceAnswer({
        schemaVersion: 1, optionId: 'bank_is_right', [forbidden]: 'forbidden',
      })).toThrow(/Only schemaVersion and optionId/)
    }
  })

  it('trims the configured fallback explanation and rejects malformed fallback', () => {
    expect(validateConflictingEvidenceAnswer({
      schemaVersion: 1, optionId: 'none_of_these',
      factualExplanation: '  These were two separate purchases.  ',
    })).toEqual({
      schemaVersion: 1, optionId: 'none_of_these',
      factualExplanation: 'These were two separate purchases.',
    })
    expect(() => validateConflictingEvidenceAnswer({
      schemaVersion: 1, optionId: 'none_of_these', factualExplanation: '   ',
    })).toThrow(/between 1 and 1,000/)
    expect(() => validateConflictingEvidenceAnswer({
      schemaVersion: 1, optionId: 'none_of_these', factualExplanation: 'x', approval: true,
    })).toThrow(/fallback accepts only/)
  })
})
