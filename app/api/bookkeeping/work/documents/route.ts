import {NextResponse} from 'next/server'
import {createServerSupabase} from '../../../../../utils/supabase/server'
import {requestUser} from '../../../../lib/performance/request-identity'
import {loadCustomerEntitlements} from '../../../../lib/membership/entitlements'
import {loadCanonicalBettiWork} from '../../../../lib/bookkeeping/betti-work-loader'
import {guidedWorkProjection} from '../../../../lib/bookkeeping/guided-work-projection'
import {documentReviewState} from '../../../../lib/bookkeeping/document-review'
import type {WorkInputSnapshot} from '../../../../lib/bookkeeping/work-input-snapshot'
export const dynamic='force-dynamic'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export async function GET(request:Request){
 const db=await createServerSupabase(),{data:{user}}=await requestUser(db)
 if(!user)return NextResponse.json({error:'Unauthorized'},{status:401})
 const {data:aal}=await db.auth.mfa.getAuthenticatorAssuranceLevel()
 if(aal?.currentLevel!=='aal2')return NextResponse.json({error:'MFA required'},{status:403})
 const params=new URL(request.url).searchParams,documentIds=params.get('documents')?.split(',').map(id=>id.toLowerCase())??[],recordIds=params.get('records')?.split(',').map(id=>id.toLowerCase())??[]
 if(!documentIds.length||documentIds.length>10||recordIds.length>100||[...documentIds,...recordIds].some(id=>!uuid.test(id))||new Set(documentIds).size!==documentIds.length)return NextResponse.json({error:'Invalid document context'},{status:400})
 try{
  const membership=await loadCustomerEntitlements(db),businessId=membership.businessId
  if(!businessId||membership.lifecycle==='none'||membership.lifecycle==='expired_read_only')return NextResponse.json({error:'Active membership required'},{status:403})
  const owned=await db.from('business_documents').select('id').eq('business_id',businessId).in('id',documentIds)
  if(owned.error)throw Error('DOCUMENT_OWNERSHIP_UNAVAILABLE')
  if(owned.data.length!==documentIds.length)return NextResponse.json({error:'Documents unavailable'},{status:404})
  const documents=await db.from('current_customer_document_status').select('id,state').in('id',documentIds)
  if(documents.error)throw Error('DOCUMENT_STATUS_UNAVAILABLE')
  if(documents.data.length!==documentIds.length)return NextResponse.json({error:'Documents unavailable'},{status:404})
  if(recordIds.length){const records=await db.from('bookkeeping_records').select('id').eq('business_id',businessId).in('id',recordIds);if(records.error)throw Error('RECORDS_UNAVAILABLE');if(records.data.length!==new Set(recordIds).size)return NextResponse.json({error:'Records unavailable'},{status:404})}
  const dispositions=await db.from('customer_document_dispositions').select('document_id').in('document_id',documentIds)
  if(dispositions.error)throw Error('DOCUMENT_DISPOSITION_UNAVAILABLE')
  for(const d of documents.data)if(dispositions.data.some(x=>x.document_id===d.id))d.state='set_aside'
  const regions=await db.from('receipt_source_regions').select('receipt_id').eq('business_id',businessId).in('document_id',documentIds)
  if(regions.error)throw Error('DOCUMENT_LINEAGE_UNAVAILABLE')
  let snapshot:WorkInputSnapshot|undefined
  // Read document state FIRST, then the atomic work snapshot: a completed
  // extraction cannot be paired with an older pre-reassessment work snapshot.
  const work=await loadCanonicalBettiWork({db,businessId,scope:membership.plan??'expenses',onSnapshot:s=>{snapshot=s},processingEnabled:process.env.DOCUMENT_EXPENSIVE_PROCESSING_ENABLED!=='false'})
  if(!snapshot)throw Error('SNAPSHOT_UNAVAILABLE')
  const components=snapshot.tables.current_bookkeeping_compound_components.map(c=>({anchor:String(c.anchor_bookkeeping_record_id),record:String(c.bookkeeping_record_id)}))
  const review=documentReviewState({documentIds,recordIds,components,documents:documents.data,receiptIds:regions.data.map(r=>r.receipt_id),context:snapshot.context,work})
  if(review.phase==='ready'&&!review.remainingFact&&recordIds.length===1){
   const loan=await db.from('bookkeeping_loan_document_facts').select('principal_cents,interest_cents').eq('business_id',businessId).eq('bookkeeping_record_id',recordIds[0]).in('document_id',documentIds)
   if(loan.error)throw Error('LOAN_RESULT_UNAVAILABLE')
   if(loan.data.length===1)review.loanSplit={principalCents:loan.data[0].principal_cents,interestCents:loan.data[0].interest_cents}
  }
  return NextResponse.json({review,work:guidedWorkProjection(work)},{headers:{'Cache-Control':'private, no-store'}})
 }catch{return NextResponse.json({error:'I couldn’t confirm document processing. Your files are saved. Please check again.'},{status:503,headers:{'Cache-Control':'private, no-store'}})}
}
