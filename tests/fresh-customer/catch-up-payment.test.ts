import {describe,it,expect,vi} from 'vitest'
import {confirmCatchUpPayment} from '../../app/lib/membership/catch-up-payment'
const session={id:'cs_synthetic',livemode:false,mode:'payment',metadata:{purpose:'historical_catch_up',order_id:'order',business_id:'business-a'},payment_status:'paid',customer:'customer-a',currency:'usd',amount_total:14000,line_items:{data:[{price:{id:'price-catchup'},quantity:7}]}}
function setup(overrides:Record<string,unknown>={}){
 vi.stubEnv('STRIPE_CATCH_UP_PRICE_ID','price-catchup')
 const stripe={checkout:{sessions:{retrieve:vi.fn().mockResolvedValue({...session,...overrides})}}}
 const rpc=vi.fn().mockResolvedValue({data:null,error:null})
 const admin={rpc,from:(table:string)=>({select:()=>({eq:()=>({single:async()=>({error:null,data:table==='customer_catch_up_orders'?{id:'order',business_id:'business-a',amount_cents:14000,additional_months:7}:{provider_customer_id:'customer-a'}})})})})}
 return {stripe,admin,rpc}
}
describe('signed catch-up fulfillment checks',()=>{
 it('ignores live sessions and never grants coverage from a payment redirect',async()=>{
  const {stripe,admin,rpc}=setup()
  expect(await confirmCatchUpPayment({...session,livemode:true} as never,stripe as never,admin as never)).toBe('ignored');expect(rpc).not.toHaveBeenCalled()
 })
 it('leaves unpaid orders unresolved',async()=>{
  const {stripe,admin,rpc}=setup({payment_status:'unpaid'})
  expect(await confirmCatchUpPayment(session as never,stripe as never,admin as never)).toBe('awaiting_payment');expect(rpc).not.toHaveBeenCalled()
 })
 it.each([{customer:'customer-b'},{currency:'eur'},{amount_total:12000},{metadata:{...session.metadata,business_id:'business-b'}},{line_items:{data:[{price:{id:'other-price'},quantity:7}]}},{line_items:{data:[{price:{id:'price-catchup'},quantity:8}]}}])('rejects mismatched provider facts %j',async override=>{
  const {stripe,admin,rpc}=setup(override)
  await expect(confirmCatchUpPayment(session as never,stripe as never,admin as never)).rejects.toThrow('CATCH_UP_PAYMENT_MISMATCH');expect(rpc).not.toHaveBeenCalled()
 })
 it('confirms exact paid coverage through the replay-safe database function',async()=>{
  const {stripe,admin,rpc}=setup()
  expect(await confirmCatchUpPayment(session as never,stripe as never,admin as never)).toBe('catch_up_paid')
  expect(rpc).toHaveBeenCalledWith('confirm_customer_catch_up_payment',{p_order_id:'order',p_session_id:'cs_synthetic',p_amount:14000})
 })
})
