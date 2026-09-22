import {randomBytes} from 'node:crypto'
import {describe, expect, it} from 'vitest'
import {certifyLedgerBoundaries} from '../../scripts/backup/certify-ledger-boundaries.mjs'
import {sealDeletionEntry} from '../../scripts/backup/independent-deletion-ledger.mjs'

describe('non-destructive ledger boundary probes', () => {
  const entry = {deletion_request_id: '11111111-1111-4111-8111-111111111111', business_identity_hash: 'a'.repeat(64), user_identity_hash: 'b'.repeat(64), reason: 'customer_request', effective_at: '2026-09-22T00:00:00.000Z'}
  const key = `deletion-ledger/staging/entries/${entry.deletion_request_id}.wodel`
  function fixture(overprivileged = false) {
    const encryptionKey = randomBytes(32), payload = sealDeletionEntry(entry, encryptionKey, 'staging')
    const send = (identity: string) => async (raw: unknown) => {
      const {constructor: {name}, input} = raw as {constructor: {name: string}; input: {Key?: string; Prefix?: string; IfNoneMatch?: string}}
      if (identity === 'reader' && name === 'ListObjectsV2Command' && input.Prefix === 'deletion-ledger/staging/entries/') return {IsTruncated: false, Contents: [{Key: key}]}
      if (identity === 'reader' && name === 'GetObjectCommand') return {VersionId: 'v1', Body: {transformToByteArray: async () => payload}}
      if (name === 'DeleteObjectCommand') expect(input.Key).not.toBe(key)
      if (name === 'PutObjectCommand') {
        expect(input.Key).toBe(key)
        expect(input.IfNoneMatch).toBe('*')
        if (overprivileged) throw {name: 'PreconditionFailed', $metadata: {httpStatusCode: 412}}
      }
      expect(['DeleteObjectCommand', 'ListObjectsV2Command', 'PutObjectCommand']).toContain(name)
      throw {name: 'AccessDenied', $metadata: {httpStatusCode: 403}}
    }
    return {writer: {send: send('writer')}, reader: {send: send('reader')}, encryptionKey}
  }
  it('never deletes an existing entry or changes bucket configuration', async () => {
    const report = await certifyLedgerBoundaries(fixture())
    expect(report.result).toBe('PASS')
    expect(report.checks).toHaveLength(13)
    expect(report.existingLedgerPreserved).toBe(true)
  })
  it('does not misclassify conditional conflict as IAM denial', async () => {
    await expect(certifyLedgerBoundaries(fixture(true))).rejects.toThrow('BOUNDARY_DENIAL_NOT_PROVEN')
  })
})
