import {describe,it,expect,vi} from 'vitest'
import {homeWorkFixture} from '../fixtures/home-command'
const m=vi.hoisted(()=>({load:vi.fn(),membership:vi.fn()}))
vi.mock('../../app/lib/bookkeeping/betti-work-loader',()=>({loadBettiWork:m.load}))
vi.mock('../../app/lib/membership/entitlements',()=>({loadCustomerEntitlements:m.membership}))
import {loadCurrentCustomerWork} from '../../app/lib/bookkeeping/customer-work'
const db={auth:{getUser:async()=>({data:{user:{id:'owner'}}})},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{id:'owned',onboarding_start_method:'statement_uploads'},error:null})})})})}
describe('one authenticated customer-work adapter',()=>{
 it.each(['business','expenses'] as const)('uses the authenticated %s plan when an answer/read caller omits scope',async plan=>{
  m.membership.mockResolvedValue({plan});m.load.mockResolvedValue(homeWorkFixture('current'))
  const result=await loadCurrentCustomerWork({supabase:db as never})
  expect(m.load).toHaveBeenLastCalledWith(expect.objectContaining({businessId:'owned',scope:plan}))
  expect(result.count).toBe(result.work.customer.actionableCount)
  expect(result.actions).toEqual(result.work.customer.actionable)
  expect(result.questions).toEqual(result.actions.flatMap(a=>a.question?[a.question]:[]))
 })
})
