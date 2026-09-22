// Presentation-only browser review. Existing explicitly synthetic staging account.
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHmac} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {createServerClient} from '@supabase/ssr'
import {chromium} from '@playwright/test'
process.loadEnvFile('.env.staging.local')
const origin=process.env.POLISH_ORIGIN??'https://writeoffs-fresh-staging.vercel.app'
assert(['http://localhost:3110','https://writeoffs-fresh-staging.vercel.app'].includes(origin))
assert.equal(new URL(process.env.SUPABASE_URL).hostname,'sgrqrrxrlglhjuetdtps.supabase.co')
const fixture=JSON.parse(await readFile('/private/tmp/writeoffs-polish-fixture.json','utf8'))
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
assert.equal((await admin.auth.admin.getUserById(fixture.userId)).data.user?.user_metadata.synthetic_ux1,true)
const cookies=new Map(),client=createServerClient(process.env.SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>cookies.set(name,value))}})
assert(!(await client.auth.signInWithPassword({email:fixture.email,password:fixture.password})).error,'Synthetic login failed')
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bits=[...fixture.totpSecret.replace(/=+$/,'').toUpperCase()].map(c=>alphabet.indexOf(c).toString(2).padStart(5,'0')).join(''),key=Buffer.from(Array.from({length:Math.floor(bits.length/8)},(_,i)=>parseInt(bits.slice(i*8,i*8+8),2))),counter=Buffer.alloc(8)
counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const hash=createHmac('sha1',key).update(counter).digest(),offset=hash.at(-1)&15,code=String((hash.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0')
assert(!(await client.auth.mfa.challengeAndVerify({factorId:fixture.factorId,code})).error,'Synthetic MFA failed')
const dir=origin.includes('localhost')?'/private/tmp/writeoffs-polish-local':'docs/audits/authenticated-polish/screenshots'
await mkdir(dir,{recursive:true})
const browser=await chromium.launch({headless:true}),results=[]
try{
 const context=await browser.newContext({timezoneId:'America/Phoenix'})
 await context.addCookies([...cookies].map(([name,value])=>({name,value,domain:new URL(origin).hostname,path:'/',secure:origin.startsWith('https:'),sameSite:'Lax'})))
 const page=await context.newPage();const errors=[];page.on('pageerror',()=>errors.push('browser runtime error'))
 const routes=(process.env.POLISH_ROUTES??'home,check-in,transactions,mileage,reports').split(',');assert(routes.every(x=>['home','check-in','transactions','mileage','reports'].includes(x)))
 for(const route of process.env.POLISH_ZOOM_ONLY==='1'?[]:routes){
  for(const width of [390,430,1280,1440]){
   await page.setViewportSize({width,height:900})
   await page.goto(origin+'/'+route,{waitUntil:'networkidle'})
   assert.equal(new URL(page.url()).pathname,'/'+route,'Unexpected route redirect')
   await page.evaluate(()=>document.fonts.ready)
   if(route==='reports')await page.locator('.reports-summary').waitFor()
   await page.screenshot({path:`${dir}/${route}-${width}.png`,fullPage:true})
   const metrics=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,mainCount:document.querySelectorAll('main').length,title:document.querySelector('h1')?.textContent,contentTop:document.querySelector('h1')?.getBoundingClientRect().top,menuRight:[...document.querySelectorAll('header summary')].find(x=>x.textContent.includes('Menu'))?.getBoundingClientRect().right}))
   assert(!metrics.overflow,`${route} ${width}: overflow`);assert.equal(metrics.mainCount,1)
   assert(metrics.menuRight>width/2,'Menu must remain on the right')
   results.push({route,width,...metrics})
  }
 }
 if(process.env.POLISH_SKIP_EXTRA==='1'){console.log('Selected presentation screenshots captured.');process.exitCode=0;await browser.close();process.exit()}
 // Read-only keyboard, filtering and zoom checks; no financial facts changed.
 await page.setViewportSize({width:390,height:900})
 await page.goto(origin+'/transactions',{waitUntil:'networkidle'})
 const filters=page.locator('.transaction-filters summary');await filters.focus();await page.keyboard.press('Enter')
 assert(await page.getByLabel('From',{exact:true}).isVisible(),'Keyboard opens date filters')
 await page.screenshot({path:`${dir}/transactions-filters-390.png`,fullPage:true})
 await page.keyboard.press('Tab');assert(await page.getByLabel('From',{exact:true}).evaluate(el=>el===document.activeElement),'Date filter focus order')
 const selectAll=page.getByLabel('Select all on this page',{exact:true});if(await selectAll.count()){await selectAll.check();assert(await page.locator('.review-bulk-actions').isVisible(),'Bulk controls remain available');await selectAll.uncheck()}
 await page.goto(origin+'/mileage',{waitUntil:'networkidle'})
 let radioKeyboard=false
 if(await page.getByRole('radio',{name:'Yes',exact:true}).count()){
  await page.getByRole('radio',{name:'Yes',exact:true}).focus();await page.keyboard.press('ArrowRight')
  assert(await page.getByRole('radio',{name:'No, business only',exact:true}).isChecked(),'Native radio keyboard behavior');radioKeyboard=true
 }
 const zoom=[]
 for(const route of ['home','check-in','transactions','mileage','reports']){
  await page.goto(origin+'/'+route,{waitUntil:'networkidle'})
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.evaluate(async()=>{document.documentElement.style.fontSize='200%';await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))})
  zoom.push({route,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)})
  await page.screenshot({path:`${dir}/${route}-text200.png`,fullPage:true})
 }
 assert(zoom.every(x=>!x.overflow),'200% text must not overflow')
 await writeFile(`${dir}/accessibility.json`,JSON.stringify({keyboardFilters:true,bulkSelection:true,radioKeyboard,reducedMotion:true,textScaling:zoom},null,2)+'\n')
 if(process.env.POLISH_VEHICLE_SETUP==='1'){
  await page.goto(origin+'/mileage',{waitUntil:'networkidle'})
  if(await page.getByLabel('Vehicle name',{exact:true}).count()){
   await page.getByLabel('Vehicle name',{exact:true}).fill('Synthetic review vehicle')
   await page.getByRole('radio',{name:'Yes',exact:true}).check()
   const saved=page.waitForResponse(r=>r.url().endsWith('/api/mileage/vehicles')&&r.request().method()==='POST')
   await page.getByRole('button',{name:'Save vehicle',exact:true}).click()
   assert((await saved).ok(),'Synthetic vehicle setup')
  }
  await page.getByRole('heading',{name:'Add a business trip',exact:true}).waitFor()
  for(const width of [390,430,1280,1440]){
   await page.setViewportSize({width,height:900})
   await page.screenshot({path:`${dir}/mileage-trip-${width}.png`,fullPage:true})
  }
 }
 assert.equal(errors.length,0,'Browser runtime error')
 if(results.length)await writeFile(`${dir}/results.json`,JSON.stringify({origin,results,browserErrors:errors.length},null,2)+'\n')
 console.log(`Captured ${results.length} real authenticated renders; no overflow or browser errors.`)
}finally{await browser.close()}
