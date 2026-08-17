import { describe, expect, it } from 'vitest'
import {
  validateDocumentationIssueIdentity,
  validateReceiptLostAnswer,
} from '../../app/lib/bookkeeping/documentation-validation'

describe('canonical documentation validation', () => {
  it('accepts only the initial missing-documentation reason', () => {
    expect(validateDocumentationIssueIdentity({
      reason: 'MISSING_SUPPORTING_DOCUMENTATION',
      issueKey: '  missing-receipt:v1  ',
      contextFingerprint: '  context:v1  ',
    })).toEqual({
      reason: 'MISSING_SUPPORTING_DOCUMENTATION',
      issueKey: 'missing-receipt:v1',
      contextFingerprint: 'context:v1',
    })
    expect(() => validateDocumentationIssueIdentity({
      reason: 'IRS_COMPLIANCE_SCORE', issueKey: 'risk',
      contextFingerprint: 'risk',
    })).toThrow(/not supported/)
  })

  it('accepts only the exact factual Receipt Lost assertion', () => {
    expect(validateReceiptLostAnswer({
      schemaVersion: 1, assertion: 'receipt_lost',
    })).toEqual({ schemaVersion: 1, assertion: 'receipt_lost' })
    for (const field of [
      'note', 'category', 'treatment', 'allocation', 'riskLevel',
      'documentationSufficiency', 'approval', 'receipt_waived',
      'evidenceId', 'provenance', 'actorUserId', 'businessId', 'decision',
    ]) {
      expect(() => validateReceiptLostAnswer({
        schemaVersion: 1, assertion: 'receipt_lost', [field]: 'forbidden',
      })).toThrow(/Only schemaVersion/)
    }
  })
})
