import type { SupabaseClient } from '@supabase/supabase-js'

export type CustomerWeeklyReview = {
  id:string; eventId:string; snapshotId:string; periodStart:string; periodEnd:string
  scope:'expenses'|'business'; incomeCents:number|null; expenseCents:number
  corrected:boolean; items:Array<{id:string;recordId:string;transactionId:string|null;role:string;label:string;treatment:string;date:string;amountCents:number}>
}

export async function getCurrentCustomerWeeklyReview(supabase:SupabaseClient):Promise<CustomerWeeklyReview|null>{
  const {data:{user}}=await supabase.auth.getUser();if(!user)return null
  const business=await supabase.from('businesses').select('id').eq('owner_user_id',user.id).maybeSingle()
  if(!business.data)return null
  const periods=await supabase.from('bookkeeping_review_periods').select('*').eq('business_id',business.data.id)
    .order('period_end',{ascending:false}).limit(12)
  for(const period of periods.data??[]){
    const events=await supabase.from('bookkeeping_review_period_events').select('*').eq('review_period_id',period.id)
      .order('sequence_number',{ascending:false}).limit(1)
    const leaf=events.data?.[0]
    if(!leaf||!['presented','correction_linked'].includes(leaf.event_type)||!leaf.review_snapshot_id)continue
    const [snapshot,items,corrections]=await Promise.all([
      supabase.from('bookkeeping_review_snapshots').select('*').eq('id',leaf.review_snapshot_id).single(),
      supabase.from('bookkeeping_review_snapshot_items').select('*').eq('review_snapshot_id',leaf.review_snapshot_id)
        .order('occurred_on'),
      supabase.from('bookkeeping_review_correction_links').select('id').eq('review_snapshot_id',leaf.review_snapshot_id),
    ])
    if(!snapshot.data)return null
    return{id:period.id,eventId:leaf.id,snapshotId:snapshot.data.id,periodStart:period.period_start,
      periodEnd:period.period_end,scope:period.membership_scope,incomeCents:snapshot.data.income_cents==null?null:Number(snapshot.data.income_cents),
      expenseCents:Number(snapshot.data.expense_cents),corrected:(corrections.data?.length??0)>0,
      items:(items.data??[]).map((item)=>({id:item.id,recordId:item.bookkeeping_record_id,role:item.activity_role,
        transactionId:item.financial_transaction_id,label:item.display_label,treatment:item.treatment,date:item.occurred_on,
        amountCents:Number(item.signed_business_amount_cents)}))}
  }
  return null
}
