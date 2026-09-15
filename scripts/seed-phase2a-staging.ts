import assert from 'node:assert/strict'
import {writeFile,copyFile,readFile} from 'node:fs/promises'
import {createHmac,createHash} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {SupabaseBookkeepingRepository} from '../app/lib/bookkeeping/supabase-repository'
import {PDFDocument} from 'pdf-lib'
import {CanonicalWeeklyReviewService} from '../app/lib/bookkeeping/review-events'
async function main(){
const url=process.env.NEXT_PUBLIC_SUPABASE_URL!
assert(process.env.WRITEOFFS_ENVIRONMENT==='staging'&&new URL(url).hostname==='sgrqrrxrlglhjuetdtps.supabase.co')
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
if(process.argv.includes('--receipt-only')) {
 const fixture=JSON.parse(await readFile('/private/tmp/writeoffs-phase2a-fixture.json','utf8'))
 const identity=await admin.auth.admin.getUserById(fixture.userId)
 assert(identity.data.user?.user_metadata.synthetic_phase2a_validation===true)
 if(fixture.receiptId){console.log('Synthetic receipt-only fixture already exists.');return}
 const pdf=await PDFDocument.create();pdf.addPage([300,220]).drawText('SYNTHETIC PHASE 2A RECEIPT - TEST ONLY',{x:12,y:170,size:10})
 const bytes=await pdf.save(),fingerprint=createHash('sha256').update(bytes).digest('hex'),storagePath=`receipts/${fixture.userId}/${fingerprint}`,id=crypto.randomUUID()
 assert(!(await admin.storage.from('receipts').upload(storagePath,bytes,{contentType:'application/pdf',upsert:false})).error)
 const inserted=await admin.from('receipts').insert({id,user_id:fixture.userId,business_id:fixture.businessId,upload_fingerprint:fingerprint,storage_path:storagePath,original_name:'Synthetic unmatched receipt.pdf',mime_type:'application/pdf',bytes:bytes.length})
 assert(!inserted.error)
 await writeFile('/private/tmp/writeoffs-phase2a-fixture.json',JSON.stringify({...fixture,receiptId:id}),{mode:0o600})
 console.log('Added a private synthetic unmatched PDF receipt. No ingestion or AI processing was invoked.');return
}
const nonce=crypto.randomUUID(),email=`phase2a-${nonce}@staging.writeoffs.invalid`,password=`Proof-${nonce}!`
const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{synthetic_phase2a_validation:true}})
assert(!created.error&&created.data.user)
const customer=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false}})
assert(!(await customer.auth.signInWithPassword({email,password})).error)
const b=await customer.from('businesses').select('id').single();assert(b.data)
const businessId=b.data.id,userId=created.data.user.id
const grant=await admin.rpc('create_business_membership_grant',{p_business_id:businessId,p_plan:'business',p_starts_at:'2025-01-01T00:00:00Z',p_ends_at:null,p_request_key:`phase2a:${nonce}`,p_reason:'Isolated Phase 2A certification',p_provenance:'admin',p_actor_user_id:null});assert(!grant.error)
assert(!(await admin.from('business_customer_setup').upsert({business_id:businessId,joined_month:'2026-09-01',grandfathered_start_date:'2025-01-01',completed_at:new Date().toISOString(),timezone_name:'America/Phoenix'})).error)
assert(!(await admin.from('businesses').update({name:'Guided Review Studio',business_description:'Independent design consulting',business_profile_context:'general',schedule_c_eligibility:'yes',business_stage:'existing',business_start_month:'2024-01-01',uses_customer_job_materials:'no',keeps_future_sale_merchandise:'no',catch_up_start_date:'2025-01-01',onboarding_start_method:'receipts',onboarding_state:'completed',onboarding_version:3,onboarding_completed_at:new Date().toISOString()}).eq('id',businessId)).error)
const accounts=[]
for(const display_name of ['Studio checking','Mixed spending']) {const result=await admin.from('financial_accounts').insert({business_id:businessId,institution_name:'Synthetic bank',display_name,account_type:'checking',currency:'USD'}).select('id').single();assert(result.data);accounts.push(result.data.id)}
// Establish account facts before opening questions so fixture evidence versions are stable.
const enrollment=await customer.auth.mfa.enroll({factorType:'totp',friendlyName:`Phase2A fixture ${Date.now()}`});assert(!enrollment.error&&enrollment.data)
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bits=[...enrollment.data.totp.secret.replace(/=+$/,'').toUpperCase()].map(c=>alphabet.indexOf(c).toString(2).padStart(5,'0')).join('')
const key=Buffer.from(Array.from({length:Math.floor(bits.length/8)},(_,i)=>parseInt(bits.slice(i*8,i*8+8),2))),counter=Buffer.alloc(8)
counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const hash=createHmac('sha1',key).update(counter).digest(),offset=hash.at(-1)!&15
const code=String((hash.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0')
assert(!(await customer.auth.mfa.challengeAndVerify({factorId:enrollment.data.id,code})).error)
for(let i=0;i<accounts.length;i++)assert(!(await customer.rpc('set_financial_account_use',{p_financial_account_id:accounts[i],p_designation:i?'business_and_personal':'business_only',p_effective_at:'2025-01-01T00:00:00Z',p_request_id:crypto.randomUUID()})).error)
const trusted=new SupabaseBookkeepingRepository(admin),writer=new SupabaseBookkeepingRepository(customer)
const records=[]
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Phoenix',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const dateAgo=(age:number)=>new Date(Date.parse(today+'T12:00:00Z')-age*86400000).toISOString().slice(0,10)
for(let i=0;i<(process.argv.includes('--empty')?0:65);i++) {
 const kind=i<12?'historical_attendee':i<20?'historical_purpose':i<25?'historical_purchase':i<28?'current_attendee':'ordinary'
 const age=kind==='current_attendee'?29+(i-25):kind==='ordinary'?10:100+i
 const occurredOn=dateAgo(age),amountCents=kind.includes('attendee')||kind.includes('purpose')?-433:-8940
 const merchant=kind==='historical_purchase'?'FUN':kind==='ordinary'?`Studio supplies ${i}`:'Coffee purchase'
 const f=await admin.from('financial_transactions').insert({business_id:businessId,financial_account_id:accounts[i%2],source_fingerprint:`phase2a:${i}`,import_method:'csv',merchant_name:merchant,original_description:merchant,amount_cents:amountCents,currency:'USD',transaction_date:occurredOn}).select('id').single();assert(f.data)
 const record=await trusted.ensureRecord({actor:{businessId,userId:null,provenance:'automation'},record:{sourceKind:'financial_transaction',financialTransactionId:f.data.id,ingestionKey:`phase2a:${i}`,amountCents,currency:'USD',occurredOn}})
 await trusted.attachFinancialSource({actor:{businessId,userId:null,provenance:'automation'},recordId:record.id,financialTransactionId:f.data.id})
 const initial=await writer.ensureInitialUnresolvedDecision(businessId,record.id)
 const meal=kind.includes('attendee')||kind.includes('purpose')
 const decision=await writer.appendDecision({actor:{businessId,userId,provenance:'user'},record,supersedesDecisionId:initial.id,decision:{bookkeepingNature:'expense',treatment:'business',reviewStatus:kind==='ordinary'?'resolved':'needs_review',provenance:'user',reason:'Isolated synthetic Phase 2A fixture facts.',businessPurpose:null,allocations:[{kind:'business',amountCents,taxCategoryKey:meal?'meals':'supplies'}]}})
 if(kind!=='ordinary') {
  const context:Record<string,unknown>={schemaVersion:1,reason:'BUSINESS_PURPOSE_NEEDED',factType:kind.includes('attendee')?'meal_attendee_relationship':kind.includes('purpose')?'receipt_meal_business_purpose':'ordinary_expense_purpose'}
  if(meal) {const assessment=await admin.rpc('record_bookkeeping_business_context_assessment',{p_business_id:businessId,p_bookkeeping_record_id:record.id,p_assessment_state:i%2?'customer_authoritative':'established',p_assessment_basis:i%2?'customer_correction':'account_business_only',p_economic_context:'restaurant_meal',p_evaluator_version:'bookkeeping-business-context:v1',p_evidence_fingerprint:nonce.replaceAll('-','').repeat(2),p_evidence_references:[]});assert(!assessment.error);context.businessContextAssessmentId=assessment.data}
  await new CanonicalWeeklyReviewService(trusted).openIssue({businessId,recordId:record.id,decisionId:decision.id,reason:'BUSINESS_PURPOSE_NEEDED',issueKey:`phase2a:${i}`,contextFingerprint:crypto.randomUUID(),questionContext:context})
 }
 records.push({recordId:record.id,decisionId:decision.id,transactionId:f.data.id,kind,age})
}
await customer.auth.mfa.unenroll({factorId:enrollment.data.id})
const fixturePath=process.argv.includes('--validation')?'/private/tmp/writeoffs-phase2a-validation.json':process.argv.includes('--empty')?'/private/tmp/writeoffs-phase2a-empty.json':'/private/tmp/writeoffs-phase2a-fixture.json'
await copyFile(fixturePath,`/private/tmp/writeoffs-phase2a-fixture-${Date.now()}.json`).catch(()=>undefined)
await writeFile(fixturePath,JSON.stringify({email,password,userId,businessId,accounts,records}),{mode:0o600})
console.log(`Created isolated Phase 2A customer with ${records.length} purchases. Credentials stored privately.`)

}
main().catch(error=>{console.error(error instanceof Error?error.message:'Synthetic fixture failed');process.exitCode=1})
