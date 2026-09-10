import 'server-only'

import type {SupabaseClient} from '@supabase/supabase-js'

export type MembershipPlan='expenses'|'business'
export type MembershipLifecycle='active'|'payment_issue'|'canceling'|'expired_read_only'|'pending_deletion'|'none'
export type MembershipCapability=
  |'track_expenses'|'track_income'|'create_invoices'|'manage_current_invoices'
  |'record_manual_income'|'record_manual_expense'|'track_mileage'|'contractor_awareness'
  |'upload_receipts'|'upload_statements'|'import_csv'|'deduction_intelligence'
  |'expense_tax_package'|'business_tax_package'|'autonomous_processing'|'export_historical_records'

const expenseCapabilities:MembershipCapability[]=['track_expenses','record_manual_expense','track_mileage','contractor_awareness',
  'upload_receipts','upload_statements','import_csv','deduction_intelligence','expense_tax_package','autonomous_processing','export_historical_records']
const businessCapabilities:MembershipCapability[]=[...expenseCapabilities,'track_income','create_invoices','manage_current_invoices','record_manual_income','business_tax_package']
const historicalCapabilities:MembershipCapability[]=['export_historical_records']

function configuredInteger(name:string,fallback:number){const value=Number(process.env[name]);return Number.isInteger(value)&&value>=0?value:fallback}
export const membershipCatalogVersion='membership-entitlements:v1'
export const membershipLimits={expenses:{connected_plaid_item_limit:()=>configuredInteger('MEMBERSHIP_EXPENSES_PLAID_ITEM_LIMIT',3)},
  business:{connected_plaid_item_limit:()=>configuredInteger('MEMBERSHIP_BUSINESS_PLAID_ITEM_LIMIT',8)}} as const

export type EntitlementSnapshot={businessId:string|null;plan:MembershipPlan|null;lifecycle:MembershipLifecycle;authority:'stripe'|'grant'|null;
  capabilities:ReadonlySet<MembershipCapability>;connectedPlaidItemLimit:number;accessThrough:string|null;graceThrough:string|null;
  scheduledPlan:MembershipPlan|null;scheduledEffectiveAt:string|null;cancelAtPeriodEnd:boolean;catalogVersion:string;
  readOnlyThrough:string|null;deletionDueAt:string|null;deletionRequestId:string|null;deletionScheduledFor:string|null}

function effectiveLifecycle(row:Record<string,unknown>,now:Date):MembershipLifecycle{const lifecycle=String(row.lifecycle) as MembershipLifecycle
  const access=row.access_through?new Date(String(row.access_through)):null,grace=row.grace_through?new Date(String(row.grace_through)):null
  if(lifecycle==='payment_issue'&&grace&&grace<=now)return'expired_read_only'
  if((lifecycle==='active'||lifecycle==='canceling')&&access&&access<=now)return'expired_read_only'
  return lifecycle}

export function entitlementsFromMembership(row:Record<string,unknown>|null,now=new Date()):EntitlementSnapshot{
  if(!row)return{businessId:null,plan:null,lifecycle:'none',authority:null,capabilities:new Set(),connectedPlaidItemLimit:0,
    accessThrough:null,graceThrough:null,scheduledPlan:null,scheduledEffectiveAt:null,cancelAtPeriodEnd:false,catalogVersion:membershipCatalogVersion,
    readOnlyThrough:null,deletionDueAt:null,deletionRequestId:null,deletionScheduledFor:null}
  const plan=String(row.plan) as MembershipPlan,baseLifecycle=effectiveLifecycle(row,now),lifecycle=(row.deletion_status?'pending_deletion':baseLifecycle) as MembershipLifecycle,active=baseLifecycle==='active'||baseLifecycle==='payment_issue'||baseLifecycle==='canceling'
  return{businessId:String(row.business_id),plan,lifecycle,authority:String(row.authority) as 'stripe'|'grant',
    capabilities:new Set(lifecycle==='pending_deletion'?historicalCapabilities:active?(plan==='business'?businessCapabilities:expenseCapabilities):historicalCapabilities),
    connectedPlaidItemLimit:lifecycle!=='pending_deletion'&&active?membershipLimits[plan].connected_plaid_item_limit():0,accessThrough:row.access_through?String(row.access_through):null,
    graceThrough:row.grace_through?String(row.grace_through):null,scheduledPlan:row.scheduled_plan?String(row.scheduled_plan) as MembershipPlan:null,
    scheduledEffectiveAt:row.scheduled_effective_at?String(row.scheduled_effective_at):null,cancelAtPeriodEnd:Boolean(row.cancel_at_period_end),catalogVersion:membershipCatalogVersion,
    readOnlyThrough:row.read_only_through?String(row.read_only_through):null,deletionDueAt:row.deletion_due_at?String(row.deletion_due_at):null,
    deletionRequestId:row.deletion_request_id?String(row.deletion_request_id):null,deletionScheduledFor:row.deletion_scheduled_for?String(row.deletion_scheduled_for):null}
}

export const can=(snapshot:EntitlementSnapshot,capability:MembershipCapability)=>snapshot.capabilities.has(capability)
export const getLimit=(snapshot:EntitlementSnapshot,limit:'connected_plaid_item_limit')=>limit==='connected_plaid_item_limit'?snapshot.connectedPlaidItemLimit:0

export async function loadCustomerEntitlements(supabase:SupabaseClient):Promise<EntitlementSnapshot>{
  const membership=await supabase.from('current_customer_membership').select('*').maybeSingle()
  if(membership.error)throw new Error('MEMBERSHIP_UNAVAILABLE')
  return entitlementsFromMembership(membership.data as Record<string,unknown>|null)
}

export async function requireCapability(supabase:SupabaseClient,capability:MembershipCapability){const snapshot=await loadCustomerEntitlements(supabase)
  if(!can(snapshot,capability)){const error=new Error(['expired_read_only','pending_deletion'].includes(snapshot.lifecycle)?'MEMBERSHIP_READ_ONLY':'MEMBERSHIP_REQUIRED') as Error&{status?:number}
    error.status=403;throw error}return snapshot}

export function membershipErrorResponse(error:unknown){const code=error instanceof Error?error.message:''
  if(code==='MEMBERSHIP_READ_ONLY')return{status:403,error:'Your records are view-only. You can still view and download them.'}
  if(code==='MEMBERSHIP_REQUIRED')return{status:403,error:'Choose a membership to use this feature.'}
  return{status:503,error:'Membership access could not be verified. Please try again.'}}
