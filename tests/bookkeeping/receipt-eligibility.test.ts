import {describe,it,expect} from 'vitest'
import {purchaseReceiptEligible} from '../../app/lib/bookkeeping/receipt-eligibility'
describe('purchase receipt evidence eligibility',()=>{
 it.each(['business_income','transfer','owner_contribution','loan_proceeds','refund','expense',null])('never turns positive %s into a missing purchase receipt',bookkeepingNature=>{
  expect(purchaseReceiptEligible({amountCents:42500,bookkeepingNature,treatment:'business'})).toBe(false)
 })
 it.each(['business','mixed_use','unresolved'])('keeps genuine %s purchases eligible',treatment=>{
  expect(purchaseReceiptEligible({amountCents:-6419,bookkeepingNature:'expense',treatment})).toBe(true)
 })
 it.each(['credit_card_payment','transfer',null])('does not infer a purchase from a negative %s amount',bookkeepingNature=>{
  expect(purchaseReceiptEligible({amountCents:-128437,bookkeepingNature,treatment:'unresolved'})).toBe(false)
 })
 it.each([null,0])('fails closed on unknown or zero amounts',amountCents=>expect(purchaseReceiptEligible({amountCents,bookkeepingNature:'expense',treatment:'business'})).toBe(false))
 it.each(['personal','excluded'])('does not nag about %s purchases',treatment=>expect(purchaseReceiptEligible({amountCents:-6419,bookkeepingNature:'expense',treatment})).toBe(false))
})
