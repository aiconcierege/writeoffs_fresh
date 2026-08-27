import{createClient}from'@supabase/supabase-js'
import{prepareWeeklyReviews}from'../app/lib/bookkeeping/weekly-review-processing'
import{validateStagingReviewOpener}from'./lib/staging-review-opener-safety'

const argument=(name:string)=>{const index=process.argv.indexOf(name);return index<0?undefined:process.argv[index+1]}
async function main(){
const safety=validateStagingReviewOpener({environment:process.env.WRITEOFFS_ENVIRONMENT,
 url:process.env.SUPABASE_URL??process.env.NEXT_PUBLIC_SUPABASE_URL,
 expectedHost:process.env.WRITEOFFS_EXPECTED_SUPABASE_HOST,email:argument('--email'),
 allowlist:process.env.WRITEOFFS_STAGING_TEST_USERS,asOf:argument('--as-of')})
if(!process.argv.includes('--confirm-open'))throw new Error('Pass --confirm-open after verifying the staging identity and review date.')
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!key)throw new Error('The staging service-role credential is unavailable.')
const admin=createClient(process.env.SUPABASE_URL!,key,{auth:{persistSession:false,autoRefreshToken:false}})
let designated=null
for(let page=1;page<=100&&!designated;page+=1){
 const result=await admin.auth.admin.listUsers({page,perPage:100});if(result.error)throw result.error
 designated=result.data.users.find(user=>user.email?.toLowerCase()===safety.email)??null
 if(result.data.users.length<100)break
}
if(!designated||designated.user_metadata?.staging_test_user!==true)throw new Error('The designated staging Auth identity was not found or marked for reusable testing.')
const business=await admin.from('businesses').select('id').eq('owner_user_id',designated.id).single()
if(business.error)throw new Error('The designated staging Business could not be resolved.')
const before=await admin.from('bookkeeping_review_periods').select('id,event:bookkeeping_review_period_events(id,event_type,sequence_number)')
 .eq('business_id',business.data.id)
if(before.error)throw before.error
const immutableBefore=new Map(before.data.flatMap(period=>(period.event??[])
 .filter(event=>['presented','confirmed','closed_unreviewed'].includes(event.event_type))
 .map(event=>[event.id,`${event.event_type}:${event.sequence_number}`])))
const result=await prepareWeeklyReviews({admin,asOf:safety.asOf,businessId:business.data.id,limit:1})
const after=await admin.from('bookkeeping_review_periods').select('id,event:bookkeeping_review_period_events(id,event_type,sequence_number)')
 .eq('business_id',business.data.id)
if(after.error)throw after.error
const immutableAfter=new Map(after.data.flatMap(period=>(period.event??[])
 .filter(event=>immutableBefore.has(event.id)).map(event=>[event.id,`${event.event_type}:${event.sequence_number}`])))
for(const[id,state]of immutableBefore)if(immutableAfter.get(id)!==state)throw new Error('A historical immutable review event changed unexpectedly.')
console.log(JSON.stringify({status:'ok',asOf:safety.asOf,opened:result.opened,presented:result.presented,waiting:result.waiting}))
}
main().catch(error=>{console.error(`Staging weekly-review opener failed: ${error instanceof Error?error.message:'unknown error'}`);process.exitCode=1})
