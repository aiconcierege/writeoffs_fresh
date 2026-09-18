// Real dedicated-staging scope contract. Only explicitly marked isolated tenants are mutable.
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHmac,randomUUID} from 'node:crypto'
import {createServerClient} from '@supabase/ssr'
import {createClient} from '@supabase/supabase-js'
import {chromium} from '@playwright/test'
const origin=process.env.CERTIFICATION_ORIGIN??'https://writeoffs-fresh-staging.vercel.app'
assert(/^https:\/\/writeoffs-fresh-staging(?:-[a-z0-9-]+)?\.vercel\.app$/.test(origin))
const dir='/private/tmp/writeoffs-scope-repair',url=process.env.NEXT_PUBLIC_SUPABASE_URL
assert(process.env.WRITEOFFS_ENVIRONMENT==='staging'&&new URL(url).hostname==='sgrqrrxrlglhjuetdtps.supabase.co')
assert(process.argv.includes('--certify'),'Explicit certification flag required')
await mkdir(`${dir}/browser`,{recursive:true})
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
function totp(secret){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bits=[...secret.replace(/=+$/,'').toUpperCase()].map(c=>alphabet.indexOf(c).toString(2).padStart(5,'0')).join(''),key=Buffer.from(Array.from({length:Math.floor(bits.length/8)},(_,i)=>parseInt(bits.slice(i*8,i*8+8),2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const hash=createHmac('sha1',key).update(counter).digest(),offset=hash.at(-1)&15;return String((hash.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0')}
async function session(f,browser){const cookies=new Map(),client=createServerClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>cookies.set(name,value))}});assert(!(await client.auth.signInWithPassword({email:f.email,password:f.password})).error);assert(!(await client.auth.mfa.challengeAndVerify({factorId:f.factorId,code:totp(f.totpSecret)})).error);const context=await browser.newContext({viewport:{width:1280,height:900},timezoneId:'America/Phoenix'});await context.addCookies([...cookies].map(([name,value])=>({name,value,domain:new URL(origin).hostname,path:'/',secure:true,sameSite:'Lax'})));const jar=await readFile(`${dir}/candidate-cookie.txt`,'utf8').catch(()=>'');for(const line of jar.split('\n')){if(!line.includes('\t'))continue;const parts=line.replace(/^#HttpOnly_/,'').split('\t');if(parts[0]===new URL(origin).hostname)await context.addCookies([{domain:parts[0],path:parts[2],secure:parts[3]==='TRUE',name:parts[5],value:parts[6],httpOnly:true,sameSite:'None'}])}return{context,client}}


const fixtures=JSON.parse(await readFile(`${dir}/fixtures.json`,'utf8')),a=fixtures.find(f=>f.scenario==='A'),b=fixtures.find(f=>f.scenario==='B')
for(const f of[a,b])assert.equal((await admin.auth.admin.getUserById(f.userId)).data.user?.user_metadata.synthetic_scope_contract,true)
const browser=await chromium.launch({headless:true})
try{
 const{context,client}=await session(b,browser),page=await context.newPage()
 const tables=['bookkeeping_decisions','bookkeeping_review_events','bookkeeping_document_links','financial_account_use_events']
 const snapshot=async()=>{const results={};for(const table of tables){const r=await admin.from(table).select('*').eq('business_id',b.businessId).order('id');assert(!r.error);results[table]=JSON.stringify(r.data)}return results}
 const before=await snapshot()
 assert((await client.rpc('read_authorized_bookkeeping_scope',{p_business_id:a.businessId})).error)
 assert.deepEqual((await client.from('active_bookkeeping_records').select('id').eq('business_id',a.businessId)).data,[])
 const account=await admin.from('financial_accounts').select('id').eq('business_id',a.businessId).single();assert(account.data)
 const denied=await context.request.post(origin+`/api/bookkeeping/accounts/${account.data.id}/use`,{data:{designation:'business_only',effectiveAt:new Date().toISOString(),requestId:randomUUID()}});assert.equal(denied.status(),400)
 const old=await admin.from('bookkeeping_review_events').select('id,review_issue_id').eq('business_id',b.businessId).eq('event_type','opened').limit(1).maybeSingle()
 if(old.data){const r=await context.request.post(origin+`/api/bookkeeping/questions/${old.data.review_issue_id}`,{headers:{'if-match':old.data.id},data:{action:'business_use',use:'business'}});assert.equal(r.status(),409)}
 for(const path of ['/home','/check-in','/transactions','/reports']){await page.goto(origin+path);assert.equal(new URL(page.url()).pathname,path)}
 for(const path of ['/api/bookkeeping/work','/api/bookkeeping/questions','/api/transactions/list?year=all','/api/reports/summary'])assert.equal((await context.request.get(origin+path)).status(),200)
 assert.deepEqual(await snapshot(),before,'GET/render or rejected actions changed canonical facts')
 const aa=await admin.from('financial_account_use_events').select('id',{count:'exact',head:true}).eq('business_id',a.businessId);assert.equal(aa.count,0)
 await writeFile(`${dir}/browser/security.json`,JSON.stringify({tenantIsolation:true,rejectedForeignAccountAnswer:true,staleQuestionRejected:Boolean(old.data),readOnlyRender:true},null,2))
 console.log('Synthetic tenant, stale-question and read-only cross-surface checks passed')
 await context.close()
}finally{await browser.close()}
