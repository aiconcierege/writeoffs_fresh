/** Isolated synthetic staging learned-fact integration. No frozen owners. */
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {createHmac} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {prepareCsvFinancialRows,ingestCsvFinancialActivity} from '../app/lib/bookkeeping/csv-ingestion'
import {evaluateBookkeepingProcessingJob} from '../app/lib/bookkeeping/processing'
import {loadBookkeepingEvaluationSnapshot} from '../app/lib/bookkeeping/evaluation-snapshot'
import {runDeductionIntelligenceForRecord} from '../app/lib/bookkeeping/deduction-intelligence'
function totp(secret:string){const abc='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bits=[...secret.replace(/=+$/,'').toUpperCase()].map(c=>abc.indexOf(c).toString(2).padStart(5,'0')).join(''),key=Buffer.from(Array.from({length:Math.floor(bits.length/8)},(_,i)=>parseInt(bits.slice(i*8,i*8+8),2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=createHmac('sha1',key).update(counter).digest(),o=h.at(-1)!&15;return String((h.readUInt32BE(o)&0x7fffffff)%1000000).padStart(6,'0')}

async function main(){
 process.umask(0o077)
 const dir='/private/tmp/writeoffs-routing-catchup-v2-learned',f=JSON.parse(await readFile(dir+'/fixture.json','utf8'))
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!,anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
 assert.equal(new URL(url).hostname,'sgrqrrxrlglhjuetdtps.supabase.co');assert.equal(process.env.WRITEOFFS_ENVIRONMENT,'staging')
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
 assert.equal((await admin.auth.admin.getUserById(f.userId)).data.user?.user_metadata.synthetic_t1_routing,true)
 assert(!['d785186b-16db-47e5-ab02-e59fd1ae311b','2c0ddbb3-6650-42a4-aafa-3685f7efe288'].includes(f.businessId))
 const db=createClient(url,anon,{auth:{persistSession:false}})
 assert(!(await db.auth.signInWithPassword({email:f.email,password:f.password})).error)
 assert(!(await db.auth.mfa.challengeAndVerify({factorId:f.factorId,code:totp(f.totpSecret)})).error)
 const empty=await db.from('financial_transactions').select('id',{count:'exact',head:true}).eq('business_id',f.businessId);assert.equal(empty.count,0,'NEW_SYNTHETIC_FIXTURE_REQUIRED')
 const rows=prepareCsvFinancialRows({mapping:{date:'date',description:'description',amount:'amount'},rows:[
  {date:'2026-08-08',description:'VERIZON WIRELESS MONTHLY SERVICE',amount:'-140.00'},
  {date:'2026-09-08',description:'VERIZON WIRELESS MONTHLY SERVICE',amount:'-140.00'}]}).rows
 assert.equal((await ingestCsvFinancialActivity({supabase:db,rows})).processed,2)
 const accounts=await db.from('financial_accounts').select('id').eq('business_id',f.businessId);assert.equal(accounts.data?.length,1)
 assert(!(await db.rpc('set_financial_account_use',{p_financial_account_id:accounts.data![0].id,p_designation:'business_only',p_effective_at:new Date().toISOString(),p_request_id:crypto.randomUUID()})).error)
 const records=(await db.from('bookkeeping_records').select('id').eq('business_id',f.businessId).order('occurred_on')).data!;assert.equal(records.length,2)
 const snapshot=(id:string)=>loadBookkeepingEvaluationSnapshot({admin,businessId:f.businessId,recordId:id})
 const evaluate=(id:string)=>evaluateBookkeepingProcessingJob(admin,{business_id:f.businessId,bookkeeping_record_id:id,processing_reason:'deterministic_evaluation',target_fingerprint:`bookkeeping-evaluator:v2:record:${id}`},{allowAiShadow:false})
 await evaluate(records[0].id)
 const attention=await db.from('current_deduction_attentions').select('id,attention_id').eq('business_id',f.businessId).eq('fact_type','phone_business_use_percentage').single();assert(attention.data&&!attention.error,'PERCENTAGE_QUESTION_REQUIRED')
 const answer=await db.rpc('answer_deduction_attention',{p_attention_id:attention.data.attention_id,p_expected_event_id:attention.data.id,p_value:70,p_request_key:crypto.randomUUID()});assert(!answer.error,'PERCENTAGE_SAVE_FAILED')
 await runDeductionIntelligenceForRecord({admin,writer:db,customerAnsweredFact:true,snapshot:await snapshot(records[0].id)})
 await evaluate(records[1].id)
 for(const r of records){const s=await snapshot(r.id);assert.equal(s.currentDecision.allocations.find(a=>a.kind==='business')?.amountCents,-9800);assert.equal(s.currentDecision.allocations.find(a=>a.kind==='personal')?.amountCents,-4200)}
 const fact=await db.from('current_deduction_business_facts').select('*').eq('business_id',f.businessId).eq('fact_type','phone_business_use_percentage').single();assert(fact.data&&!fact.error)
 const correction=await db.rpc('record_deduction_business_fact',{p_fact_type:fact.data.fact_type,p_scope_kind:fact.data.scope_kind,p_scope_key:fact.data.scope_key,p_value:50,p_effective_on:'2026-09-24',p_expected_current_event_id:fact.data.id,p_source:'correction',p_reason:'Synthetic customer corrected phone use.',p_request_key:crypto.randomUUID()});assert(!correction.error)
 for(const r of records){await runDeductionIntelligenceForRecord({admin,snapshot:await snapshot(r.id)});assert.equal((await snapshot(r.id)).currentDecision.allocations.find(a=>a.kind==='business')?.amountCents,-7000)}
 const before=await snapshot(records[1].id)
 const opened=await admin.rpc('open_bookkeeping_review_issue_v2',{p_business_id:f.businessId,p_bookkeeping_record_id:records[1].id,p_based_on_decision_id:before.currentDecision.id,p_reason:'CONFLICTING_EVIDENCE',p_issue_key:'synthetic-conflict:'+crypto.randomUUID(),p_context_fingerprint:'synthetic-conflict',p_question_context:{schemaVersion:1,reason:'CONFLICTING_EVIDENCE'}});assert(!opened.error)
 const conflicting=await snapshot(records[1].id);assert(conflicting.hasOpenConflictingEvidence)
 assert.equal((await runDeductionIntelligenceForRecord({admin,snapshot:conflicting})).outcome,'conflicting_evidence')
 assert.equal((await snapshot(records[1].id)).currentDecision.id,before.currentDecision.id)
 const result={passed:true,synthetic:true,recurringRecords:2,oneCustomerPercentageReused:true,initialBusinessCentsPerBill:9800,correctedBusinessCentsPerBill:7000,conflictBlocksAutomaticReuse:true,sourceTransactionsUnchanged:(await db.from('financial_transactions').select('id',{count:'exact',head:true}).eq('business_id',f.businessId)).count===2}
 await writeFile(dir+'/learned-percentage.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result))
}
main().catch(e=>{console.error(e instanceof Error?e.message:'LEARNED_FACT_TEST_FAILED');process.exitCode=1})
