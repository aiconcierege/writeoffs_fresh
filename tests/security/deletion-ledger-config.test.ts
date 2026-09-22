import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({publish:vi.fn(),destroy:vi.fn(),client:vi.fn()}))
vi.mock('@aws-sdk/client-s3',()=>({S3Client:class {constructor(config:unknown){mocks.client(config)}destroy(){mocks.destroy()}}}))
vi.mock('../../scripts/backup/independent-deletion-ledger.mjs',()=>({persistIndependentDeletion:mocks.publish}))
import {publishPermanentDeletion} from '../../app/lib/account-lifecycle/independent-ledger'
const entry={deletion_request_id:'11111111-1111-4111-8111-111111111111',business_identity_hash:'a'.repeat(64),user_identity_hash:'b'.repeat(64),reason:'customer_request',effective_at:'2026-09-21T12:00:00.000Z'}
beforeEach(()=>{
 vi.clearAllMocks()
 vi.stubEnv('WRITEOFFS_DELETION_LEDGER_SOURCE','staging')
 vi.stubEnv('SUPABASE_URL','https://sgrqrrxrlglhjuetdtps.supabase.co')
 vi.stubEnv('WRITEOFFS_DELETION_LEDGER_KEY_BASE64',Buffer.alloc(32,1).toString('base64'))
 vi.stubEnv('WRITEOFFS_DELETION_LEDGER_ACCESS_KEY_ID','synthetic')
 vi.stubEnv('WRITEOFFS_DELETION_LEDGER_SECRET_ACCESS_KEY','synthetic')
})
afterEach(()=>vi.unstubAllEnvs())
describe('independent ledger runtime configuration',()=>{
 it('fails closed without credentials and never falls back to backup credentials',async()=>{
  vi.stubEnv('WRITEOFFS_DELETION_LEDGER_ACCESS_KEY_ID','')
  await expect(publishPermanentDeletion(entry)).rejects.toThrow('INDEPENDENT_LEDGER_CONFIGURATION_REQUIRED')
  expect(mocks.client).not.toHaveBeenCalled()
  expect(mocks.publish).not.toHaveBeenCalled()
 })
 it('rejects a non-staging target',async()=>{
  vi.stubEnv('SUPABASE_URL','https://different-project.supabase.co')
  await expect(publishPermanentDeletion(entry)).rejects.toThrow('INDEPENDENT_LEDGER_TARGET_MISMATCH')
  expect(mocks.publish).not.toHaveBeenCalled()
 })
 it('requires a canonical 256-bit key',async()=>{
  vi.stubEnv('WRITEOFFS_DELETION_LEDGER_KEY_BASE64','invalid')
  await expect(publishPermanentDeletion(entry)).rejects.toThrow('INDEPENDENT_LEDGER_KEY_INVALID')
  expect(mocks.publish).not.toHaveBeenCalled()
 })
 it('uses only the independent staging ledger and clears the working key after failure',async()=>{
  let key:Buffer|undefined
  mocks.publish.mockImplementation(async(options:{encryptionKey:Buffer})=>{key=options.encryptionKey;throw new Error('INDEPENDENT_DELETION_WRITE_FAILED')})
  await expect(publishPermanentDeletion(entry)).rejects.toThrow('INDEPENDENT_DELETION_WRITE_FAILED')
  expect(mocks.publish).toHaveBeenCalledWith(expect.objectContaining({source:'staging',bucket:'writeoffs-backups-264524064115-us-east-2-an',entry}))
  expect(mocks.destroy).toHaveBeenCalledOnce()
  expect(key?.equals(Buffer.alloc(32))).toBe(true)
 })
})
