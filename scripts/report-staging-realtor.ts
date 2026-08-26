import{createClient}from'@supabase/supabase-js'
import{SupabaseCanonicalFinancialSummaryRepository}from'../app/lib/bookkeeping/financial-summary-repository'
import{aggregateCanonicalFinancialSummary}from'../app/lib/bookkeeping/financial-summary'
import{selectPotentialWriteoffs}from'../app/lib/bookkeeping/potential-writeoffs'
import{listCustomerQuestions}from'../app/lib/bookkeeping/customer-questions'

const need=(name:string)=>process.env[name]?.trim()||(()=>{throw new Error(`${name} is required`)})()
if(need('WRITEOFFS_ENVIRONMENT')!=='staging')throw new Error('staging only')
const url=need('SUPABASE_URL'),email=need('WRITEOFFS_STAGING_FIXTURE_EMAIL').toLowerCase()
if(new URL(url).host!==need('WRITEOFFS_EXPECTED_SUPABASE_HOST'))throw new Error('staging host mismatch')
if(!new Set(need('WRITEOFFS_STAGING_TEST_USERS').split(',').map(v=>v.trim().toLowerCase())).has(email))throw new Error('user is not designated')
const client=createClient(url,need('NEXT_PUBLIC_SUPABASE_ANON_KEY'),{auth:{persistSession:false}})
const auth=await client.auth.signInWithPassword({email,password:need('WRITEOFFS_STAGING_TEST_PASSWORD')});if(auth.error)throw auth.error
const businesses=await client.from('businesses').select('id');if(businesses.error||businesses.data.length!==1)throw new Error('RLS Business boundary failed')
const businessId=businesses.data[0].id,repository=new SupabaseCanonicalFinancialSummaryRepository(client),asOf=new Date().toISOString().slice(0,10)
const loaded=await repository.loadRecords({businessId,periodStart:'2026-01-01',periodEnd:asOf})
const summary=aggregateCanonicalFinancialSummary({records:loaded.records,periodStart:'2026-01-01',periodEnd:asOf,currency:'USD',unresolvedCustomerQuestionCount:0})
const potential=selectPotentialWriteoffs({records:loaded.records,periodStart:'2026-01-01',periodEnd:asOf})
const questions=await listCustomerQuestions({supabase:client,scope:'business'})
console.log(JSON.stringify({visibleBusinesses:businesses.data.length,currentCanonicalRecords:loaded.records.length,potentialWriteoffs:potential.length,
 customerQuestions:questions.length,businessIncomeCents:summary.businessIncomeCents,businessExpensesCents:summary.businessExpensesCents,
 estimatedProfitCents:summary.businessProfitCents,unresolvedCurrentRecords:summary.completeness.unresolvedRecordCount},null,2))
