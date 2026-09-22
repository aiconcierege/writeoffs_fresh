import {describe, expect, it} from 'vitest'
import {randomBytes} from 'node:crypto'
import {certifyLiveDeletionLedger} from '../../scripts/backup/certify-live-deletion-ledger.mjs'

describe('protected live ledger certification harness', () => {
  it('uses separate identities, preserves the first version, and reports no payload or credentials', async () => {
    const objects = new Map<string, Buffer>()
    const operations: string[] = []
    const send = (identity: string) => async (raw: unknown) => {
      const command = raw as {constructor: {name: string}, input: {Key: string, Body: Buffer, IfNoneMatch: string, Prefix: string, Bucket: string}}
      const {name} = command.constructor
      const input = command.input
      operations.push(`${identity}:${name}`)
      expect(input.Bucket).toBe('writeoffs-backups-264524064115-us-east-2-an')
      if (name === 'PutObjectCommand') {
        expect(identity).toBe('writer')
        expect(input.IfNoneMatch).toBe('*')
        if (objects.has(input.Key)) throw {name: 'PreconditionFailed'}
        objects.set(input.Key, Buffer.from(input.Body))
        return {VersionId: 'v1'}
      }
      if (name === 'ListObjectsV2Command') {
        expect(identity).toBe('reader')
        expect(input.Prefix).toBe('deletion-ledger/staging/entries/')
        return {IsTruncated: false, Contents: [...objects.keys()].map(Key => ({Key}))}
      }
      if (name === 'GetObjectCommand') return {VersionId: 'v1', Body: {transformToByteArray: async () => objects.get(input.Key)}}
      throw new Error('Unexpected operation')
    }
    const report = await certifyLiveDeletionLedger({writer: {send: send('writer')}, reader: {send: send('reader')}, encryptionKey: randomBytes(32)})
    expect(report.result).toBe('PASS')
    expect(objects.size).toBe(1)
    expect(operations.filter(v => v === 'writer:PutObjectCommand')).toHaveLength(3)
    expect(JSON.stringify(report)).not.toMatch(/identity_hash|deletion_request_id|ciphertext|accessKey|secretAccess/)
    expect(report.objectsDeleted).toBe(0)
  })
  it('fails rather than certifying unavailable publication', async () => {
    await expect(certifyLiveDeletionLedger({writer: {send: async () => {throw new Error('denied')}}, reader: {send: async () => {throw new Error('unexpected read')}}, encryptionKey: randomBytes(32)})).rejects.toThrow('INDEPENDENT_DELETION_WRITE_FAILED')
  })
})
