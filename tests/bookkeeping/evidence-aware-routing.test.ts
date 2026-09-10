import { describe,expect,it } from 'vitest'
import { economicContextSignal } from '../../app/lib/bookkeeping/evidence-aware-routing'

describe('evidence-aware economic context routing',()=>{
  it.each([
    ['T-MOBILE AUTOPAY','t-mobile'],['Verizon Wireless','verizon'],['AT&T Mobility','at&t'],
    ['Google Fi charge','google fi'],['Consumer Cellular','consumer cellular'],
  ])('recognizes a general telecom provider %s', (merchant,scope)=>{
    expect(economicContextSignal({amountCents:-14235,merchantName:merchant})).toMatchObject({
      context:'telecom_service',confidence:'strong',merchantScope:scope,
    })
  })

  it('treats CSV and Plaid telecom evidence consistently',()=>{
    const csv=economicContextSignal({amountCents:-10000,merchantName:'Verizon Wireless'})
    const plaid=economicContextSignal({amountCents:-10000,merchantName:'Verizon Wireless',
      plaidPrimary:'GENERAL_SERVICES',plaidDetailed:'GENERAL_SERVICES_TELECOMMUNICATION_SERVICES'})
    expect(plaid?.context).toBe(csv?.context)
    expect(plaid?.merchantScope).toBe(csv?.merchantScope)
  })

  it('uses receipt or strong Plaid evidence for meals while preserving uncertainty for a name alone',()=>{
    expect(economicContextSignal({amountCents:-18642,merchantName:'The Capital Grille',receiptMealSupported:true}))
      .toMatchObject({context:'restaurant_meal',confidence:'strong',evidence:expect.arrayContaining(['receipt_meal'])})
    expect(economicContextSignal({amountCents:-18642,merchantName:'Neighborhood Grille'}))
      .toMatchObject({context:'restaurant_meal',confidence:'narrowed_confirmation'})
  })

  it('does not infer purchase context for money coming in or ambiguous merchants',()=>{
    expect(economicContextSignal({amountCents:14235,merchantName:'T-Mobile refund'})).toBeNull()
    expect(economicContextSignal({amountCents:-14235,merchantName:'Target'})).toBeNull()
  })
})
