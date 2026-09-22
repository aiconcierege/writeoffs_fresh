import {describe,it,expect,vi} from 'vitest'
import {restoreFreshTarget,type RestoreProvider} from '../../scripts/backup/restore-controller.mjs'
const entry={deletion_request_id:'11111111-1111-4111-8111-111111111111',business_identity_hash:'a'.repeat(64),user_identity_hash:'b'.repeat(64),reason:'customer_request',effective_at:'2026-09-21T12:00:00.000Z'}
function fixture(){
 let isolated=true
 const events:string[]=[]
 const provider:RestoreProvider={
  fenceSource:async()=>({held:true}),verifySourceFence:async()=>true,
  createIsolatedTarget:async({operationId})=>({operationId,id:'fresh-target',sourceId:'source'}),
  verifyIsolation:async()=>isolated,
  restoreArtifacts:async()=>{events.push('restore')},
  reconcile:async()=>{events.push('reconcile')},
  verifyReconciliation:async()=>({application:true,authMfa:true,plaid:true,privateObjects:true,jobsAndLeases:true,survivingTenant:true}),
  verifyOtherRestoreChecks:async()=>true,
  activateVerifiedTarget:vi.fn(async()=>{events.push('activate');isolated=false;return true}),
  blockTarget:vi.fn(async()=>{events.push('block');isolated=true}),
 }
 const ledger={loadCurrent:vi.fn(async()=>[entry])}
 const audit={record:vi.fn(async(event:Record<string,unknown>)=>{events.push(String(event.state))})}
 return {provider,ledger,audit,backup:'synthetic',events}
}
describe('fresh-target restore controller — deterministic adapter contract tests',()=>{
 it('activates only after reconciliation, verification and a second independent ledger read',async()=>{
  const f=fixture();expect((await restoreFreshTarget(f)).activated).toBe(true)
  expect(f.events).toEqual(['isolated','restore','reconcile','verified','activate','activated'])
  expect(f.ledger.loadCurrent).toHaveBeenCalledTimes(2)
 })
 it('can certify eligibility without releasing any customer or worker access',async()=>{
  const f=fixture();const result=await restoreFreshTarget({...f,activationMode:'verify-only'})
  expect(result.activated).toBe(false);expect(result.activationEligible).toBe(true)
  expect(f.provider.activateVerifiedTarget).not.toHaveBeenCalled()
  expect(f.events).toEqual(['isolated','restore','reconcile','verified','eligible-not-activated'])
 })
 it.each(['application','authMfa','plaid','privateObjects','jobsAndLeases','survivingTenant'])('blocks activation when %s is not verified',async(key)=>{
  const f=fixture(),original=f.provider.verifyReconciliation
  f.provider.verifyReconciliation=async(...args)=>({...await original(...args),[key]:false})
  await expect(restoreFreshTarget(f)).rejects.toThrow('RESTORE_VERIFICATION')
  expect(f.provider.activateVerifiedTarget).not.toHaveBeenCalled()
  expect(f.provider.blockTarget).toHaveBeenCalledOnce()
 })
 it('fails closed when independent ledger access fails',async()=>{
  const f=fixture();f.ledger.loadCurrent.mockRejectedValue(new Error('LEDGER_UNAVAILABLE'))
  await expect(restoreFreshTarget(f)).rejects.toThrow('LEDGER_UNAVAILABLE')
  expect(f.provider.activateVerifiedTarget).not.toHaveBeenCalled()
 })
 it('rejects ledger changes during recovery',async()=>{
  const f=fixture();f.ledger.loadCurrent.mockResolvedValueOnce([entry]).mockResolvedValueOnce([])
  await expect(restoreFreshTarget(f)).rejects.toThrow('RESTORE_LEDGER_CHANGED')
  expect(f.provider.activateVerifiedTarget).not.toHaveBeenCalled()
 })
 it('does not accept the source as a fresh target',async()=>{
  const f=fixture();f.provider.createIsolatedTarget=async({operationId})=>({id:'source',sourceId:'source',operationId})
  await expect(restoreFreshTarget(f)).rejects.toThrow('RESTORE_TARGET_NOT_FRESH')
  expect(f.events).not.toContain('restore')
 })
 it('keeps the gate closed when durable audit fails',async()=>{
  const f=fixture();f.audit.record.mockRejectedValue(new Error('AUDIT_UNAVAILABLE'))
  await expect(restoreFreshTarget(f)).rejects.toThrow('AUDIT_UNAVAILABLE')
  expect(f.provider.activateVerifiedTarget).not.toHaveBeenCalled()
 })
 it('reblocks access if post-activation audit fails',async()=>{
  const f=fixture();f.audit.record.mockImplementation(async(e)=>{if(e.state==='activated')throw new Error('AUDIT_UNAVAILABLE')})
  await expect(restoreFreshTarget(f)).rejects.toThrow('AUDIT_UNAVAILABLE')
  expect(await f.provider.verifyIsolation({id:'fresh-target',sourceId:'source',operationId:'test'})).toBe(true)
 })
 it('cannot restore while the source publisher fence is missing',async()=>{
  const f=fixture();f.provider.verifySourceFence=async()=>false
  await expect(restoreFreshTarget(f)).rejects.toThrow('RESTORE_SOURCE_NOT_FENCED')
  expect(f.events).not.toContain('restore')
 })
})
