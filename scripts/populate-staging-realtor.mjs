import {createHash,randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'

const die=m=>{console.error(m);process.exit(1)},need=n=>process.env[n]?.trim()||die(`${n} is required.`)
if(need('WRITEOFFS_ENVIRONMENT')!=='staging')die('This fixture is staging-only.')
const url=need('SUPABASE_URL'),email=need('WRITEOFFS_STAGING_FIXTURE_EMAIL').toLowerCase()
if(!url.startsWith('https://')||/localhost|127\.0\.0\.1/.test(url))die('A remote staging Supabase URL is required.')
const expected=need('WRITEOFFS_EXPECTED_SUPABASE_HOST')
if(new URL(url).host!==expected)die('The Supabase host is not the approved staging host.')
const allowed=new Set(need('WRITEOFFS_STAGING_TEST_USERS').split(',').map(v=>v.trim().toLowerCase()))
if(!allowed.has(email))die('The fixture account is not designated for staging tests.')
const admin=createClient(url,need('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false}})
const customer=createClient(url,need('NEXT_PUBLIC_SUPABASE_ANON_KEY'),{auth:{persistSession:false}})
const auth=await customer.auth.signInWithPassword({email,password:need('WRITEOFFS_STAGING_TEST_PASSWORD')})
if(auth.error||!auth.data.user)die('The designated test account could not sign in.')
const userId=auth.data.user.id
const owner=await admin.from('businesses').select('*').eq('owner_user_id',userId).maybeSingle()
if(owner.error||!owner.data)die('The designated account has no Business.')
const business=owner.data
const prior=await admin.from('financial_transactions').select('id',{head:true,count:'exact'}).eq('business_id',business.id)
if(prior.error)die('The Business could not be inspected safely.')
const resume=process.env.WRITEOFFS_STAGING_FIXTURE_RESUME==='true'
if((prior.count??0)>0&&!resume)die('Reset this Business before applying the fixture.')
if((prior.count??0)>318)die('The existing Business is not a bounded partial copy of this fixture.')

const hash=(a,v)=>createHash(a).update(v).digest('hex'),pad=v=>String(v).padStart(2,'0'),date=(m,d)=>`2026-${pad(m)}-${pad(d)}`
const rows=[],fixture=new Map()
function add(day,description,cents,state,purpose=null){rows.push({day,description,cents});fixture.set(`${day}|${description}|${cents}`,{state,purpose})}
const recurring=[
 ['NORTHSTAR MLS MONTHLY',-17900,'business','MLS access'],['REALTY ONE GROUP DESERT',-39500,'business','Brokerage technology fee'],
 ['FOLLOW UP BOSS CRM',-6900,'business','Client relationship software'],['ADOBE CREATIVE CLOUD',-2299,'business','Listing marketing'],
 ['CANVA PRO',-1499,'business','Listing graphics'],['DOCUSIGN',-4500,'business','Transaction signatures'],
 ['T-MOBILE AUTOPAY',-14235,'mixed','Business and personal phone'],['COX COMMUNICATIONS',-11840,'mixed','Business and household internet'],
 ['STATE FARM INSURANCE',-18642,'personal',null]]
for(let m=1;m<=8;m++){
 recurring.forEach(([x,a,s,p],i)=>add(date(m,3+i*2),x,a,s,p))
 add(date(m,2),'BROKER COMMISSION ACH',845000+m*137500,'income','Residential sale commission')
 if(m%2===0)add(date(m,19),'BROKER COMMISSION ACH',1215000+m*92500,'income','Residential sale commission')
 ;[['META ADS',-18500-m*1700,'business'],['GOOGLE ADS',-12700-m*900,'business'],['ARMLS LOCKBOX SERVICES',-4850,'business'],
 ['OFFICE DEPOT',-4200-m*311,'business'],['USPS',-1100-m*127,'business'],['CHEVRON',-5200-m*193,m%3===0?'unresolved':'business'],
 ['STARBUCKS',-975-m*43,m%2?'unresolved':'personal'],['ZELLE TRANSFER',m%2?50000:-50000,'transfer']]
 .forEach(([x,a,s],i)=>add(date(m,6+i*3),x,a,s,s==='business'?'Realtor business activity':null))
}
const variable=[['HOME DEPOT','unresolved'],['LOWES','unresolved'],['AMAZON MARKETPLACE','unresolved'],['COSTCO WHOLESALE','unresolved'],
 ['TARGET','personal'],['WALMART','unresolved'],['APPLE STORE','mixed'],['FEDEX OFFICE','business'],['SIGNS BY TOMORROW','business'],
 ['DESERT HOME PHOTOGRAPHY','business'],['THE ESCROW GROUP','business'],['AZ REALTORS DUES','business'],
 ['REAL ESTATE CONTINUING ED','business'],['PARKWHIZ','business'],['UBER','unresolved'],['HILTON GARDEN INN','business'],
 ['SOUTHWEST AIRLINES','business'],['CLIENTS FIRST GIFTS','business'],['POSTINO','unresolved'],['CHIPOTLE','personal'],['TRADER JOES','personal']]
for(let i=0;rows.length<318;i++){const [merchant,state]=variable[i%variable.length],m=1+i%8
 add(date(m,1+(i*7+m*3)%27),merchant,-(1450+(i*791+m*313)%27500),state,state==='business'?'Realtor business activity':state==='mixed'?'Business and personal device':null)}

const seen=new Map(),prepared=rows.map((r,i)=>{const normalized=r.description.toUpperCase().trim()
 const base=hash('sha256',`csv:normalized:v1\n${r.day}\n${r.cents}\nUSD\n${r.description}`),occurrence=(seen.get(base)??0)+1;seen.set(base,occurrence)
 return{row_number:i+2,transaction_date:r.day,amount_cents:r.cents,currency:'USD',raw_description:r.description,
 normalized_description:normalized,normalized_fingerprint:base,occurrence,source_fingerprint:hash('sha256',`csv:occurrence:v1\n${base}\n${occurrence}`),
 legacy_dedupe_hash:hash('sha1',`${r.day}|${r.cents}|${normalized}|csv|${occurrence}`)}})
for(let offset=0;offset<prepared.length;offset+=50){
 const ingested=await customer.rpc('ingest_csv_financial_activity',{p_rows:prepared.slice(offset,offset+50)})
 if(ingested.error)die(`CSV ingestion failed at row ${offset+2}: ${ingested.error.message}`)
}
const grant=await admin.rpc('create_business_membership_grant',{p_business_id:business.id,p_plan:'business',p_starts_at:'2026-01-01T00:00:00Z',p_ends_at:null,
 p_request_key:`staging-realtor:${business.id}`,p_reason:'Deterministic staging realtor UX fixture.',p_provenance:'admin',p_actor_user_id:null})
if(grant.error)die(`Membership grant failed: ${grant.error.message}`)
await admin.from('profiles').update({vertical:'realtor'}).eq('id',userId)
const profile=await admin.from('businesses').update({name:'Sonoran Keys Realty',business_description:'Residential realtor helping Phoenix-area buyers and sellers.',
 business_profile_context:'realtor',schedule_c_eligibility:'yes',business_stage:'existing',business_start_month:'2021-03-01',uses_customer_job_materials:'no',
 keeps_future_sale_merchandise:'no',prior_materials_handling:null,catch_up_start_date:'2026-01-01',onboarding_start_method:'receipts',
 onboarding_state:'completed',onboarding_version:3,onboarding_completed_at:'2026-01-03T17:00:00Z'}).eq('id',business.id)
if(profile.error)die(`Business profile failed: ${profile.error.message}`)

const transactions=await admin.from('financial_transactions').select('id,transaction_date,original_description,amount_cents').eq('business_id',business.id)
const links=await admin.from('bookkeeping_financial_sources').select('bookkeeping_record_id,financial_transaction_id').eq('business_id',business.id).is('revoked_at',null)
const initial=await admin.from('bookkeeping_decisions').select('id,bookkeeping_record_id,supersedes_decision_id,reason,bookkeeping_nature,treatment,review_status,provenance,confidence,business_purpose').eq('business_id',business.id)
const initialAllocations=await admin.from('bookkeeping_allocations').select('bookkeeping_decision_id,allocation_kind,amount_cents,tax_category_key,memo').eq('business_id',business.id)
if(transactions.error||links.error||initial.error||initialAllocations.error)die(`Canonical records could not be resolved: ${transactions.error?.message??links.error?.message??initial.error?.message??initialAllocations.error?.message}`)
const superseded=new Set(initial.data.map(x=>x.supersedes_decision_id).filter(Boolean))
const leafByRecord=new Map(initial.data.filter(x=>!superseded.has(x.id)).map(x=>[x.bookkeeping_record_id,x]))
const initialAllocationsByDecision=new Map()
for(const allocation of initialAllocations.data)initialAllocationsByDecision.set(allocation.bookkeeping_decision_id,[...(initialAllocationsByDecision.get(allocation.bookkeeping_decision_id)??[]),allocation])
const recordByTx=new Map(links.data.map(x=>[x.financial_transaction_id,x.bookkeeping_record_id]))
function supportedCategory(description){
 if(/META ADS|GOOGLE ADS|ADOBE|CANVA|PHOTOGRAPHY|SIGNS BY TOMORROW/.test(description))return'advertising'
 if(/FOLLOW UP BOSS|DOCUSIGN/.test(description))return'software-cloud'
 if(/OFFICE DEPOT/.test(description))return'office-expense'
 if(/USPS|FEDEX/.test(description))return'postage-shipping'
 return null
}
const counts={income:0,business:0,personal:0,mixed:0,unresolved:0,transfer:0},unresolved=[]
for(const tx of transactions.data){const facts=fixture.get(`${tx.transaction_date}|${tx.original_description}|${tx.amount_cents}`)??{state:'unresolved',purpose:null};counts[facts.state]++
 const recordId=recordByTx.get(tx.id),leaf=leafByRecord.get(recordId),decisionId=leaf?.id;if(!recordId||!decisionId)die('A source link was missing.')
 if(facts.state==='unresolved'){
 let currentDecisionId=decisionId
  if(leaf.reason!=='Deterministic staging realtor unresolved fact.'&&leaf.reason!=='Likely business purchase; factual purpose is still required.'){
   const pending=await admin.rpc('append_bookkeeping_decision',{p_business_id:business.id,p_bookkeeping_record_id:recordId,p_expected_current_decision_id:decisionId,
    p_bookkeeping_nature:'expense',p_treatment:'unresolved',p_review_status:'needs_review',p_provenance:'automation',p_confidence:null,
    p_reason:'Deterministic staging realtor unresolved fact.',p_business_purpose:null,p_allocations:[]})
   if(pending.error)die(`Unresolved decision failed: ${pending.error.message}`);currentDecisionId=pending.data
  }
  unresolved.push({...tx,recordId,decisionId:currentDecisionId,treatment:leaf.reason==='Likely business purchase; factual purpose is still required.'?'business':'unresolved'});continue}
 const category=supportedCategory(tx.original_description)
 if(leaf.reason?.startsWith('Deterministic staging realtor fixture:')){
  const currentAllocations=initialAllocationsByDecision.get(leaf.id)??[]
  if(!category||currentAllocations.some(a=>a.allocation_kind==='business'&&a.tax_category_key===category))continue
  const categorized=await admin.rpc('append_bookkeeping_decision',{p_business_id:business.id,p_bookkeeping_record_id:recordId,p_expected_current_decision_id:leaf.id,
   p_bookkeeping_nature:leaf.bookkeeping_nature,p_treatment:leaf.treatment,p_review_status:leaf.review_status,p_provenance:'system',p_confidence:leaf.confidence,
   p_reason:`Deterministic staging realtor fixture: ${facts.state}; supported category established.`,p_business_purpose:leaf.business_purpose,
   p_allocations:currentAllocations.map(a=>({kind:a.allocation_kind,amount_cents:a.amount_cents,tax_category_key:a.allocation_kind==='business'?category:null,memo:a.memo}))})
  if(categorized.error)die(`Category decision failed: ${categorized.error.message}`)
  continue
 }
 const businessPart=facts.state==='mixed'?Math.round(tx.amount_cents*.7):tx.amount_cents
 const allocations=facts.state==='mixed'?[{kind:'business',amount_cents:businessPart,tax_category_key:category},{kind:'personal',amount_cents:tx.amount_cents-businessPart}]
  :[{kind:['business','income'].includes(facts.state)?'business':facts.state==='transfer'?'excluded':facts.state,amount_cents:tx.amount_cents,tax_category_key:facts.state==='business'?category:null}]
 const transfer=facts.state==='transfer',decision=await admin.rpc('append_bookkeeping_decision',{p_business_id:business.id,p_bookkeeping_record_id:recordId,
  p_expected_current_decision_id:decisionId,p_bookkeeping_nature:transfer?'transfer':tx.amount_cents>0?'business_income':'expense',
  p_treatment:facts.state==='mixed'?'mixed_use':transfer?'excluded':facts.state==='income'?'business':facts.state,p_review_status:'resolved',p_provenance:'system',
  p_confidence:['business','income'].includes(facts.state)?.98:null,p_reason:`Deterministic staging realtor fixture: ${facts.state}.`,
  p_business_purpose:facts.purpose,p_allocations:allocations})
 if(decision.error)die(`Decision failed: ${decision.error.message}`)}
for(const [i,item] of unresolved.slice(0,18).entries()){const reason=i%3===1?'BUSINESS_PURPOSE_NEEDED':'BUSINESS_USE_UNCLEAR'
 let basedOnDecisionId=item.decisionId
 if(reason==='BUSINESS_PURPOSE_NEEDED'&&item.treatment!=='business'){
  const established=await admin.rpc('append_bookkeeping_decision',{p_business_id:business.id,p_bookkeeping_record_id:item.recordId,p_expected_current_decision_id:item.decisionId,
   p_bookkeeping_nature:'expense',p_treatment:'business',p_review_status:'needs_review',p_provenance:'automation',p_confidence:.8,
   p_reason:'Likely business purchase; factual purpose is still required.',p_business_purpose:null,
   p_allocations:[{kind:'business',amount_cents:item.amount_cents,tax_category_key:supportedCategory(item.original_description)}]})
  if(established.error)die(`Purpose-question decision failed: ${established.error.message}`);basedOnDecisionId=established.data
 }
 const q=await admin.rpc('open_bookkeeping_review_issue_v2',{p_business_id:business.id,p_bookkeeping_record_id:item.recordId,p_based_on_decision_id:basedOnDecisionId,
  p_reason:reason,p_issue_key:`staging-realtor-v3-${i+1}`,p_context_fingerprint:hash('sha256',`${item.id}:${reason}:v3`),
  p_question_context:{schemaVersion:1,reason,merchant:item.original_description,occurredOn:item.transaction_date,amountCents:item.amount_cents}});if(q.error)die(`Question failed: ${q.error.message}`)}

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64')
for(let i=0;i<12;i++){const fingerprint=hash('sha256',`staging-realtor-receipt:${i}`),path=`receipts/${userId}/${fingerprint}`
 const priorReceipt=await admin.from('receipts').select('id').eq('business_id',business.id).eq('upload_fingerprint',fingerprint).maybeSingle()
 const receiptId=priorReceipt.data?.id??randomUUID()
 if(!priorReceipt.data){const upload=await admin.storage.from('receipts').upload(path,png,{contentType:'image/png'});if(upload.error)die(`Receipt storage failed: ${upload.error.message}`)
  const registered=await customer.rpc('register_bookkeeping_receipt',{p_receipt_id:receiptId,p_upload_fingerprint:fingerprint,p_storage_path:path,
   p_original_name:`synthetic-realtor-${i+1}.png`,p_mime_type:'image/png',p_bytes:png.length});if(registered.error)die(`Receipt registration failed: ${registered.error.message}`)}
 const kept=await customer.rpc('keep_unmatched_bookkeeping_receipt_with_facts',{p_receipt_id:receiptId,p_merchant:['Local Print Shop','Open House Bakery','Desert Floral Studio'][i%3],
  p_occurred_on:date(2+i%6,8+i),p_total_amount_cents:1800+i*437});if(kept.error)die(`Receipt-only expense failed: ${kept.error.message}`)
 const current=await admin.from('bookkeeping_decisions').select('id,reason').eq('bookkeeping_record_id',kept.data.record_id).order('created_at',{ascending:false}).limit(1).single()
 if(current.data.reason!=='Synthetic receipt-only business purchase.'){
  const resolved=await admin.rpc('append_bookkeeping_decision',{p_business_id:business.id,p_bookkeeping_record_id:kept.data.record_id,p_expected_current_decision_id:current.data.id,
   p_bookkeeping_nature:'expense',p_treatment:'business',p_review_status:'resolved',p_provenance:'system',p_confidence:.99,p_reason:'Synthetic receipt-only business purchase.',
   p_business_purpose:'Open house and listing supplies',p_allocations:[{kind:'business',amount_cents:-(1800+i*437)}]});if(resolved.error)die(`Receipt decision failed: ${resolved.error.message}`)}}

const priorVehicle=await admin.from('business_vehicles').select('id').eq('business_id',business.id).eq('slot',1).is('archived_at',null).maybeSingle()
const vehicleId=priorVehicle.data?.id??randomUUID()
if(!priorVehicle.data){const vehicle=await customer.from('business_vehicles').insert({id:vehicleId,business_id:business.id,slot:1,display_name:'2023 Toyota RAV4',vehicle_year:2023,make:'Toyota',model:'RAV4',is_mixed_use:true}).select().single()
 if(vehicle.error)die(`Vehicle failed: ${vehicle.error.message}`)}let milesMilli=0
for(let i=0;i<54;i++){const miles=7.5+(i*13)%29+(i%4)*.25;milesMilli+=Math.round(miles*1000)
 const trip=await customer.rpc('record_canonical_mileage',{p_id:randomUUID(),p_vehicle_id:vehicleId,p_miles_milli:Math.round(miles*1000),p_occurred_on:date(1+i%8,1+(i*5)%27),
  p_job_label:['Arcadia listing','Tempe buyer tour','North Phoenix inspection'][i%3],p_destination:['Arcadia','Tempe','North Phoenix'][i%3],
  p_business_purpose:'Client property appointment',p_request_key:`staging-realtor-mileage-${i+1}`});if(trip.error)die(`Mileage failed: ${trip.error.message}`)}
for(let i=0;i<5;i++){const invoice=await customer.rpc('create_canonical_invoice',{p_customer_name:['Cactus Key Homes','Desert Door Realty','Copper State Staging'][i%3],p_customer_email:null,
 p_amount_cents:35000+i*17500,p_currency:'USD',p_issue_date:date(3+i,4+i),p_due_date:date(3+i,18+i),p_description:i%2?'Referral fee':'Listing marketing reimbursement',
 p_job_label:`Realtor project ${i+1}`,p_location:'Phoenix, AZ',p_note:'Synthetic staging fixture.',p_request_key:`staging-realtor-invoice-${i+1}`});if(invoice.error)die(`Invoice failed: ${invoice.error.message}`)
 if(i<4){const current=await admin.from('current_canonical_invoices').select('current_event_id').eq('id',invoice.data).single(),sent=await customer.rpc('mark_canonical_invoice_sent',{p_invoice_id:invoice.data,p_expected_current_event_id:current.data.current_event_id,p_request_key:`staging-realtor-invoice-${i+1}-sent`});if(sent.error)die(`Invoice state failed: ${sent.error.message}`)}}
const cadence=await customer.rpc('set_business_review_cadence',{p_check_in_weekday:5,p_timezone_name:'America/Phoenix',p_effective_from:'2026-01-02',p_request_id:randomUUID()})
if(cadence.error)die(`Review cadence failed: ${cadence.error.message}`)

const cadenceRow=await admin.from('current_business_review_cadence').select('id').eq('business_id',business.id).single()
const allRecords=await admin.from('bookkeeping_records').select('id,occurred_on,amount_cents,currency').eq('business_id',business.id)
const allDecisions=await admin.from('bookkeeping_decisions').select('id,bookkeeping_record_id,supersedes_decision_id,bookkeeping_nature,treatment,business_purpose').eq('business_id',business.id)
const allAllocations=await admin.from('bookkeeping_allocations').select('id,bookkeeping_record_id,bookkeeping_decision_id,allocation_kind,amount_cents').eq('business_id',business.id)
const allSources=await admin.from('bookkeeping_financial_sources').select('bookkeeping_record_id,financial_transaction_id').eq('business_id',business.id).is('revoked_at',null)
const allQuestions=await admin.from('bookkeeping_review_events').select('bookkeeping_record_id,id,supersedes_event_id').eq('business_id',business.id)
if(cadenceRow.error||allRecords.error||allDecisions.error||allAllocations.error||allSources.error||allQuestions.error)die('Weekly review source state could not be loaded.')
const supersededReviewDecisions=new Set(allDecisions.data.map(x=>x.supersedes_decision_id).filter(Boolean))
const currentReviewDecision=new Map(allDecisions.data.filter(x=>!supersededReviewDecisions.has(x.id)).map(x=>[x.bookkeeping_record_id,x]))
const currentQuestionIds=new Set(allQuestions.data.map(x=>x.supersedes_event_id).filter(Boolean))
const questionRecords=new Set(allQuestions.data.filter(x=>!currentQuestionIds.has(x.id)).map(x=>x.bookkeeping_record_id))
const allocationsByDecision=new Map()
for(const allocation of allAllocations.data)allocationsByDecision.set(allocation.bookkeeping_decision_id,[...(allocationsByDecision.get(allocation.bookkeeping_decision_id)??[]),allocation])
const sourceByRecord=new Map(allSources.data.map(x=>[x.bookkeeping_record_id,x.financial_transaction_id]))
const labelByTx=new Map(transactions.data.map(x=>[x.id,x.original_description]))
const reviewCandidates=[['2026-04-10','2026-04-03','2026-04-09','confirmed'],['2026-05-08','2026-05-01','2026-05-07','corrected'],
 ['2026-06-12','2026-06-05','2026-06-11','closed_unreviewed'],['2026-07-10','2026-07-03','2026-07-09','presented']]
reviewCandidates.push(['2026-08-14','2026-08-07','2026-08-13','confirmed'])
reviewCandidates.push(['2026-08-21','2026-08-14','2026-08-20','presented'])
for(const [checkIn,start,end,outcome] of reviewCandidates){
 const exists=await admin.from('bookkeeping_review_periods').select('id').eq('business_id',business.id).eq('check_in_date',checkIn).maybeSingle()
 if(exists.data){const leaf=await admin.from('bookkeeping_review_period_events').select('id,event_type,review_snapshot_id').eq('review_period_id',exists.data.id).order('sequence_number',{ascending:false}).limit(1).single()
  if(outcome==='confirmed'&&leaf.data.event_type==='presented'){const confirmed=await customer.rpc('append_customer_review_period_event',{p_review_period_id:exists.data.id,
   p_expected_event_id:leaf.data.id,p_event_type:'confirmed',p_review_snapshot_id:leaf.data.review_snapshot_id,p_deferred_until:null,p_request_id:randomUUID()});if(confirmed.error)die(`Review confirmation failed: ${confirmed.error.message}`)}
  continue}
 const periodRecords=allRecords.data.filter(r=>r.occurred_on>=start&&r.occurred_on<=end&&!questionRecords.has(r.id))
 const items=[];let income=0,expenses=0
 for(const record of periodRecords){const decision=currentReviewDecision.get(record.id);if(!decision||!['business','mixed_use'].includes(decision.treatment)||!['expense','business_income'].includes(decision.bookkeeping_nature))continue
  const businessAllocations=(allocationsByDecision.get(decision.id)??[]).filter(a=>a.allocation_kind==='business'),signed=businessAllocations.reduce((sum,a)=>sum+Number(a.amount_cents),0)
  if(!signed)continue;if(decision.bookkeeping_nature==='business_income')income+=signed;else expenses-=signed
  const txId=sourceByRecord.get(record.id)??null
  items.push({bookkeepingRecordId:record.id,bookkeepingDecisionId:decision.id,activityRole:decision.bookkeeping_nature==='business_income'?'income':'expense',
   displayLabel:txId?labelByTx.get(txId):'Receipt-only purchase',treatment:decision.treatment,signedBusinessAmountCents:signed,
   financialTransactionId:txId,occurredOn:record.occurred_on,evidenceFingerprint:hash('sha256',`${record.id}:${decision.id}:${signed}`)})}
 if(!items.length)continue
 const period=await admin.from('bookkeeping_review_periods').insert({business_id:business.id,period_start:start,period_end:end,check_in_date:checkIn,
  cadence_event_id:cadenceRow.data.id,membership_scope:'business',model_version:1}).select('id').single();if(period.error)die(`Review period failed: ${period.error.message}`)
 const opened=await admin.from('bookkeeping_review_period_events').insert({business_id:business.id,review_period_id:period.data.id,sequence_number:1,event_type:'opened',provenance:'system'}).select('id').single()
 const snapshot=await admin.rpc('present_bookkeeping_weekly_review',{p_business_id:business.id,p_review_period_id:period.data.id,p_expected_event_id:opened.data.id,
  p_membership_scope:'business',p_currency:'USD',p_income_cents:income,p_expense_cents:expenses,p_unresolved_question_count:0,
  p_activity_fingerprint:hash('sha256',JSON.stringify(items.map(x=>[x.bookkeepingRecordId,x.bookkeepingDecisionId,x.signedBusinessAmountCents]))),p_items:items})
 if(snapshot.error)die(`Review snapshot failed: ${snapshot.error.message}`)
 const presented=await admin.from('bookkeeping_review_period_events').select('id').eq('review_period_id',period.data.id).eq('event_type','presented').single()
 if(outcome==='closed_unreviewed'){const closed=await admin.from('bookkeeping_review_period_events').insert({business_id:business.id,review_period_id:period.data.id,
   supersedes_event_id:presented.data.id,sequence_number:3,event_type:'closed_unreviewed',review_snapshot_id:snapshot.data,provenance:'system'});if(closed.error)die(`Unreviewed close failed: ${closed.error.message}`)}
 if(outcome==='confirmed'){const confirmed=await customer.rpc('append_customer_review_period_event',{p_review_period_id:period.data.id,p_expected_event_id:presented.data.id,
   p_event_type:'confirmed',p_review_snapshot_id:snapshot.data,p_deferred_until:null,p_request_id:randomUUID()});if(confirmed.error)die(`Review confirmation failed: ${confirmed.error.message}`)}
 if(outcome==='corrected'){const target=items.find(x=>x.activityRole==='expense')??items[0],prior=currentReviewDecision.get(target.bookkeepingRecordId),priorAllocations=allocationsByDecision.get(prior.id)??[]
  const correctionRequest=randomUUID(),corrected=await customer.rpc('append_bookkeeping_decision',{p_business_id:business.id,p_bookkeeping_record_id:target.bookkeepingRecordId,
   p_expected_current_decision_id:prior.id,p_bookkeeping_nature:prior.bookkeeping_nature,p_treatment:prior.treatment,p_review_status:'resolved',p_provenance:'user',p_confidence:null,
   p_reason:'Customer clarified the purchase during weekly review.',p_business_purpose:'Client listing and showing work',p_allocations:priorAllocations.map(a=>({kind:a.allocation_kind,amount_cents:Number(a.amount_cents)}))})
  if(corrected.error)die(`Review correction failed: ${corrected.error.message}`)
  const linked=await customer.rpc('link_weekly_review_correction',{p_review_period_id:period.data.id,p_review_snapshot_id:snapshot.data,p_expected_review_event_id:presented.data.id,
   p_prior_decision_id:prior.id,p_resulting_decision_id:corrected.data,p_correction_request_id:correctionRequest});if(linked.error)die(`Correction link failed: ${linked.error.message}`)
  const correctionEvent=await admin.from('bookkeeping_review_period_events').select('id').eq('review_period_id',period.data.id).eq('event_type','correction_linked').single()
  const confirmed=await customer.rpc('append_customer_review_period_event',{p_review_period_id:period.data.id,p_expected_event_id:correctionEvent.data.id,p_event_type:'confirmed',
   p_review_snapshot_id:snapshot.data,p_deferred_until:null,p_request_id:randomUUID()});if(confirmed.error)die(`Corrected review confirmation failed: ${confirmed.error.message}`)}
}
const finalDecisions=await admin.from('bookkeeping_decisions').select('id,bookkeeping_record_id,supersedes_decision_id,bookkeeping_nature,treatment').eq('business_id',business.id)
const finalAllocations=await admin.from('bookkeeping_allocations').select('bookkeeping_decision_id,allocation_kind,amount_cents').eq('business_id',business.id)
const finalSuperseded=new Set(finalDecisions.data.map(x=>x.supersedes_decision_id).filter(Boolean)),finalLeaves=finalDecisions.data.filter(x=>!finalSuperseded.has(x.id))
const finalAllocByDecision=new Map();for(const a of finalAllocations.data)finalAllocByDecision.set(a.bookkeeping_decision_id,[...(finalAllocByDecision.get(a.bookkeeping_decision_id)??[]),a])
let incomeCents=0,expenseCents=0;const potential=new Set(),personalRecords=new Set(),unresolvedRecords=new Set(),recordDate=new Map(allRecords.data.map(r=>[r.id,r.occurred_on]))
for(const d of finalLeaves){const businessCents=(finalAllocByDecision.get(d.id)??[]).filter(a=>a.allocation_kind==='business').reduce((sum,a)=>sum+Number(a.amount_cents),0)
 if(recordDate.get(d.bookkeeping_record_id)>'2026-08-26')continue
 if(d.bookkeeping_nature==='business_income'&&d.treatment==='business')incomeCents+=businessCents
 if(d.bookkeeping_nature==='expense'&&['business','mixed_use'].includes(d.treatment)&&businessCents<0){potential.add(d.bookkeeping_record_id);expenseCents-=businessCents}
 if(d.treatment==='personal')personalRecords.add(d.bookkeeping_record_id);if(d.treatment==='unresolved')unresolvedRecords.add(d.bookkeeping_record_id)}
const documentation=await admin.from('bookkeeping_document_links').select('bookkeeping_record_id').eq('business_id',business.id).is('revoked_at',null)
const documented=new Set((documentation.data??[]).map(x=>x.bookkeeping_record_id).filter(id=>potential.has(id)))
const receiptOnly=new Set(allRecords.data.filter(r=>potential.has(r.id)&&!sourceByRecord.has(r.id)).map(r=>r.id))
const reviewPeriods=await admin.from('bookkeeping_review_periods').select('id,check_in_date').eq('business_id',business.id).order('check_in_date')
const reviewStates=[];for(const p of reviewPeriods.data??[]){const leaf=await admin.from('bookkeeping_review_period_events').select('event_type').eq('review_period_id',p.id).order('sequence_number',{ascending:false}).limit(1).single();reviewStates.push({checkInDate:p.check_in_date,state:leaf.data.event_type})}
console.log(JSON.stringify({businessId:business.id,financialTransactions:transactions.data.length,importedIncomeRecords:counts.income,
 establishedBusinessExpenses:potential.size,personalTransactions:personalRecords.size,mixedUseTransactions:finalLeaves.filter(d=>d.treatment==='mixed_use').length,
 unresolvedTransactions:unresolvedRecords.size,openQuestions:Math.min(unresolved.length,18),potentialWriteoffs:potential.size,
 documentedExpenses:documented.size,undocumentedExpenses:potential.size-documented.size,receiptOnlyExpenses:receiptOnly.size,
 mileageEntries:54,mileageMiles:+(milesMilli/1000).toFixed(1),mileageTaxTreatment:'facts_only',invoices:5,weeklyReviews:reviewStates,
 ytdIncomeCents:incomeCents,ytdBusinessExpenseCents:expenseCents,ytdEstimatedProfitCents:incomeCents-expenseCents},null,2))
