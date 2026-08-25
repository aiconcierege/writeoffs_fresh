import type {MembershipPlan} from './entitlements'
export type PlanId=MembershipPlan

export const membershipPlans:Record<MembershipPlan,{name:string;descriptor:string;description:string;displayPrice:string;priceEnv:string}>={
  expenses:{name:'WriteOffs Expenses',descriptor:'Expenses, deductions and documentation.',description:'Keep your business expenses, deductions and supporting records organized.',displayPrice:'$19',priceEnv:'STRIPE_EXPENSES_PRICE_ID'},
  business:{name:'WriteOffs Business',descriptor:'Income, expenses and tax-ready business records.',description:'Keep your cash-basis business income, expenses and supporting records organized for tax time.',displayPrice:'$29',priceEnv:'STRIPE_BUSINESS_PRICE_ID'},
}

export function planFromPriceId(priceId:string|undefined|null):MembershipPlan|null{if(!priceId)return null
  if(priceId===process.env.STRIPE_EXPENSES_PRICE_ID)return'expenses';if(priceId===process.env.STRIPE_BUSINESS_PRICE_ID)return'business';return null}

export function stripePriceForPlan(plan:MembershipPlan){const id=process.env[membershipPlans[plan].priceEnv];if(!id)throw new Error('STRIPE_PRICE_NOT_CONFIGURED');return id}
