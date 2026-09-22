import {beforeEach,describe,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({admin:vi.fn(),publish:vi.fn()}))
vi.mock('../../utils/supabase/admin',()=>({createServerAdminSupabase:mocks.admin}))
vi.mock('../../app/lib/account-lifecycle/independent-ledger',()=>({publishPermanentDeletion:mocks.publish}))
vi.mock('../../app/lib/plaid/client',()=>({createPlaidGateway:()=>({})}))
vi.mock('../../app/lib/account-lifecycle/notifications',()=>({enqueueLifecycleNotice:async()=>{},recordLifecycleNotificationPreparationFailure:async()=>{}}))
import {drainAccountDeletionQueue} from '../../app/lib/account-lifecycle/deletion'

const request={id:'11111111-1111-4111-8111-111111111111',business_id:'22222222-2222-4222-8222-222222222222',owner_user_id:'33333333-3333-4333-8333-333333333333',reason:'customer_request',started_at:'2026-09-21T12:00:00.000Z'}
function fixture(){
 const events:string[]=[]
 const table={select:()=>table,eq:()=>table,neq:()=>table,update:()=>table,maybeSingle:async()=>({data:{}}),then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:[]}).then(resolve)}
 const rpc=vi.fn(async(name:string)=>{events.push(name);return {data:name==='claim_due_account_deletions'?[request]:true,error:null}})
 mocks.admin.mockReturnValue({from:()=>table,rpc,auth:{admin:{getUserById:async()=>({data:{user:{email:'synthetic@example.test'}}}),deleteUser:async()=>{events.push('auth-delete');return {error:null}}}},storage:{from:()=>({list:async()=>{events.push('storage-list');return {data:[],error:null}},remove:async()=>({error:null})})}})
 mocks.publish.mockImplementation(async()=>{events.push('independent-ledger');return {versionId:'verified-version'}})
 return {events,rpc}
}
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('ACCOUNT_DELETION_HMAC_KEY','synthetic-key-for-local-test-only-123456789')})
describe('permanent deletion independent-ledger boundary',()=>{
 it('cannot remove files, application data or Auth when durable publication fails',async()=>{
  const {events,rpc}=fixture()
  mocks.publish.mockRejectedValue(new Error('INDEPENDENT_DELETION_WRITE_FAILED'))
  expect(await drainAccountDeletionQueue()).toEqual([{id:request.id,status:'retryable',code:'INDEPENDENT_DELETION_WRITE_FAILED'}])
  expect(events).not.toContain('storage-list')
  expect(events).not.toContain('delete_customer_application_data')
  expect(events).not.toContain('auth-delete')
  expect(events).not.toContain('complete_account_deletion')
  expect(rpc).toHaveBeenCalledWith('record_account_deletion_failure',expect.objectContaining({p_request_id:request.id}))
 })
 it('publishes before cleanup and uses a stable minimized entry on retry',async()=>{
  const {events}=fixture()
  expect(await drainAccountDeletionQueue()).toEqual([{id:request.id,status:'completed'}])
  expect(events.indexOf('independent-ledger')).toBeLessThan(events.indexOf('storage-list'))
  expect(events.indexOf('independent-ledger')).toBeLessThan(events.indexOf('delete_customer_application_data'))
  const entry=mocks.publish.mock.calls[0][0]
  expect(Object.keys(entry).sort()).toEqual(['deletion_request_id','business_identity_hash','user_identity_hash','reason','effective_at'].sort())
  expect(entry.effective_at).toBe(request.started_at)
  expect(entry.business_identity_hash).toMatch(/^[a-f0-9]{64}$/)
  await drainAccountDeletionQueue()
  expect(mocks.publish.mock.calls[1][0]).toEqual(entry)
 })
})
