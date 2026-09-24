/** INTERNAL DETERMINISTIC BROWSER TEST. Real components; synthetic API responses. */
import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import {build} from 'esbuild'
import {chromium} from '@playwright/test'
import {homeWorkFixture} from '../tests/fixtures/home-command'
const dir='/private/tmp/writeoffs-document-transitions'
const doc='11111111-1111-4111-8111-111111111111',record='22222222-2222-4222-8222-222222222222'
async function main(){
 await mkdir(dir,{recursive:true})
 const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{GuidedWork}from'./app/components/guided/GuidedWork';createRoot(document.getElementById('root')).render(React.createElement(GuidedWork,{initialWork:window.fixture}));`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"test"'},plugins:[{name:'test-adapters',setup(b){
 b.onResolve({filter:/^next\/(navigation|link|image)$/},args=>({path:args.path,namespace:'stub'}));b.onResolve({filter:/utils\/supabase\/client$/},()=>({path:'client',namespace:'stub'}));b.onResolve({filter:/\.css$/},args=>({path:args.path,namespace:'css'}));b.onLoad({filter:/.*/,namespace:'css'},()=>({contents:''}));
 b.onLoad({filter:/.*/,namespace:'stub'},args=>({loader:'js',resolveDir:process.cwd(),contents:args.path==='client'?`export const supabase={auth:{getUser:async()=>({data:{user:{id:'synthetic'}}})},storage:{from:()=>({upload:async()=>({error:null})})}};`:args.path.endsWith('navigation')?`export const useRouter=()=>({refresh(){},push(){}});export const usePathname=()=>'/check-in';export const useSearchParams=()=>new URLSearchParams();`:`import React from 'react';export default function C(p){return React.createElement('${args.path.endsWith('image')?'img':'a'}',p,p.children)}`}))
 }}]})
 const js=bundle.outputFiles[0].text,browser=await chromium.launch({headless:true}),results=[]
 try{for(const mode of ['loan','slow','racing-check','failure','refresh','changed-next','batch','receipt','multipage']){
  console.log('Testing',mode)
  const context=await browser.newContext({viewport:{width:mode==='loan'?1280:390,height:900},reducedMotion:mode==='refresh'?'reduce':'no-preference'})
  const initial=homeWorkFixture('concurrent'),next=structuredClone(initial)
  initial.businessId='synthetic-doc-turn';next.businessId=initial.businessId
  const loan={...initial.nextAction!,id:'special:loan',version:'loan1',type:'special_transaction' as const,recordIds:[record],decisionVersion:'decision1',question:undefined,transaction:{merchant:'LOAN PAYMENT - SYNTHETIC',date:'2026-05-15',amountCents:-45000}}
  initial.nextAction=loan
  if(mode==='batch'||mode==='receipt')initial.nextAction={...loan,id:'evidence:batch',type:'evidence_opportunity',account:{id:'account',name:'Synthetic checking',mask:'0000',designation:'business_only'},items:[{recordId:record,decisionId:'decision',reviewVersion:'review',accountUseVersion:'use',transactionId:'transaction',merchant:'Printing',date:'2026-05-09',amountCents:-21840}]}
  next.nextAction={...initial.nextAction!,id:'question:next',type:'material_question',recordIds:['next'],items:undefined,question:{id:'next',version:'v1',source:'bookkeeping',recordId:'next',kind:'business_purpose',prompt:'What was this purchase for?',transaction:{merchant:'NEXT PURCHASE',date:'2026-05-28',amountCents:-1000,currency:'USD'}}}
  let phase='processing',reads=0,posts=0,continued=false
  const page=await context.newPage()
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url()),path=url.pathname
   if(path==='/'){await route.fulfill({contentType:'text/html',body:`<div id="root"></div><script>window.fixture=${JSON.stringify(initial)}</script><script src="/bundle.js"></script>`});return}
   if(path==='/bundle.js'){await route.fulfill({contentType:'text/javascript',body:js});return}
   if(path.startsWith('/api/bookkeeping/records/')){await route.fulfill({json:{work:{recordId:record,decisionId:'decision1',nature:'loan_principal_payment',treatment:'unresolved',kind:'loan',amountCents:-45000,lastAction:null,candidates:[],linked:false}}});return}
   if(path==='/api/documents'){
    if(route.request().method()==='POST'){posts++;await route.fulfill({json:{document:{id:doc}}})}else await route.fulfill({json:{documents:posts?[{id:doc,state:phase==='ready'?'completed':'processing',document_class:'loan_statement'}]:[]}});return
   }
   if(path==='/api/bookkeeping/work/evidence'){await route.fulfill({json:{ok:true,work:next}});return}
   if(path==='/api/bookkeeping/work/documents'){
    reads++;if(['slow','racing-check'].includes(mode)&&reads===1)await new Promise(r=>setTimeout(r,750))
    await route.fulfill({json:{review:{phase,remainingFact:false,...(phase==='ready'&&!['batch','receipt'].includes(mode)?{loanSplit:{principalCents:40000,interestCents:5000}}:{})},work:next}});return
   }
   if(path==='/api/bookkeeping/work'){await route.fulfill({json:next});return}
   await route.fulfill({json:{}})
  })
  await page.addInitScript(()=>{(window as unknown as {headings:string[]}).headings=[];new MutationObserver(()=>{const w=window as unknown as {advanceAuthorized?:boolean;leaked?:boolean};if(!w.advanceAuthorized&&document.querySelector('#guided-transaction')?.textContent?.includes('NEXT PURCHASE'))w.leaked=true;const t=document.querySelector('h1')?.textContent;if(t)(window as unknown as {headings:string[]}).headings.push(t)}).observe(document,{childList:true,subtree:true})})
  await page.goto('http://localhost/')
  await page.getByLabel('Send Betti documents',{exact:true}).setInputFiles(mode==='multipage'?'/private/tmp/writeoffs-routing-evidence-first/phone-bill-two-pages.pdf':mode==='batch'?['/private/tmp/writeoffs-routing-evidence-first/two-receipts-one-page.pdf','/private/tmp/writeoffs-routing-evidence-first/phone-bill-two-pages.pdf']:'/private/tmp/writeoffs-routing-evidence-first/loan.pdf')
  await page.locator('[data-document-review]').waitFor()
  assert.equal(await page.getByText('NEXT PURCHASE',{exact:true}).count(),0)
  if(mode==='refresh'){await page.reload();await page.locator('[data-document-review]').waitFor();assert.equal(await page.getByText('NEXT PURCHASE',{exact:true}).count(),0)}
  if(mode==='slow')await page.locator('[data-document-review=processing]').waitFor()
  if(mode==='racing-check'){const button=page.getByRole('button',{name:'Check document status',exact:true});await button.scrollIntoViewIfNeeded();const box=await button.boundingBox();assert(box);await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();phase='ready';await page.locator('[data-document-review=ready]').waitFor();await page.mouse.up()}
  else{phase=mode==='failure'?'needs_attention':'ready';await page.getByRole('button',{name:'Check document status',exact:true}).click()}
  await page.locator(`[data-document-review="${phase}"]`).waitFor()
  assert.equal(await page.getByText('NEXT PURCHASE',{exact:true}).count(),0)
  if(mode==='failure')assert.equal(await page.getByRole('button',{name:'Continue →',exact:true}).count(),0)
  else{
   if(mode==='changed-next')next.nextAction.question!.transaction.merchant='NEW AUTHORITATIVE PURCHASE'
   await page.evaluate(()=>{(window as unknown as {advanceAuthorized:boolean}).advanceAuthorized=true});if(mode==='multipage'){await page.getByRole('button',{name:'Continue →',exact:true}).focus();await page.keyboard.press('Enter')}else await page.getByRole('button',{name:'Continue →',exact:true}).click();continued=true
   await page.getByText(mode==='changed-next'?'NEW AUTHORITATIVE PURCHASE':'NEXT PURCHASE',{exact:true}).first().waitFor()
  }
  const headings=await page.evaluate(()=>(window as unknown as {headings:string[]}).headings)
  assert(!await page.evaluate(()=>(window as unknown as {leaked?:boolean}).leaked),'INTERMEDIATE_QUESTION_FLASH')
  assert(!headings.some(h=>/Something else|undefined/.test(h)))
  await page.screenshot({path:`${dir}/${mode}.png`,fullPage:true});results.push({mode,posts,reads,continued,passed:true})
  await context.close()
 }}finally{await browser.close()}
 await writeFile(`${dir}/results.json`,JSON.stringify({evidence:'INTERNAL DETERMINISTIC BROWSER TEST',results},null,2));console.log(JSON.stringify(results))
}
main().catch(e=>{console.error(e instanceof Error?e.message:'TEST_FAILED');process.exitCode=1})
