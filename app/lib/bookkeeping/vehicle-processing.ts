import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { BookkeepingEvaluationSnapshot } from './deterministic-evaluator'
import { appendTrustedTaxTreatment } from './tax-treatment-service'
import { loadVehicleTaxYearReports } from '../mileage/repository'
import type { VehicleExpenseKind } from '../mileage/vehicle-tax'
import {assessBusinessContext} from './business-context'
import {applyAutomatedBookkeepingDecision} from './agent-resolution'
import {SupabaseBookkeepingRepository} from './supabase-repository'
import {receiptPurchaseEvidence} from './shared-evidence'

const normalize=(value:string|null|undefined)=>(value??'').toLowerCase().replace(/[^a-z0-9]+/g,' ')
export function vehicleExpenseKind(snapshot:BookkeepingEvaluationSnapshot):VehicleExpenseKind|null{
  const text=normalize(`${snapshot.merchantName??''} ${snapshot.description??''} ${snapshot.personalFinanceCategory?.primary??''} ${snapshot.personalFinanceCategory?.detailed??''} ${receiptPurchaseEvidence(snapshot).map(item=>item.text).join(' ')}`)
  if(/\b(?:vehicle purchase|automobile purchase|bought (?:a )?(?:car|truck|van)|car down payment)\b/.test(text))return'purchase'
  if(/\b(?:vehicle improvement|engine replacement|transmission replacement)\b/.test(text))return'improvement'
  if(/\b(?:parking fee|parking garage|parking meter)\b/.test(text))return'parking'
  if(/\b(?:road toll|turnpike toll|toll road)\b/.test(text))return'tolls'
  if(/\b(?:vehicle lease payment|car lease payment)\b/.test(text))return'lease_payment'
  if(/\b(?:auto insurance|car insurance)\b/.test(text))return'insurance'
  if(/\b(?:dmv registration|vehicle registration|license plate)\b/.test(text))return'registration'
  if(/\b(?:tires?|discount tire)\b/.test(text))return'tires'
  if(/\b(?:oil change|vehicle maintenance|car maintenance)\b/.test(text))return'maintenance'
  if(/\b(?:auto repair|car repair|mechanic)\b/.test(text))return'repair'
  if(/\b(?:gasoline|vehicle fuel|fuel station)\b/.test(text))return'fuel'
  return null
}

const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
export async function processVehicleExpense(input:{admin:SupabaseClient;snapshot:BookkeepingEvaluationSnapshot}){
  const {admin,snapshot}=input;const kind=vehicleExpenseKind(snapshot)
  if(!kind||snapshot.currentDecision.bookkeepingNature!=='expense'||(snapshot.currentDecision.provenance==='user'||snapshot.customerFactsAuthoritative)
    ||(!['business','mixed_use','unresolved'].includes(snapshot.currentDecision.treatment)))return{outcome:'not_applicable' as const}
  const associationResult=await admin.from('current_vehicle_expense_associations').select('*')
    .eq('business_id',snapshot.businessId).eq('bookkeeping_record_id',snapshot.recordId).maybeSingle()
  let association=associationResult.data;const associationError=associationResult.error
  if(associationError&&associationError.code!=='42P01')throw new Error('VEHICLE_ASSOCIATION_LOAD_FAILED')
  if(!association){
    const {data:vehicles,error}=await admin.from('business_vehicles').select('id').eq('business_id',snapshot.businessId).is('archived_at',null)
    if(error)throw new Error('VEHICLE_IDENTITY_LOAD_FAILED')
    if((vehicles??[]).length!==1){
      if((vehicles??[]).length>1)await admin.rpc('open_deduction_attention',{p_business_id:snapshot.businessId,p_bookkeeping_record_id:snapshot.recordId,
        p_fact_type:'vehicle_association',p_scope_kind:'vehicle_expense',p_scope_key:kind,p_question_type:'factual_choice',
        p_prompt:'Which vehicle was this for?',p_guidance:'Choose the vehicle connected to this cost.',
        p_signal_key:`vehicle-tax:v1:association:${snapshot.recordId}:${kind}`,p_signal_version:'vehicle-tax:v1'})
      return{outcome:'vehicle_required' as const,kind}
    }
    const evidenceFingerprint=hash({version:'vehicle-association:v1',recordId:snapshot.recordId,decisionId:snapshot.currentDecision.id,kind,vehicleId:vehicles![0].id})
    const inserted=await admin.from('vehicle_expense_association_events').insert({business_id:snapshot.businessId,
      bookkeeping_record_id:snapshot.recordId,vehicle_id:vehicles![0].id,event_type:'associated',expense_kind:kind,
      evidence_fingerprint:evidenceFingerprint,evidence_references:['merchant_or_description','single_active_vehicle'],
      request_key:`vehicle-auto:${snapshot.recordId}:${evidenceFingerprint.slice(0,24)}`,provenance:'automation'}).select('*').single()
    if(inserted.error)throw new Error('VEHICLE_ASSOCIATION_WRITE_FAILED');association=inserted.data
  }
  const year=Number((snapshot.occurredOn??'').slice(0,4));if(!Number.isInteger(year))return{outcome:'date_required' as const,kind}
  const reports=await loadVehicleTaxYearReports(admin,{businessId:snapshot.businessId,taxYear:year})
  const report=reports.find(row=>row.vehicleId===association!.vehicle_id);if(!report)return{outcome:'vehicle_required' as const,kind}
  if(snapshot.currentDecision.treatment==='unresolved'&&assessBusinessContext(snapshot).state==='established'&&report.allocationBasisPoints!=null){
    const businessAmount=Math.round(snapshot.amountCents!*report.allocationBasisPoints/10_000)
    const personalAmount=snapshot.amountCents!-businessAmount
    await applyAutomatedBookkeepingDecision({repository:new SupabaseBookkeepingRepository(admin),businessId:snapshot.businessId,
      recordId:snapshot.recordId,expectedCurrentDecisionId:snapshot.currentDecision.id,proposal:{bookkeepingNature:'expense',
        treatment:report.allocationBasisPoints===10_000?'business':'mixed_use',reviewStatus:'resolved',confidence:0.99,
        reason:'Applied customer-authored business context and the current vehicle-year use facts.',businessPurpose:snapshot.currentDecision.businessPurpose,
        allocations:[{kind:'business',amountCents:businessAmount,taxCategoryKey:'car-truck'},
          ...(personalAmount?[{kind:'personal' as const,amountCents:personalAmount,taxCategoryKey:null}]:[])],
        basis:{evidenceSufficient:true,ruleKey:'bookkeeping.business_context.default_business.v1',ruleAllowed:true,
          businessPurposeSupported:false,mixedUseAllocationSupported:report.allocationBasisPoints!==10_000}}})
    return{outcome:'decision_applied' as const,kind,vehicleId:report.vehicleId}
  }
  const evidenceFingerprint=hash({version:report.version,associationId:association!.id,methodEventId:report.methodEventId,
    useEventId:report.useEventId,businessMilesMilli:report.businessMilesMilli,expenses:report.expenses})
  const {data:current}=await admin.from('current_vehicle_deduction_assessments').select('id,evidence_fingerprint')
    .eq('business_id',snapshot.businessId).eq('vehicle_id',report.vehicleId).eq('tax_year',year).maybeSingle()
  if(current?.evidence_fingerprint!==evidenceFingerprint){
    const status=report.requiresCpaReview?'cpa_review':report.method==='unresolved'||report.allocationBasisPoints==null?'requires_facts':'ready'
    const {error}=await admin.from('vehicle_deduction_assessments').insert({business_id:snapshot.businessId,vehicle_id:report.vehicleId,tax_year:year,
      supersedes_assessment_id:current?.id??null,assessment_version:report.version,method_event_id:report.methodEventId,use_event_id:report.useEventId,
      business_miles_milli:report.businessMilesMilli,total_miles_milli:report.totalMilesMilli,business_use_basis_points:report.allocationBasisPoints,
      mileage_deduction_cents:report.mileageDeductionCents,actual_expense_cents:report.actualExpenseCents,
      deductible_actual_expense_cents:report.deductibleActualExpenseCents,
      excluded_actual_expense_cents:report.expenses.filter(row=>row.status==='recorded_not_deducted').reduce((sum,row)=>sum+Math.abs(row.amountCents),0),
      status,cpa_review_reasons:report.cpaReviewReasons,evidence_fingerprint:evidenceFingerprint})
    if(error)throw new Error('VEHICLE_ASSESSMENT_WRITE_FAILED')
  }
  if(report.allocationBasisPoints==null){
    await admin.rpc('open_deduction_attention',{p_business_id:snapshot.businessId,p_bookkeeping_record_id:snapshot.recordId,
      p_fact_type:'vehicle_total_miles',p_scope_kind:'vehicle_year',p_scope_key:`${report.vehicleId}:${year}`,
      p_question_type:'integer',p_prompt:`About how many total miles did you drive ${report.displayName} in ${year}?`,
      p_guidance:'Include business and personal driving. I’ll calculate the business share.',
      p_signal_key:`vehicle-tax:v1:total-miles:${report.vehicleId}:${year}`,p_signal_version:'vehicle-tax:v1'})
  }
  const expense=report.expenses.find(row=>row.id===snapshot.recordId);if(!expense)return{outcome:'associated' as const,kind}
  const {data:allocation}=await admin.from('bookkeeping_allocations').select('id').eq('business_id',snapshot.businessId)
    .eq('bookkeeping_decision_id',snapshot.currentDecision.id).eq('allocation_kind','business').eq('tax_category_key','car-truck').maybeSingle()
  if(!allocation)return{outcome:'category_pending' as const,kind}
  const {data:history}=await admin.from('bookkeeping_tax_treatments').select('id,supersedes_tax_treatment_id,conclusion_key').eq('business_id',snapshot.businessId).eq('bookkeeping_allocation_id',allocation.id)
  const superseded=new Set((history??[]).map(row=>row.supersedes_tax_treatment_id).filter(Boolean));const leaf=(history??[]).find(row=>!superseded.has(row.id))
  if(expense.status==='deductible'||expense.status==='recorded_not_deducted'||expense.status==='cpa_review'){
    const special=expense.status==='cpa_review';const deductible=expense.status==='deductible'?-Math.abs(expense.deductibleCents??0):expense.status==='recorded_not_deducted'?0:null
    const conclusionKey=`vehicle-tax:v1:${evidenceFingerprint}:${snapshot.recordId}`
    if(leaf?.conclusion_key===conclusionKey)return{outcome:expense.status,kind,vehicleId:report.vehicleId}
    await appendTrustedTaxTreatment({supabase:admin,businessId:snapshot.businessId,allocationId:allocation.id,expectedCurrentTaxTreatmentId:leaf?.id??null,
      conclusionKey,status:special?'special_treatment':deductible===0?'not_deductible':'deductible',
      deductibleAmountCents:deductible,taxCategoryKey:'car-truck',ruleKey:special?'tax.vehicle.special-review':'tax.vehicle.method-aware',ruleVersion:1,
      reason:special?'Vehicle purchase or improvement requires tax-preparer review.':expense.status==='recorded_not_deducted'
        ?'Recorded but excluded because this vehicle uses standard mileage.':'Applied the vehicle-year business-use facts and method.',provenance:'automation',taxYear:year,
      outcomeType:special?'special_treatment':deductible===0?'nondeductible':'fixed_fraction',adjustmentMethod:special?'special_calculation':deductible===0?'none':'fixed_fraction',
      factualBasis:{vehicleId:report.vehicleId,method:report.method,businessUseBasisPoints:report.allocationBasisPoints,expenseKind:kind},
      authorityReferences:[{authority:'irs_publication',identifier:'Publication 463',revision:'2025',topic:'Car expenses',officialUrl:'https://www.irs.gov/publications/p463',supportStatement:'Vehicle method and business-use allocation rules.',lastVerifiedOn:'2026-09-08'}]})
  }
  return{outcome:expense.status,kind,vehicleId:report.vehicleId}
}
