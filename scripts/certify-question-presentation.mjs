// Deterministic browser test: real conversation components, synthetic work, no database.
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {createServer} from 'node:http'
import {readFile,readdir,writeFile} from 'node:fs/promises'
import {chromium} from '@playwright/test'
import {homeWorkFixture} from '../tests/fixtures/home-command.ts'
const fixture=homeWorkFixture('concurrent')
const entry=`
import React from 'react';import {createRoot} from 'react-dom/client';
import {GuidedWork} from './app/components/guided/GuidedWork';
const work=${JSON.stringify(fixture)};
function turn(name){const w=structuredClone(work),a=w.nextAction;a.id=name;a.version=name;a.recordIds=[name];a.type='material_question';a.question={id:name,version:name,recordId:name,source:'bookkeeping',kind:'transaction_type',prompt:'What was this money for?',understanding:'I can see money came in, but I can’t tell where it came from.',transaction:{merchant:name,amountCents:30000,date:'2026-05-14',currency:'USD'},options:[{id:'earned_money',label:'Payment from a customer'},{id:'moved_money',label:'Transfer between my accounts'},{id:'added_own_money',label:'Money I added to the business'},{id:'borrowed_money',label:'Loan proceeds'},{id:'received_refund',label:'Refund or reimbursement'},{id:'other',label:'Something else'}]};return w;}
window.commands=0;window.currentTurn=sessionStorage.getItem('synthetic-turn')||'SYNTHETIC INCOMING A';
window.fetch=async(url,options)=>{if(options?.method==='POST'){window.commands++;await new Promise(r=>window.releaseAnswer=r);window.currentTurn='SYNTHETIC INCOMING B';sessionStorage.setItem('synthetic-turn',window.currentTurn);return Response.json({ok:true,work:turn(window.currentTurn)})}return Response.json(turn(window.currentTurn));};
createRoot(document.getElementById('root')).render(<GuidedWork initialWork={turn(window.currentTurn)}/>);
`
const result=await build({stdin:{contents:entry,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,outdir:'/private/tmp/emily-presentation-bundle',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'test-boundaries',setup(b){
 b.onResolve({filter:/^(next\/(link|image|navigation))$|DocumentIntake$|SpecialTransactionFlow$|SourceCoverageNotice$/},a=>({path:a.path,namespace:'test'}))
 b.onLoad({filter:/.*/,namespace:'test'},a=>({loader:'jsx',resolveDir:process.cwd(),contents:a.path==='next/navigation'?'export const useRouter=()=>({push(){},refresh(){}})':a.path==='next/link'?'export default function Link({children,...p}){return <a {...p}>{children}</a>}':a.path==='next/image'?'export default function Image({priority,fill,...p}){return <img {...p}/>}':'export const DocumentIntake=()=>null;export const SpecialTransactionFlow=()=>null;export const LiveSourceCoverageNotice=()=>null;'}))
}}]})
const js=result.outputFiles.find(x=>x.path.endsWith('.js')).text
const sheets=(await readdir('.next/static/css')).filter(x=>x.endsWith('.css'))
const css=(await Promise.all(sheets.map(x=>readFile('.next/static/css/'+x,'utf8')))).join('\n')+'\n'+await readFile('app/components/guided/guided.css','utf8')
const server=createServer((req,res)=>{
 if(req.url==='/app.js'){res.setHeader('content-type','text/javascript');res.end(js)}
 else if(req.url==='/app.css'){res.setHeader('content-type','text/css');res.end(css)}
 else if(req.url==='/'){res.setHeader('content-type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><header style="height:80px">Synthetic certification</header><main id="root" style="padding:0 16px 70vh"></main><script src="/app.js"></script>')}
 else{res.writeHead(404);res.end()}
})
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port
const browser=await chromium.launch();const outcomes=[]
try{
 for(const width of [1280,390])for(const reduced of [false,true]){
  const context=await browser.newContext({viewport:{width,height:720},reducedMotion:reduced?'reduce':'no-preference'}),page=await context.newPage()
  await page.goto(origin);const button=page.getByRole('button',{name:'I’m not sure',exact:true});await button.waitFor();await page.waitForFunction(()=>document.activeElement?.tagName==='H1')
  await button.evaluate(el=>window.scrollTo({top:el.getBoundingClientRect().top+window.scrollY-160,behavior:'instant'}))
  assert((await page.locator('#guided-transaction').boundingBox()).y<0,'Scenario must start without merchant in view')
  await page.evaluate(()=>{window.seen=[];new MutationObserver(()=>{const id=document.querySelector('[data-guided-id]')?.getAttribute('data-guided-id');if(id&&window.seen.at(-1)!==id)window.seen.push(id)}).observe(document,{subtree:true,attributes:true,childList:true})})
  const start=Date.now();if(reduced){await button.focus();await page.keyboard.press('Enter')}else await button.click()
  const feedback=page.locator('.betti-transition-feedback');await feedback.waitFor();const feedbackMs=Date.now()-start
  const box=await feedback.boundingBox();assert(box.y>=0&&box.y+box.height<=720,'Feedback outside viewport')
  assert.equal(await page.locator('[data-guided-id]').getAttribute('data-guided-id'),'SYNTHETIC INCOMING A')
  // Hold a slow response until feedback and unchanged active identity are proven.
  await page.waitForTimeout(800);assert.equal(await page.evaluate(()=>window.commands),1)
  await page.evaluate(()=>window.releaseAnswer());await page.waitForFunction(()=>document.querySelector('[data-guided-id]')?.getAttribute('data-guided-id')==='SYNTHETIC INCOMING B')
  await page.waitForFunction(()=>{const el=document.querySelector('#guided-transaction'),b=el.getBoundingClientRect();return b.top>=90&&b.bottom<innerHeight})
  assert.equal(await page.locator('h1').evaluate(el=>el===document.activeElement),true)
  assert.deepEqual(await page.evaluate(()=>[...new Set(window.seen)]),['SYNTHETIC INCOMING A','SYNTHETIC INCOMING B'])
  await page.reload();await page.locator('[data-guided-id="SYNTHETIC INCOMING B"]').waitFor()
  await page.waitForFunction(()=>document.querySelector('#guided-transaction').getBoundingClientRect().top>=90)
  await page.screenshot({path:'/private/tmp/emily-presentation-'+width+'-'+reduced+'.png'})
  outcomes.push({width,reducedMotion:reduced,keyboard:reduced,feedbackMs,slowResponse:true,commands:1,merchantVisible:true,refreshStable:true})
  await context.close()
 }
 await writeFile('/private/tmp/emily-presentation.json',JSON.stringify(outcomes,null,2));console.log(JSON.stringify(outcomes))
}finally{await browser.close();server.close()}
