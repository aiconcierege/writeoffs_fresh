import type { SupabaseClient } from '@supabase/supabase-js'

export type CurrentMixedClarification = {
  id:string
  reviewIssueId:string
  recordId:string
  basedOnDecisionId:string
}

export async function listCurrentPeriodMixedClarifications(input:{
  supabase:SupabaseClient
  businessId:string
  periodStart:string
  periodEnd:string
}):Promise<CurrentMixedClarification[]>{
  const records=await input.supabase.from('bookkeeping_records').select('id')
    .eq('business_id',input.businessId).gte('occurred_on',input.periodStart).lte('occurred_on',input.periodEnd)
  if(records.error)throw new Error('Current review records could not be checked.')
  const recordIds=(records.data??[]).map(row=>row.id)
  if(!recordIds.length)return[]
  const events=await input.supabase.from('bookkeeping_review_events')
    .select('id,review_issue_id,bookkeeping_record_id,based_on_decision_id,supersedes_event_id,event_type,reason')
    .eq('business_id',input.businessId).eq('reason','MIXED_USE_CLARIFICATION')
    .in('bookkeeping_record_id',recordIds)
  if(events.error)throw new Error('Current mixed-use issues could not be checked.')
  const superseded=new Set((events.data??[]).map(row=>row.supersedes_event_id).filter(Boolean))
  return(events.data??[]).filter(row=>!superseded.has(row.id)
    &&['opened','reopened','skipped'].includes(row.event_type)).map(row=>({
      id:row.id,reviewIssueId:row.review_issue_id,recordId:row.bookkeeping_record_id,
      basedOnDecisionId:row.based_on_decision_id,
    }))
}
