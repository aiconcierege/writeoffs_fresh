import {beforeEach,expect,it,vi} from 'vitest'
const s=vi.hoisted(()=>({read:vi.fn(),canonical:vi.fn(),rpc:vi.fn(),refresh:vi.fn()}))
vi.mock('next/server',async original=>({...await original<typeof import('next/server')>(),after:vi.fn()}))
vi.mock('../../utils/supabase/server',()=>({createServerSupabase:async()=>({auth:{getUser:async()=>({data:{user:{id:'owner'}}}),mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:'aal2'}})}},rpc:s.rpc})}))
vi.mock('../../app/lib/membership/entitlements',()=>({loadCustomerEntitlements:async()=>({businessId:'owned',plan:'business',capabilities:new Set(['autonomous_processing'])})}))
vi.mock('../../app/lib/bookkeeping/action-index-worker',()=>({actionIndexEnabled:()=>true,refreshBettiActionIndex:s.refresh}))
vi.mock('../../app/lib/bookkeeping/action-index-reader',()=>({readBettiActionIndex:s.read}))
vi.mock('../../app/lib/bookkeeping/betti-work-loader',()=>({loadBettiWork:vi.fn(()=>{throw new Error('Do not reread the checked index')}),loadCanonicalBettiWork:s.canonical}))
vi.mock('../../app/lib/bookkeeping/guided-work-projection',async original=>({...await original<typeof import('../../app/lib/bookkeeping/guided-work-projection')>(),guidedWorkProjection:(w:unknown)=>w}))
import {guidedCommand} from '../../app/lib/bookkeeping/guided-command-response'
beforeEach(()=>vi.clearAllMocks())
it.each(['refund_link','transaction_type','deduction_fact','not_sure','business_purpose','defer','factual_choice','receipt','personal_exception_sweep'])('returns one authoritative continuation after %s',async action=>{
 const dirty={businessId:'owned',index:{version:1,summaryCurrent:false},nextAction:{id:'provisional-B'}}
 const canonical={businessId:'owned',nextAction:{id:'authoritative-C'}}
 s.read.mockResolvedValue(dirty);s.canonical.mockResolvedValue(canonical)
 const save=vi.fn(async()=>Response.json({ok:true,work:dirty}))
 const r=await guidedCommand(save,{deferralField:'action'})(new Request('https://local/answer',{method:'POST',headers:{'x-betti-guided':'1'},body:JSON.stringify({action})}))
 expect((await r.json()).work).toEqual(canonical);expect(save).toHaveBeenCalledOnce()
 expect(s.rpc).not.toHaveBeenCalled();expect(s.canonical).toHaveBeenCalledOnce();expect(s.read).not.toHaveBeenCalled()
})

it('does not wait on a redundant index read or background publisher after durable save',async()=>{
 s.read.mockImplementation(()=>new Promise(()=>{}));s.refresh.mockImplementation(()=>new Promise(()=>{}))
 s.canonical.mockResolvedValue({businessId:'owned',nextAction:{id:'canonical-next'}})
 const response=await guidedCommand(async()=>Response.json({ok:true,eventId:'durable'}))(new Request('https://local/answer',{method:'POST',headers:{'x-betti-guided':'1'}}))
 expect(await response.json()).toEqual({ok:true,eventId:'durable',work:{businessId:'owned',nextAction:{id:'canonical-next'}}})
 expect(s.read).not.toHaveBeenCalled();expect(s.canonical).toHaveBeenCalledOnce()
})

it('keeps a current continuation already established by the atomic command without another snapshot',async()=>{
 const work={businessId:'owned',index:{version:1,summaryCurrent:true},nextAction:{id:'atomic-next'}}
 const response=await guidedCommand(async()=>Response.json({ok:true,work}))(new Request('https://local/answer',{method:'POST',headers:{'x-betti-guided':'1'}}))
 expect((await response.json()).work).toEqual(work);expect(s.read).not.toHaveBeenCalled();expect(s.canonical).not.toHaveBeenCalled()
})
it('does not leak provisional work when the authoritative read fails after commit',async()=>{
 const dirty={businessId:'owned',index:{version:1,summaryCurrent:false},nextAction:{id:'provisional'}}
 s.read.mockResolvedValue(dirty);s.canonical.mockRejectedValue(new Error('read unavailable'))
 const r=await guidedCommand(async()=>Response.json({ok:true,work:dirty}))(new Request('https://local/answer',{method:'POST',headers:{'x-betti-guided':'1'}}))
 expect(r.status).toBe(200);expect(await r.json()).toEqual({ok:true})
})
