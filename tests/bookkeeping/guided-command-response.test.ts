import {it,expect,vi,beforeEach} from 'vitest'
import {guidedCommand} from '../../app/lib/bookkeeping/guided-command-response'
const state=vi.hoisted(()=>({rpc:vi.fn(),projection:vi.fn(),membership:vi.fn()}))
vi.mock('../../utils/supabase/server',()=>({createServerSupabase:async()=>({auth:{getUser:async()=>({data:{user:{id:'owner'}}}),mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:'aal2'}})}},rpc:state.rpc})}))
vi.mock('../../app/lib/membership/entitlements',()=>({loadCustomerEntitlements:state.membership}))
vi.mock('../../app/lib/bookkeeping/betti-work-loader',()=>({loadBettiWork:state.projection}))
beforeEach(()=>{vi.clearAllMocks();state.rpc.mockResolvedValue({error:null});state.membership.mockResolvedValue({businessId:'owned',plan:'business',capabilities:new Set(['autonomous_processing'])});state.projection.mockResolvedValue({businessId:'owned',nextAction:null})})
const request=(guided=true)=>new Request('https://staging.invalid/answer',{method:'POST',headers:guided?{'x-betti-guided':'1'}:{}})
it('reconciles then returns a fresh owned projection with the committed answer',async()=>{
 const save=vi.fn(async()=>Response.json({ok:true,eventId:'committed'}));const response=await guidedCommand(save)(request())
 expect(await response.json()).toEqual({ok:true,eventId:'committed',work:{businessId:'owned',nextAction:null}})
 expect(save).toHaveBeenCalledOnce();expect(state.rpc).toHaveBeenCalledWith('reconcile_current_betti_questions')
 expect(state.projection.mock.calls[0][0].businessId).toBe('owned')
 expect(response.headers.get('cache-control')).toBe('private, no-store')
})
it('does not turn a committed answer into a failed write if continuation is unavailable',async()=>{
 state.projection.mockRejectedValue(new Error('worker snapshot changed'))
 const response=await guidedCommand(async()=>Response.json({ok:true}))(request())
 expect(response.status).toBe(200);expect(await response.json()).toEqual({ok:true})
})
it('does not return a projection before successful reconciliation',async()=>{
 state.rpc.mockResolvedValue({error:{message:'unavailable'}})
 const response=await guidedCommand(async()=>Response.json({ok:true}))(request())
 expect(await response.json()).toEqual({ok:true});expect(state.projection).not.toHaveBeenCalled()
})
it('failed/stale commands do not run continuation work',async()=>{
 const response=await guidedCommand(async()=>Response.json({error:'stale'},{status:409}))(request())
 expect(response.status).toBe(409);expect(state.rpc).not.toHaveBeenCalled()
})
it('preserves ordinary non-guided callers without extra reads or commands',async()=>{
 await guidedCommand(async()=>Response.json({ok:true}))(request(false))
 expect(state.membership).not.toHaveBeenCalled();expect(state.rpc).not.toHaveBeenCalled()
})
it('never trusts a client business identifier or exposes a different business projection',async()=>{
 state.membership.mockResolvedValue({businessId:null,capabilities:new Set()})
 await guidedCommand(async()=>Response.json({ok:true}))(new Request('https://staging.invalid/answer?business=other',{method:'POST',headers:{'x-betti-guided':'1'}}))
 expect(state.projection).not.toHaveBeenCalled();expect(state.rpc).not.toHaveBeenCalled()
})

it.each([{action:'defer'},{disposition:'deferred'}])('projects durable deferrals without unrelated question generation: %j',async body=>{
 const request=new Request('https://staging.invalid/answer',{method:'POST',headers:{'x-betti-guided':'1','content-type':'application/json'},body:JSON.stringify(body)})
 const response=await guidedCommand(async()=>Response.json({ok:true}),{deferralField:'action' in body?'action':'disposition'})(request)
 expect((await response.json()).work).toEqual({businessId:'owned',nextAction:null})
 expect(state.rpc).not.toHaveBeenCalled();expect(state.projection).toHaveBeenCalledOnce()
})

it.each([
 ['https://staging.invalid/check-in?record=11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111'],
 ['https://other.invalid/check-in?record=11111111-1111-4111-8111-111111111111',undefined],
 ['https://staging.invalid/check-in?record=invalid',undefined],
])('preserves only a valid same-origin conversation priority: %s',async(referer,expected)=>{
 await guidedCommand(async()=>Response.json({ok:true}))(new Request('https://staging.invalid/answer',{method:'POST',headers:{'x-betti-guided':'1',referer}}))
 expect(state.projection.mock.calls[0][0].continuityRecordId).toBe(expected)
 expect(state.projection.mock.calls[0][0].businessId).toBe('owned')
})


it.each([undefined,'action'] as const)('an unrelated request field cannot skip required reconciliation (%s)',async deferralField=>{
 const request=new Request('https://staging.invalid/answer',{method:'POST',headers:{'x-betti-guided':'1'},body:JSON.stringify({action:'card_payment',disposition:'deferred'})})
 await guidedCommand(async()=>Response.json({ok:true}),{deferralField})(request)
 expect(state.rpc).toHaveBeenCalledWith('reconcile_current_betti_questions')
})
