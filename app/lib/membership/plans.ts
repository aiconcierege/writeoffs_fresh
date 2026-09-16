import type {MembershipPlan} from './entitlements'
// Legacy Price IDs remain readable for existing subscription history.
export function planFromPriceId(priceId:string|undefined|null):MembershipPlan|null{if(!priceId)return null
  if(priceId===process.env.STRIPE_MEMBERSHIP_PRICE_ID)return'business';if(priceId===process.env.STRIPE_EXPENSES_PRICE_ID)return'expenses';if(priceId===process.env.STRIPE_BUSINESS_PRICE_ID)return'business';return null}

// The launch offer is separate from legacy subscription history. Existing price
// IDs remain readable; no subscription is repriced by changing this catalog.
export const launchMembership = {
  name: 'WriteOffs', monthlyCents: 3900, displayPrice: '$39',
  description: 'Business income, expenses, receipts and mileage, organized for tax preparation.',
} as const
export function launchMembershipPrice() {
  const id = process.env.STRIPE_MEMBERSHIP_PRICE_ID
  if (!id) throw new Error('STRIPE_MEMBERSHIP_PRICE_NOT_CONFIGURED')
  return id
}
