// Real Plaid Sandbox -> public dedicated staging. Credentials stay in private artifacts.
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHmac } from 'node:crypto'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { chromium } from '@playwright/test'
process.loadEnvFile('.env.staging.local')
assert.equal(new URL(process.env.SUPABASE_URL).hostname, 'sgrqrrxrlglhjuetdtps.supabase.co')
assert.equal(process.env.PLAID_ENV, 'sandbox')
assert(process.argv.includes('--certify'))
const origin = process.argv.includes('--local-home') ? 'http://localhost:3107' : 'https://writeoffs-fresh-staging.vercel.app'
const webhook = `${origin}/api/plaid/webhook`
const sandboxPassword = JSON.stringify({override_accounts:[{type:'depository',subtype:'checking',starting_balance:1000,currency:'USD',transactions:[{date_transacted:'2026-09-20',date_posted:'2026-09-20',amount:42.19,description:'CERT OFFICE SUPPLIES'},{date_transacted:'2026-09-19',date_posted:'2026-09-19',amount:-2100,description:'ACH CREDIT CLIENT PAYMENT'}]}]})
const dir = '/private/tmp/writeoffs-plaid-update-mode'
await mkdir(dir, { recursive: true, mode: 0o700 })
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const bits = [...secret.replace(/=+$/, '').toUpperCase()].map(c => alphabet.indexOf(c).toString(2).padStart(5, '0')).join('')
  const key = Buffer.from(Array.from({ length: Math.floor(bits.length / 8) }, (_, i) => parseInt(bits.slice(i * 8, i * 8 + 8), 2)))
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)))
  const hash = createHmac('sha1', key).update(counter).digest(), offset = hash.at(-1) & 15
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0')
}
async function plaid(path, data) {
  const response = await fetch(`https://sandbox.plaid.com${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: process.env.PLAID_CLIENT_ID, secret: process.env.PLAID_SANDBOX_SECRET, ...data }), signal: AbortSignal.timeout(30000) })
  const body = await response.json()
  if (!response.ok) throw new Error(`Plaid ${response.status}: ${body.error_code ?? 'unavailable'}`)
  return body
}
async function session(fixture) {
  const user = (await admin.auth.admin.getUserById(fixture.userId)).data.user
  assert(user?.user_metadata.synthetic_ux1 === true || user?.user_metadata.synthetic_guided_contract === true)
  const cookies = new Map()
  const client = createServerClient(process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: {
    getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
    setAll: values => values.forEach(({ name, value }) => cookies.set(name, value)),
  } })
  assert(!(await client.auth.signInWithPassword({ email: fixture.email, password: fixture.password })).error, 'Synthetic login')
  assert(!(await client.auth.mfa.challengeAndVerify({ factorId: fixture.factorId, code: totp(fixture.totpSecret) })).error, 'MFA verification')
  const post = async (path, body) => {
    const start = performance.now()
    const response = await fetch(`${origin}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) })
    const data = await response.json()
    assert(response.ok, `${path} HTTP ${response.status}: ${data.error ?? 'unavailable'}`)
    return { data, status: response.status, ms: Math.round(performance.now() - start) }
  }
  return Object.assign(post, { cookies, client })
}

try {
  let f = await readFile(`${dir}/fixture-private.json`,'utf8').then(JSON.parse).catch(()=>null)
  if(!f){
    assert(process.argv.includes('--provision'))
    const nonce=crypto.randomUUID(),email=`plaid-completion-${nonce}@staging.writeoffs.invalid`,password=`Proof-${nonce}!`
    const made=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{synthetic_guided_contract:true,synthetic_plaid_completion:true}})
    assert(!made.error&&made.data.user)
    const userId=made.data.user.id,customer=createClient(process.env.SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}})
    assert(!(await customer.auth.signInWithPassword({email,password})).error)
    const b=await admin.from('businesses').select('id').eq('owner_user_id',userId).single();assert(b.data,'Synthetic business provisioning missing');const businessId=b.data.id
    assert(!(await admin.rpc('create_business_membership_grant',{p_business_id:businessId,p_plan:'business',p_starts_at:new Date().toISOString(),p_ends_at:null,p_request_key:`plaid-cert:${nonce}`,p_reason:'Isolated Transactions certification',p_provenance:'admin',p_actor_user_id:null})).error)
    const enrolled=await customer.auth.mfa.enroll({factorType:'totp',friendlyName:'Transactions certification'});assert(enrolled.data&&!enrolled.error)
    const totpSecret=enrolled.data.totp.secret,factorId=enrolled.data.id
    assert(!(await customer.auth.mfa.challengeAndVerify({factorId,code:totp(totpSecret)})).error)
    f={email,password,userId,businessId,totpSecret,factorId};await writeFile(`${dir}/fixture-private.json`,JSON.stringify(f),{mode:0o600})
    const post=await session(f)
    const patch=async(step,data)=>{const r=await fetch(`${origin}/api/onboarding/business`,{method:'PATCH',headers:{'Content-Type':'application/json',Cookie:[...post.cookies].map(([k,v])=>`${k}=${v}`).join('; ')},body:JSON.stringify({step,data,request_id:crypto.randomUUID(),expected_fact_event_ids:{}})});assert(r.ok,`Onboarding ${step} HTTP ${r.status}`)}
    await patch('business',{business_description:'Independent consulting business'})
    await patch('eligibility',{schedule_c_eligibility:'yes'})
    await patch('history',{business_stage:'existing',business_start_month:'2023-01'})
    await patch('operations',{uses_customer_job_materials:'no',keeps_future_sale_merchandise:'no',schedule_c_eligibility:'yes'})
    assert(!(await admin.from('business_customer_setup').upsert({business_id:businessId,joined_month:'2026-09-01',grandfathered_start_date:'2024-01-01'})).error)
    await post('/api/onboarding/catch-up',{startMonth:'2024-01',agreed:true})
    await patch('starting_method',{onboarding_start_method:'connected_financial_accounts'})
    assert(!(await admin.from('business_customer_setup').upsert({business_id:businessId,joined_month:'2026-09-01',grandfathered_start_date:'2024-01-01'})).error)
    await post('/api/onboarding/complete',{timezone:'America/Phoenix'})
    console.log(JSON.stringify({syntheticCustomerCreated:true,businessId}))
  }

 if(process.argv.includes('--provision'))process.exit(0)

 const bank=process.argv.includes('--bank=B')?'B':'A'
 if(process.argv.includes('--create')) {
    const post = await session(f)
    const link = await post('/api/plaid/link-token', {})
    const linkMetadata = await plaid('/link/token/get', { link_token: link.data.linkToken })
    assert.equal(linkMetadata.webhook ?? linkMetadata.metadata?.webhook, webhook)
    // Return only webhook configuration, never tokens or provider response bodies.
    console.log(JSON.stringify({ linkTokenStatus: link.status, configuredWebhook: linkMetadata.webhook ?? linkMetadata.metadata?.webhook ?? 'not returned by provider' }))
    // NEW_ACCOUNTS_AVAILABLE requires an Item created with Link Account Select.
    // The Sandbox public_token shortcut cannot certify this webhook.
    const browser = await chromium.launch({ headless: true })
    let exchanged
    try {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
      await context.addCookies([...post.cookies].map(([name, value]) => ({ name, value, domain: new URL(origin).hostname, path: '/', secure: true, sameSite: 'Lax' })))
      const page = await context.newPage()
      await page.goto(`${origin}/settings/banking`)
      await page.getByRole('button', { name: 'Connect my accounts', exact: true }).click()
      const frame = page.frameLocator('iframe[title="Plaid Link"]')
      await frame.getByText('Continue without phone number', { exact: true }).click()
      await frame.getByPlaceholder('Search').fill('First Platypus')
      await frame.getByText('First Platypus Bank', { exact: true }).click()
      await frame.getByText('First Platypus Bank', { exact: true }).last().click()
      await frame.getByLabel('Username', { exact: true }).fill('user_custom')
      await frame.getByLabel('Password', { exact: true }).fill(sandboxPassword)
      await frame.getByRole('button', { name: 'Submit', exact: true }).click()
      await frame.getByText('Your accounts', { exact: true }).waitFor()
      await page.screenshot({ path: `${dir}/initial-account-selection.png` })
      await frame.getByRole('button', { name: 'Continue', exact: true }).click()
      const exchangeResponse = page.waitForResponse(r => new URL(r.url()).pathname === '/api/plaid/exchange', { timeout: 60000 })
      await frame.getByText('Finish without saving', { exact: true }).click()
      const response = await exchangeResponse
      assert.equal(response.status(), 200)
      exchanged = { data: await response.json(), status: response.status() }
    } finally { await browser.close() }
    // Recover the test credential using the existing local development key; never print it.
    process.loadEnvFile('.env.development.local')
    const { createDecipheriv } = await import('node:crypto')
    const row = await admin.from('plaid_items').select('id,business_id,access_token_ciphertext,plaid_item_id').eq('id', exchanged.data.itemId).single()
    assert(!row.error && row.data.business_id === f.businessId)
    const e = JSON.parse(row.data.access_token_ciphertext)
    const d = createDecipheriv('aes-256-gcm', Buffer.from(process.env.PLAID_TOKEN_ENCRYPTION_KEY, 'base64'), Buffer.from(e.iv, 'base64'))
    d.setAuthTag(Buffer.from(e.tag, 'base64'))
    const accessToken = Buffer.concat([d.update(Buffer.from(e.ciphertext, 'base64')), d.final()]).toString()
    await writeFile(`${dir}/item-small-${bank}-private.json`, JSON.stringify({ itemRecordId: row.data.id, businessId: f.businessId, accessToken }), { mode: 0o600 })
    console.log(JSON.stringify({ exchangeStatus: exchanged.status, itemRecordId: row.data.id, isolatedSynthetic: true }))

 }
 else {
  const item=JSON.parse(await readFile(`${dir}/item-small-${bank}-private.json`,'utf8'));assert.equal(item.businessId,f.businessId)
  const snapshot=async()=>{const r=await admin.from('plaid_items').select('id,connection_status,consent_status,update_reason,new_accounts_available,update_state_version,last_successful_sync_at,sync_cursor').eq('business_id',f.businessId).neq('connection_status','disconnected');assert(!r.error);return r.data.map(({sync_cursor,...row})=>({...row,hasCursor:Boolean(sync_cursor)}))}
  const proof=async(name,data)=>{await writeFile(`${dir}/${name}.json`,JSON.stringify(data,null,2));console.log(JSON.stringify(data))}
  const before=await snapshot()
  const accountsBefore=await admin.from('plaid_account_sources').select('plaid_account_id').eq('plaid_item_record_id',item.itemRecordId);assert(!accountsBefore.error)
  if(process.argv.includes('--state'))await proof('state',before)
  const code=process.argv.find(a=>a.startsWith('--fire='))?.split('=')[1]
  if(code||process.argv.includes('--reset')) {
    let result
    try{result=code?await plaid('/sandbox/item/fire_webhook',{access_token:item.accessToken,webhook_type:code==='SYNC_UPDATES_AVAILABLE'?'TRANSACTIONS':'ITEM',webhook_code:code}):await plaid('/sandbox/item/reset_login',{access_token:item.accessToken})}
    catch(e){await proof(`unsupported-${code}`,{code,result:e.message,realSandbox:true});process.exit(0)}
    const wanted=code??'ERROR',start=Date.now()
    let event=null
    for(let i=0;i<30;i++){const r=await admin.from('plaid_webhook_events').select('id,webhook_type,webhook_code,received_at,processed_at').eq('plaid_item_record_id',item.itemRecordId).eq('webhook_code',wanted).gte('received_at',new Date(start-1500).toISOString()).order('received_at',{ascending:false}).limit(1);assert(!r.error);event=r.data[0];if(event)break;await new Promise(r=>setTimeout(r,1000))}
    assert(event,'Genuine webhook not received within 30 seconds')
    await proof(`${bank}-${wanted}`,{realSandbox:true,providerResponse:result,itemRecordId:item.itemRecordId,webhook:event,before,after:await snapshot(),authorizedAccountsBefore:accountsBefore.data,authorizedAccountsAfter:(await admin.from('plaid_account_sources').select('plaid_account_id').eq('plaid_item_record_id',item.itemRecordId)).data})
  }
  if(process.argv.includes('--internal-expiration')) {
    const event=await admin.rpc('record_plaid_webhook',{p_hash:crypto.randomUUID().replaceAll('-','').repeat(2),p_payload:{item_id:(await plaid('/item/get',{access_token:item.accessToken})).item.item_id,environment:'sandbox',webhook_type:'ITEM',webhook_code:'PENDING_EXPIRATION',_verified_issued_at:new Date().toISOString()}})
    assert(!event.error);await proof('internal-expiration',{internalDeterministic:true,providerOriginated:false,before,after:await snapshot()})
  }
  if(process.argv.includes('--repair')) {
    const post=await session(f),browser=await chromium.launch({headless:true})
    try {
      const context=await browser.newContext({viewport:{width:1280,height:900}})
      await context.addCookies([...post.cookies].map(([name,value])=>({name,value,domain:new URL(origin).hostname,path:'/',secure:true,sameSite:'Lax'})))
      const page=await context.newPage();let completion=null,version=null,submitted=false
      page.on('response',async r=>{if(new URL(r.url()).pathname==='/api/plaid/link-token'&&r.status()===200){version=(await r.json()).updateVersion}if(new URL(r.url()).pathname==='/api/plaid/sync'){completion={status:r.status()}}})
      if(process.argv.includes('--webhook-only'))await page.route('**/api/plaid/sync',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({certificationProviderRepairOnly:true})}))
      await page.goto(`${origin}/settings/banking`)
      const row=page.locator(`#bank-connection-${item.itemRecordId}`)
      await row.getByRole('button',{name:/Reconnect bank|Renew connection|Review accounts|Review connection/}).click()
      page.setDefaultTimeout(8000)
      const frame=page.frameLocator('iframe[title="Plaid Link"]')
      for(let step=0;step<80&&!completion;step++) {
        await new Promise(r=>setTimeout(r,700))
        await page.screenshot({path:`${dir}/repair-inspect.png`})
        if(completion)break
        if(!submitted && await frame.getByLabel('Username',{exact:true}).isVisible().catch(()=>false) && await frame.getByLabel('Username',{exact:true}).isEditable().catch(()=>false))await frame.getByLabel('Username',{exact:true}).fill('user_custom')
        if(!submitted && await frame.getByLabel('Password',{exact:true}).isVisible().catch(()=>false) && await frame.getByLabel('Password',{exact:true}).isEditable().catch(()=>false))await frame.getByLabel('Password',{exact:true}).fill(sandboxPassword)
        if(await frame.getByText('Your accounts',{exact:true}).isVisible().catch(()=>false))await page.screenshot({path:`${dir}/${bank}-update-account-selection.png`})
        let clicked=false
        for(const label of ['Continue without phone number','Submit','Continue','Finish without saving','Done']) {
          const control=frame.getByRole('button',{name:label,exact:true});if(await control.isVisible().catch(()=>false)&&await control.isEnabled().catch(()=>false)){await control.click();if(label==='Submit')submitted=true;clicked=true;break}
          const text=frame.getByText(label,{exact:true});if(label!=='Submit'&&await text.isVisible().catch(()=>false)&&await text.isEnabled().catch(()=>false)){await text.click();clicked=true;break}
        }
        if(!clicked&&step===79){await page.screenshot({path:`${dir}/repair-inspect.png`});console.log('Link step:',(await frame.locator('body').innerText().catch(()=>'' )).slice(0,1800));break}
      }
      assert(completion, 'Link completion not observed');assert.equal(completion.status,200)
      await new Promise(r=>setTimeout(r,2000))
      if(!process.argv.includes('--webhook-only'))await row.getByRole('button',{name:/Reconnect bank|Renew connection|Review accounts|Review connection/}).waitFor({state:'hidden',timeout:8000})
      await page.goto(`${origin}/settings/banking`);await page.screenshot({path:`${dir}/${bank}-after-repair.png`})
      const provider=await plaid('/accounts/get',{access_token:item.accessToken});assert(!provider.item.error)
      await proof(`${bank}-repair${process.argv.includes('--webhook-only')?'-external':''}`,{realBrowser:true,publicStaging:origin,version,completion,before,after:await snapshot(),providerHealthy:true,authorizedProviderAccountIds:provider.accounts.map(a=>a.account_id)})
    }finally{await browser.close()}
  }
  if(process.argv.includes('--security')) {
    const fixtures=JSON.parse(await readFile('/private/tmp/writeoffs-conversation/staging-fixtures.json','utf8'))
    const other=await session(fixtures[6]),owner=await session(f)
    const raw=async(cookies,path,body)=>{const response=await fetch(origin+path,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json',Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')},body:JSON.stringify(body)});const text=await response.text();assert(!text.includes(item.accessToken),'credential exposure');return response.status}
    const crossToken=await raw(other.cookies,'/api/plaid/link-token',{itemId:item.itemRecordId})
    const crossRepair=await raw(other.cookies,'/api/plaid/sync',{updatedItemId:item.itemRecordId,updateVersion:0})
    assert.equal(crossToken,503);assert.equal(crossRepair,502)
    const cookies=new Map(),aal1=createServerClient(process.env.SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>cookies.set(name,value))}})
    assert(!(await aal1.auth.signInWithPassword({email:f.email,password:f.password})).error)
    const noMfa=await raw(cookies,'/api/plaid/link-token',{itemId:item.itemRecordId});assert([401,403].includes(noMfa),`AAL1 must not create Link token (HTTP ${noMfa})`)
    const noMfaMutations={}
    for(const path of ['sync','exchange','disconnect']){noMfaMutations[path]=await raw(cookies,`/api/plaid/${path}`,{});assert.equal(noMfaMutations[path],403)}
    const rpc=await owner.client.rpc('complete_plaid_update',{p_item_record_id:item.itemRecordId,p_business_id:f.businessId,p_expected_version:0});assert(rpc.error,'customer cannot call service RPC')
    const direct=await owner.client.from('plaid_items').select('access_token_ciphertext');assert(direct.error||!direct.data?.length,'credential table not exposed')
    const unsigned=await raw(new Map(),'/api/plaid/webhook',{webhook_type:'ITEM',webhook_code:'LOGIN_REPAIRED'});assert.equal(unsigned,401)
    const after=await snapshot();assert.deepEqual(after.map(r=>[r.id,r.update_state_version]).sort(),before.map(r=>[r.id,r.update_state_version]).sort())
    await proof('security',{publicStaging:!process.argv.includes('--local-home'),origin,crossTenantToken:crossToken,crossTenantRepair:crossRepair,noMfa,noMfaMutations,unsignedWebhook:unsigned,serviceRpcDenied:true,credentialTableDenied:true,unchangedItemVersions:true})
  }

  if(process.argv.includes('--capture')) {
    const post=await session(f),browser=await chromium.launch({headless:true})
    try{const context=await browser.newContext();await context.addCookies([...post.cookies].map(([name,value])=>({name,value,domain:new URL(origin).hostname,path:'/',secure:true,sameSite:'Lax'})));const page=await context.newPage();page.on('pageerror',e=>console.log('Browser error:',e.message));page.on('console',m=>{if(m.type()==='error')console.log('Browser console:',m.text().slice(0,700))})
      for(const width of [390,1280])for(const path of ['/home','/settings/banking']){await page.setViewportSize({width,height:900});await page.goto(origin+path);await page.locator('h1').first().waitFor();await page.screenshot({path:`${dir}/${process.argv.includes('--local-home')?'local-':''}${bank}-${path==='/home'?'home':'banking'}-${width}.png`,fullPage:true})}
    }finally{await browser.close()}
  }
 }

} catch(error) { console.error('Update certification failed:', error instanceof Error ? error.message : 'unknown'); process.exitCode=1 }
