import { readFileSync, writeFileSync } from 'node:fs'
import { createHmac, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { test, expect } from '@playwright/test'

// Explicit opt-in. Credentials stay outside Git. Never accepts a manual customer.
const fixturePath = process.env.ACCOUNT_USE_SYNTHETIC_FIXTURES
const enabled = process.env.RUN_STAGING_ACCOUNT_USE_E2E === '1' && Boolean(fixturePath)
test.skip(!enabled, 'requires isolated synthetic staging identities')
type Fixture = { userId: string; businessId: string; email: string; password: string; factorId: string; totpSecret: string; accountId: string }
function totp(secret: string) {
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const bits=[...secret.replace(/=+$/,'').toUpperCase()].map(c=>alphabet.indexOf(c).toString(2).padStart(5,'0')).join('')
  const key=Buffer.from(Array.from({length:Math.floor(bits.length/8)},(_,i)=>parseInt(bits.slice(i*8,i*8+8),2)))
  const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)))
  const hash=createHmac('sha1',key).update(counter).digest(),offset=hash.at(-1)!&15
  return String((hash.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0')
}

test('manual account answers persist through Documents, survive retry, and reach the normal worker', async ({ browser, baseURL }) => {
  test.setTimeout(360_000)
  expect(process.env.WRITEOFFS_ENVIRONMENT).toBe('staging')
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL!
  expect(new URL(url).hostname).toBe('sgrqrrxrlglhjuetdtps.supabase.co')
  expect(['writeoffs-fresh-staging.vercel.app','127.0.0.1']).toContain(new URL(baseURL!).hostname)
  const fixtures=JSON.parse(readFileSync(fixturePath!,'utf8')) as Fixture[]
  const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
  for(const fixture of fixtures) {
    const {data,error}=await admin.auth.admin.getUserById(fixture.userId)
    expect(error).toBeNull();expect(data.user?.user_metadata.synthetic_workflow).toBe(true)
    expect(fixture.email).not.toMatch(/^rick\+test[12]@/)
    expect((await admin.from('businesses').select('owner_user_id').eq('id',fixture.businessId).single()).data?.owner_user_id).toBe(fixture.userId)
  }
  const fixture=fixtures[1],cookies=new Map<string,string>()
  const client=createServerClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{
    getAll:()=>[...cookies].map(([name,value])=>({name,value})),
    setAll:values=>values.forEach(({name,value})=>cookies.set(name,value)),
  }})
  expect((await client.auth.signInWithPassword({email:fixture.email,password:fixture.password})).error).toBeNull()
  expect((await client.auth.mfa.challengeAndVerify({factorId:fixture.factorId,code:totp(fixture.totpSecret)})).error).toBeNull()
  const context=await browser.newContext({baseURL,viewport:{width:1280,height:900}})
  await context.addCookies([...cookies].map(([name,value])=>({name,value,domain:new URL(baseURL!).hostname,path:'/',secure:baseURL!.startsWith('https:'),sameSite:'Lax'})))
  const page=await context.newPage(),errors:string[]=[]
  page.on('pageerror',error=>errors.push(error.message))
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text())})
  const proof:unknown[]=[]
  try {
    for(const designation of ['business_only','business_and_personal'] as const) {
      const accountId=randomUUID(),transactionId=randomUUID(),name=`Synthetic account-use ${designation} ${accountId.slice(0,8)}`
      // Synthetic source inputs and canonical unresolved initialization only.
      // No answers, allocations, or processing results are seeded.
      expect((await client.from('financial_accounts').insert({id:accountId,business_id:fixture.businessId,provider:'statement',provider_account_id:accountId,institution_name:'Synthetic Test Bank',display_name:name,account_type:'checking',currency:'USD',connection_status:'active'})).error).toBeNull()
      expect((await client.from('financial_transactions').insert({id:transactionId,business_id:fixture.businessId,financial_account_id:accountId,source_fingerprint:`account-use-browser:${transactionId}`,import_method:'statement',merchant_name:'Adobe Creative Cloud',original_description:'ADOBE CREATIVE CLOUD',amount_cents:-2299,currency:'USD',transaction_date:'2026-05-03'})).error).toBeNull()
      const initial=await admin.rpc('ensure_bookkeeping_record',{p_business_id:fixture.businessId,p_source_kind:'financial_transaction',p_financial_transaction_id:transactionId,p_provenance:'import',p_ingestion_key:`financial_transaction:${transactionId}`,p_amount_cents:-2299,p_currency:'USD',p_occurred_on:'2026-05-03'})
      expect(initial.error).toBeNull()
      expect((await client.rpc('ensure_initial_bookkeeping_decision',{p_business_id:fixture.businessId,p_bookkeeping_record_id:initial.data.id})).error).toBeNull()
      const source=await client.from('bookkeeping_financial_sources').select('bookkeeping_record_id').eq('financial_transaction_id',transactionId).is('revoked_at',null).single()
      expect(source.error).toBeNull()
      const recordId=source.data!.bookkeeping_record_id
      const path=`/check-in?record=${recordId}&returnTo=${encodeURIComponent(`/transactions/${recordId}`)}`
      const noJs=await browser.newContext({baseURL,javaScriptEnabled:false,storageState:await context.storageState()})
      const staticPage=await noJs.newPage();await staticPage.goto(path)
      await expect(staticPage.getByRole('radio',{name:'Business only',exact:true})).toBeDisabled()
      await noJs.close()
      // The manual intake must expose the same prerequisite without a Plaid connection.
      await page.goto('/import')
      await expect(page.getByRole('heading',{name:'Before I finish this, how did you use this account?'})).toBeVisible()
      const endpoint=`**/api/bookkeeping/accounts/${accountId}/use`
      let firstBody:unknown
      await page.route(endpoint,async route=>{firstBody=route.request().postDataJSON();await route.fulfill({status:200,contentType:'text/html',body:'<html>Unexpected response</html>'})})
      const label=designation==='business_only'?'Business only':'Business and personal'
      await page.getByRole('group',{name}).getByRole('radio',{name:label,exact:true}).click()
      await expect(page.locator(`#account-use-status-${accountId}`)).toContainText('has not been confirmed')
      await expect(page.getByRole('group',{name}).getByRole('radio',{name:label,exact:true})).not.toBeChecked()
      expect((await client.from('financial_account_use_events').select('id').eq('financial_account_id',accountId)).data).toHaveLength(0)
      await page.unroute(endpoint)
      const savedResponse=page.waitForResponse(r=>r.url().includes(`/accounts/${accountId}/use`)&&r.request().method()==='POST')
      await page.getByRole('button',{name:'Try saving again'}).click()
      const response=await savedResponse;expect(response.status()).toBe(200)
      expect(response.request().postDataJSON()).toEqual(firstBody)
      const saved=await response.json();expect(saved.ok).toBe(true)
      await expect.poll(async()=>(await client.from('current_financial_account_use').select('designation').eq('financial_account_id',accountId).single()).data?.designation).toBe(designation)
      const replay=await context.request.post(`/api/bookkeeping/accounts/${accountId}/use`,{data:firstBody})
      expect(await replay.json()).toEqual(saved)
      expect((await client.from('financial_account_use_events').select('id').eq('financial_account_id',accountId)).data).toHaveLength(1)
      await page.goto('/settings/banking');await expect(page.getByRole('group',{name}).getByRole('radio',{name:label,exact:true})).toBeChecked()
      await page.reload();await expect(page.getByRole('group',{name}).getByRole('radio',{name:label,exact:true})).toBeChecked()
      // Observe the real scheduler. Never invoke a drain or fabricate processing completion.
      const jobs=()=>admin.from('bookkeeping_processing_jobs').select('id,state,attempt_count').eq('business_id',fixture.businessId).eq('bookkeeping_record_id',recordId).eq('target_fingerprint',`bookkeeping-business-context:v1:account-use:${saved.eventId}:record:${recordId}`)
      await expect.poll(async()=>{const result=await jobs();expect(result.error).toBeNull();return result.data?.[0]?.state},{timeout:180_000,intervals:[1000,5000]}).toBe('completed')
      const result=await jobs();expect(result.data).toHaveLength(1)
      const work=await client.from('customer_transaction_work').select('treatment,category_key,needs_fact').eq('record_id',recordId).single()
      expect(work.error).toBeNull()
      proof.push({designation,eventId:saved.eventId,historyEvents:1,jobs:result.data,work:work.data})
    }
    const foreign=await context.request.post(`/api/bookkeeping/accounts/${fixtures[0].accountId}/use`,{data:{designation:'business_only',effectiveAt:new Date().toISOString(),requestId:randomUUID()}})
    expect(foreign.status()).toBe(400)
    for(const width of [390,430,768,1280]) {
      await page.setViewportSize({width,height:900});await page.goto('/home')
      for(const name of ['Send documents','Add mileage','Add money','Create invoice'])await expect(page.getByRole('link',{name,exact:true})).toBeVisible()
      await expect(page.locator('.home-add').getByRole('button',{name:'Choose files'})).toHaveCount(0)
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
      await page.locator('.home-add').screenshot({path:test.info().outputPath(`home-actions-${width}.png`)})
      await page.getByRole('link',{name:'Send documents',exact:true}).click()
      await expect(page.getByRole('button',{name:'Choose files',exact:true})).toBeVisible()
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    }
    expect(errors).toEqual([])
    writeFileSync(test.info().outputPath('canonical-save-and-normal-worker-proof.json'),JSON.stringify(proof,null,2))
    await test.info().attach('canonical-save-and-normal-worker-proof',{body:JSON.stringify(proof,null,2),contentType:'application/json'})
  } finally { await context.close() }
})
