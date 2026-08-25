import {createClient} from '@supabase/supabase-js'
const [businessId,plan,endsAt]=process.argv.slice(2)
if(!/^[0-9a-f-]{36}$/i.test(businessId??'')||!['expenses','business'].includes(plan)){console.error('Usage: npm run grant:membership -- <business-uuid> <expenses|business> [ISO-end]');process.exit(2)}
const url=process.env.SUPABASE_URL??process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY
if(!url||!key||(!url.includes('127.0.0.1')&&!url.includes('localhost'))){console.error('Local Supabase service configuration is required.');process.exit(2)}
const client=createClient(url,key,{auth:{persistSession:false}}),requestKey=`local:${businessId}:${plan}:${Date.now()}`
const result=await client.rpc('create_business_membership_grant',{p_business_id:businessId,p_plan:plan,p_starts_at:new Date().toISOString(),p_ends_at:endsAt??null,p_request_key:requestKey,p_reason:'Explicit local development membership access.',p_provenance:'local_setup',p_actor_user_id:null})
if(result.error){console.error('The local membership grant could not be created.');process.exit(1)}
console.log(`Granted ${plan} membership to local Business ${businessId}.`)
