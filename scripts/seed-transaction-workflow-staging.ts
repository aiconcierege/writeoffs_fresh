// Isolated synthetic fixtures only. Never finds or modifies an existing customer.
import assert from 'node:assert/strict'
import {writeFile} from 'node:fs/promises'
import {createHmac,randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {SupabaseBookkeepingRepository} from '../app/lib/bookkeeping/supabase-repository'
async function main(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!
 assert(process.env.WRITEOFFS_ENVIRONMENT==='staging'&&new URL(url).hostname==='sgrqrrxrlglhjuetdtps.supabase.co')
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
 const fixtures=[]
 for(const tenant of ['a','b']){
  const nonce=randomUUID(),email=`workflow-${tenant}-${nonce}@staging.writeoffs.invalid`,password=`Proof-${nonce}!`
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{synthetic_workflow:true}});assert(!created.error&&created.data.user)
  const userId=created.data.user.id,customer=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false}})
  assert(!(await customer.auth.signInWithPassword({email,password})).error)
  const b=await customer.from('businesses').select('id').single();assert(b.data);const businessId=b.data.id
  assert(!(await admin.rpc('create_business_membership_grant',{p_business_id:businessId,p_plan:'business',p_starts_at:'2025-01-01T00:00:00Z',p_ends_at:null,p_request_key:`workflow:${nonce}`,p_reason:'Isolated decision foundation certification',p_provenance:'admin',p_actor_user_id:null})).error)
  assert(!(await admin.from('business_customer_setup').upsert({business_id:businessId,joined_month:'2026-09-01',grandfathered_start_date:'2026-05-01',completed_at:new Date().toISOString(),timezone_name:'America/Phoenix'})).error)
  assert(!(await admin.from('businesses').update({name:`Workflow Test Studio ${tenant.toUpperCase()}`,business_description:'Independent design consulting',business_profile_context:'general',schedule_c_eligibility:'yes',business_stage:'existing',business_start_month:'2024-01-01',uses_customer_job_materials:'no',keeps_future_sale_merchandise:'no',catch_up_start_date:'2026-05-01',onboarding_start_method:'receipts',onboarding_state:'completed',onboarding_version:3,onboarding_completed_at:new Date().toISOString()}).eq('id',businessId)).error)
  const enrollment=await customer.auth.mfa.enroll({factorType:'totp',friendlyName:`Receipt proof ${Date.now()}`});assert(enrollment.data&&!enrollment.error)
  const secret=enrollment.data.totp.secret,alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bits=[...secret.replace(/=+$/,'').toUpperCase()].map(c=>alphabet.indexOf(c).toString(2).padStart(5,'0')).join('')
  const key=Buffer.from(Array.from({length:Math.floor(bits.length/8)},(_,i)=>parseInt(bits.slice(i*8,i*8+8),2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)))
  const hash=createHmac('sha1',key).update(counter).digest(),offset=hash.at(-1)!&15,code=String((hash.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0')
  assert(!(await customer.auth.mfa.challengeAndVerify({factorId:enrollment.data.id,code})).error)
  const account=await admin.from('financial_accounts').insert({business_id:businessId,institution_name:'Synthetic receipt test bank',provider:'statement',provider_account_id:`workflow:${nonce}`,display_name:'Statement checking',account_type:'checking',currency:'USD'}).select('id').single();assert(account.data)

  const trusted=new SupabaseBookkeepingRepository(admin),writer=new SupabaseBookkeepingRepository(customer),records=[]
  const cases:Array<[string,number,string]>=tenant==='a'?[['ADOBE CREATIVE CLOUD',-2299,'2026-05-03'],['OFFICE DEPOT',-6419,'2026-05-12'],['FUN',-8940,'2026-05-07'],['VERIZON',-14628,'2026-05-08'],['KNOWN RESTAURANT MEAL',-433,'2026-05-09'],['REFUND - OFFICE DEPOT',3210,'2026-05-28'],['ZELLE FROM ROBERT HALL',42500,'2026-05-07'],['ACH PAYMENT - BUSINESS CREDIT CARD 3333',-128437,'2026-05-10'],['EQUIPMENT LOAN PAYMENT',-45000,'2026-05-15'],['PERSONAL TEST PURCHASE',-10000,'2026-05-16'],['MIXED TEST PURCHASE',-20000,'2026-05-17']]:[]
  for(const [merchant,amount,day] of cases){const amountCents=Number(amount),occurredOn=String(day),fingerprint=`workflow:${randomUUID()}`
   const f=await admin.from('financial_transactions').insert({business_id:businessId,financial_account_id:account.data.id,source_fingerprint:fingerprint,import_method:'csv',merchant_name:String(merchant),original_description:String(merchant),amount_cents:amountCents,currency:'USD',transaction_date:occurredOn}).select('id').single();assert(f.data)
   const record=await trusted.ensureRecord({actor:{businessId,userId:null,provenance:'automation'},record:{sourceKind:'financial_transaction',financialTransactionId:f.data.id,ingestionKey:fingerprint,amountCents,currency:'USD',occurredOn}})
   await trusted.attachFinancialSource({actor:{businessId,userId:null,provenance:'automation'},recordId:record.id,financialTransactionId:f.data.id})
   const initial=await writer.ensureInitialUnresolvedDecision(businessId,record.id)
   const decision=merchant==='FUN'?await writer.appendDecision({actor:{businessId,userId,provenance:'user'},record,supersedesDecisionId:initial.id,decision:{bookkeepingNature:'expense',treatment:'business',reviewStatus:'needs_review',provenance:'user',reason:'Isolated fixture prior factual answer.',businessPurpose:'I bought paper from a store called Fun.',allocations:[{kind:'business',amountCents}]}}):initial
   records.push({merchant,amountCents,occurredOn,recordId:record.id,decisionId:decision.id,transactionId:f.data.id})
  }
  fixtures.push({userId,businessId,email,password,factorId:enrollment.data.id,totpSecret:secret,accountId:account.data.id,records})
  await customer.auth.signOut()
 }
 await writeFile('/private/tmp/writeoffs-workflow/fixtures.json',JSON.stringify(fixtures),{mode:0o600})
 console.log('Created two isolated foundation tenants; statement account use remains unknown.')
}
main().catch(()=>{console.error('MONEY_IN_FIXTURE_SETUP_FAILED');process.exitCode=1})
