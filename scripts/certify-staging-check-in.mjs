import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHmac } from 'node:crypto'
import { createServerClient } from '@supabase/ssr'
import { chromium } from '@playwright/test'
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
if (process.env.WRITEOFFS_ENVIRONMENT !== 'staging' || new URL(url).hostname !== 'sgrqrrxrlglhjuetdtps.supabase.co') throw new Error('Staging only')
const origin = 'https://writeoffs-fresh-staging.vercel.app'
function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const bits = [...secret.replace(/=+$/, '').toUpperCase()].map(c => alphabet.indexOf(c).toString(2).padStart(5, '0')).join('')
  const key = Buffer.from(Array.from({ length: Math.floor(bits.length / 8) }, (_, i) => parseInt(bits.slice(i * 8, i * 8 + 8), 2)))
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)))
  const hash = createHmac('sha1', key).update(counter).digest(), offset = hash.at(-1) & 15
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0')
}
const fixture = JSON.parse(await readFile('/private/tmp/writeoffs-check-in-fixture.json', 'utf8'))
const browser = await chromium.launch({ headless: true })
let supabase, factorId
try {
  const cookies = new Map()
  supabase = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: {
    getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
    setAll: values => values.forEach(({ name, value }) => cookies.set(name, value)),
  } })
  const login = await supabase.auth.signInWithPassword({ email: fixture.email, password: fixture.password })
  assert(!login.error, 'Synthetic customer login')
  assert.equal(login.data.user.user_metadata.synthetic_check_in_validation, true)
  const enrollment = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Check-in proof ${Date.now()}` })
  assert(!enrollment.error, 'MFA enrollment')
  factorId = enrollment.data.id
  const verified = await supabase.auth.mfa.challengeAndVerify({ factorId, code: totp(enrollment.data.totp.secret) })
  assert(!verified.error, 'Real MFA verification')
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await context.addCookies([...cookies].map(([name, value]) => ({ name, value, domain: new URL(origin).hostname, path: '/', secure: true, sameSite: 'Lax' })))
  const page = await context.newPage()
  await page.goto(`${origin}/check-in`)
  const initial = await context.request.get(`${origin}/api/bookkeeping/questions`)
  assert.equal(initial.status(), 200)
  const initialQueue = (await initial.json()).questions
  assert.equal(initialQueue.length, 3, 'Three isolated fixture questions')
  let submissions = 0
  page.on('request', request => { if(request.method()==='POST' && /\/api\/bookkeeping\/questions\//.test(request.url()))submissions++ })
  for(let index=0;index<3;index++){
    await page.getByRole('heading', {name:'Who was the meal with?',exact:true}).waitFor()
    await page.getByLabel('Who was the meal with?',{exact:true}).fill('Jim Jones,\nclient to discuss the September design proposal')
    if(index===0){
      await page.route('**/api/bookkeeping/questions', async route => { await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic queue-read interruption'})}); await page.unroute('**/api/bookkeeping/questions') })
    }
    const answer = page.waitForResponse(response => response.request().method()==='POST' && /\/api\/bookkeeping\/questions\//.test(response.url()))
    await page.getByRole('button',{name:'Continue',exact:true}).evaluate(button=>{button.click();button.click()})
    assert.equal((await answer).status(),200, 'Answer must commit')
    if(index===0){
      await page.getByRole('button',{name:'Reload current question',exact:true}).waitFor()
      await page.getByRole('button',{name:'Reload current question',exact:true}).click()
    }
    await page.waitForTimeout(1000)
    const remaining = await context.request.get(`${origin}/api/bookkeeping/questions`)
    const queue = (await remaining.json()).questions
    assert.equal(queue.length,2-index,'One question resolves per answer')
    assert.equal(submissions,index+1,'Double clicks issue one request')
    if(index===1){await page.goto(`${origin}/home`);await page.goto(`${origin}/check-in`)}
    else await page.reload()
    console.log(JSON.stringify({synthetic:true,answered:index+1,remaining:queue.length,submissions}))
  }
  await page.getByRole('heading',{name:'Your books are current.',exact:true}).waitFor()
  for(const question of initialQueue){
    const events=await supabase.from('bookkeeping_review_events').select('event_type').eq('review_issue_id',question.id)
    assert.equal(events.data.filter(event=>event.event_type==='answered').length,1)
    assert.equal(events.data.filter(event=>event.event_type==='resolved').length,1)
    const replay=await context.request.post(`${origin}/api/bookkeeping/questions/${question.id}`,{headers:{'if-match':question.version},data:{action:'meal_relationship',attendeeRelationship:'Jim Jones,\nclient to discuss the September design proposal'}})
    assert.equal(replay.status(),409,'Stale immutable version cannot write again')
  }
  await page.reload()
  await page.getByRole('heading',{name:'Your books are current.',exact:true}).waitFor()
  await page.screenshot({path:'/private/tmp/writeoffs-check-in-complete.png'})
  console.log(JSON.stringify({consecutiveAnswers:3,multiline:true,doubleClickSafe:true,retryNoDuplicate:true,refreshPreservesProgress:true,leaveAndReturn:true,queueReadRecovery:true,resolvedQuestionsAbsent:true}))
  await context.close()
} catch {
  console.error('Staging Check-in certification failed; no session or provider details logged.')
  process.exitCode = 1
} finally {
  if (factorId && supabase) await supabase.auth.mfa.unenroll({ factorId })
  if (supabase) await supabase.auth.signOut()
  await browser.close()
}
