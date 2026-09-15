import {describe,it,expect,vi} from 'vitest'
import {catchUpCheckout,retireCatchUpCheckout} from '../../app/lib/membership/catch-up-checkout'
function setup(status:'open'|'expired'|'complete'='open'){
 const existing={id:'cs_old',status,payment_status:status==='complete'?'paid':'unpaid',url:'https://checkout.stripe.com/synthetic'}
 const next={...existing,id:'cs_new',status:'open',payment_status:'unpaid'}
 const stripe={checkout:{sessions:{retrieve:vi.fn().mockResolvedValue(existing),create:vi.fn().mockResolvedValue(next),expire:vi.fn().mockResolvedValue({...existing,status:'expired'})}}}
 const select=vi.fn().mockResolvedValue({data:[{id:'order',provider_session_id:'cs_new'}],error:null})
 const builder={eq:vi.fn().mockReturnThis(),is:vi.fn().mockReturnThis(),select}
 const update=vi.fn(()=>builder),admin={from:vi.fn(()=>({update}))}
 return {input:{stripe:stripe as never,admin:admin as never,order:{id:'order',business_id:'business',additional_months:7,provider_session_id:'cs_old'},customer:'customer',price:'price',baseUrl:'https://staging.example.test'},stripe,update,builder}
}
describe('catch-up checkout retries',()=>{
 it('reuses an open checkout instead of making another charge opportunity',async()=>{
  const {input,stripe}=setup();expect((await catchUpCheckout(input)).id).toBe('cs_old');expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
 })
 it('renews an expired checkout with a stable generation key and compare-and-set',async()=>{
  const {input,stripe,builder}=setup('expired');expect((await catchUpCheckout(input)).id).toBe('cs_new')
  expect(stripe.checkout.sessions.create.mock.calls[0][1]).toEqual({idempotencyKey:'catch-up-order-cs_old'})
  expect(builder.eq).toHaveBeenCalledWith('provider_session_id','cs_old');expect(builder.is).toHaveBeenCalledWith('canceled_at',null)
 })
 it('uses the original idempotency key when the first response is interrupted',async()=>{
  const {input,stripe}=setup();input.order.provider_session_id=null as never;await catchUpCheckout(input)
  expect(stripe.checkout.sessions.create.mock.calls[0][1]).toEqual({idempotencyKey:'catch-up-order'})
 })
 it('expires a previous payment page before retiring its quote',async()=>{
  const {input,stripe,update}=setup();await retireCatchUpCheckout(input)
  expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith('cs_old');expect(update).toHaveBeenCalledWith({canceled_at:expect.any(String)})
  expect(stripe.checkout.sessions.expire.mock.invocationCallOrder[0]).toBeLessThan(update.mock.invocationCallOrder[0])
 })
 it('never cancels a paid checkout while its webhook is being processed',async()=>{
  const {input,stripe,update}=setup('complete');await expect(retireCatchUpCheckout(input)).rejects.toThrow('PAYMENT_PROCESSING')
  expect(stripe.checkout.sessions.expire).not.toHaveBeenCalled();expect(update).not.toHaveBeenCalled()
 })
})
