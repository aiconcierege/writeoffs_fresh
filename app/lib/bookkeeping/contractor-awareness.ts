import type { SupabaseClient } from '@supabase/supabase-js'
import { SupabaseCanonicalFinancialSummaryRepository } from './financial-summary-repository'
import { loadCurrentRecordConvergences } from './current-record-resolution'

export const CONTRACTOR_AWARENESS_VERSION = 'contractor-awareness:v1'
export type ContractorAwareness = 'tracking'|'information_incomplete'|'w9_needed'|'potential_1099_attention'|'no_current_action'
export type ContractorSummary = { id:string; currentEventId:string; displayName:string; businessName:string|null; active:boolean;
  totalPaidCents:number; paymentCount:number; paymentMethods:string[]; w9Status:string; w9EventId:string;
  awareness:ContractorAwareness; taxYear:number }

const currentDecision=(decisions:{id:string;supersedesDecisionId:string|null;bookkeepingNature:string|null;treatment:string}[])=>{
 const superseded=new Set(decisions.map(row=>row.supersedesDecisionId).filter(Boolean));return decisions.find(row=>!superseded.has(row.id))
}

export function evaluateContractorAwareness(input:{totalPaidCents:number;paymentMethods:string[];w9Status:string;attentionAmountCents:number|null}):ContractorAwareness{
 if(input.totalPaidCents===0)return'no_current_action'
 if(input.paymentMethods.includes('unknown'))return'information_incomplete'
 if(input.w9Status!=='on_file')return'w9_needed'
 if(input.attentionAmountCents==null)return'information_incomplete'
 // This is deliberately potential attention, never a filing conclusion. Entity,
 // payment-nature and information-return rule facts remain outside v1.
 if(input.totalPaidCents>=input.attentionAmountCents)return'potential_1099_attention'
 return'tracking'
}

export async function listContractorSummaries(input:{supabase:SupabaseClient;businessId:string;taxYear:number}):Promise<ContractorSummary[]>{
 const start=`${input.taxYear}-01-01`,end=`${input.taxYear}-12-31`
 const [{data:contractors,error:contractorError},{data:payments,error:paymentError},{data:w9,error:w9Error},{data:rule,error:ruleError},loaded,resolution]=await Promise.all([
  input.supabase.from('current_canonical_contractors').select('*').eq('business_id',input.businessId),
  input.supabase.from('current_contractor_payments').select('*').eq('business_id',input.businessId).gte('paid_on',start).lte('paid_on',end),
  input.supabase.from('current_contractor_w9_status').select('*').eq('business_id',input.businessId),
  input.supabase.from('contractor_awareness_rule_versions').select('attention_amount_cents').eq('tax_year',input.taxYear)
    .eq('rule_key','contractor_information_reporting_attention').eq('rule_version',CONTRACTOR_AWARENESS_VERSION)
    .eq('status','active').maybeSingle(),
  new SupabaseCanonicalFinancialSummaryRepository(input.supabase).loadRecords({businessId:input.businessId,periodStart:start,periodEnd:end}),
  loadCurrentRecordConvergences({supabase:input.supabase,businessId:input.businessId}),
 ])
 if(contractorError||paymentError||w9Error||ruleError)throw new Error('Unable to load contractor tax-time context.')
 const attentionAmountCents=rule&&Number.isSafeInteger(Number(rule.attention_amount_cents))?Number(rule.attention_amount_cents):null
 const qualifying=new Set(loaded.records.filter(record=>{const decision=currentDecision(record.decisions);return record.occurredOn&&decision?.bookkeepingNature==='expense'&&['business','mixed_use'].includes(decision.treatment)}).map(record=>record.id))
 const w9ByContractor=new Map((w9??[]).map(row=>[row.contractor_id,row]))
 return(contractors??[]).map(contractor=>{
  const rows=(payments??[]).filter(row=>row.contractor_id===contractor.id
    && !resolution.isInactive(row.bookkeeping_record_id)
    && qualifying.has(resolution.resolve(row.bookkeeping_record_id)))
  const totalPaidCents=rows.reduce((sum,row)=>sum+Math.abs(Number(row.amount_cents)),0)
  if(!Number.isSafeInteger(totalPaidCents))throw new Error('Contractor total is outside safe integer cents.')
  const paymentMethods=[...new Set(rows.map(row=>String(row.payment_method)))].sort()
  const status=w9ByContractor.get(contractor.id)
  const w9Status=String(status?.status??'unknown')
  return{id:String(contractor.id),currentEventId:String(contractor.current_event_id),displayName:String(contractor.display_name),businessName:contractor.business_name?String(contractor.business_name):null,
   active:Boolean(contractor.active),totalPaidCents,paymentCount:rows.length,paymentMethods,w9Status,w9EventId:String(status?.id??''),
   awareness:evaluateContractorAwareness({totalPaidCents,paymentMethods,w9Status,attentionAmountCents}),taxYear:input.taxYear}
 })
}

export function contractorSummaryCsv(rows:ContractorSummary[]){
 const clean=(value:string|number)=>{const text=String(value);return /[",\n\r]/.test(text)?`"${text.replace(/"/g,'""')}"`:text}
 return[['contractor','business_name','tax_year','payments_tracked','payment_count','payment_methods','w9_status','awareness_version','awareness'],...rows.map(row=>[row.displayName,row.businessName??'',row.taxYear,(row.totalPaidCents/100).toFixed(2),row.paymentCount,row.paymentMethods.join(' / '),row.w9Status,CONTRACTOR_AWARENESS_VERSION,row.awareness])].map(row=>row.map(clean).join(',')).join('\r\n')
}
