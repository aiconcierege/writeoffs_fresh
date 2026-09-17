/** Synthetic projection states rendered through the real Home components.
 * No application routes, customer data, or bookkeeping mutations are involved. */
import React from 'react'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
// The project does not install react-dom types; keep this test-only boundary typed.
import { createRequire } from 'node:module'
const { renderToStaticMarkup } = createRequire(resolve('package.json'))('react-dom/server') as { renderToStaticMarkup(element: React.ReactNode): string }
import { chromium } from '@playwright/test'
import { HomeBettiHero } from '../app/home/HomeBettiHero'
import { HomeQuickActions } from '../app/home/HomeQuickActions'
import { FinancialRelationship } from '../app/home/HomeVisuals'
import { homeCommand } from '../app/lib/home/command-center'
import { homeStates, homeWorkFixture } from '../tests/fixtures/home-command'

async function main() {
const output = process.env.HOME_PROOF_DIR ?? '/private/tmp/writeoffs-home-phase2/visuals'
await mkdir(output, { recursive: true })
const sheets = await Promise.all((await readdir('.next/static/css')).map(async name => ({ name, body: await readFile(`.next/static/css/${name}`, 'utf8') })))
sheets.sort((a,b) => Number(a.body.includes('.home-command-center'))-Number(b.body.includes('.home-command-center')))
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url!, 'http://localhost')
    if (url.pathname === '/') {
      const state = url.searchParams.get('state') as typeof homeStates[number]
      assert(homeStates.includes(state))
      const projection = homeCommand(homeWorkFixture(state), 'statement_uploads')
      const body = renderToStaticMarkup(<main className="home-page home-command-center"><div className="home-shell">
        <HomeBettiHero projection={projection}/>
        {projection.education && <p className="home-first-use">{projection.education}</p>}
        <section className="home-financial home-business-snapshot"><div className="home-section-heading"><div><p className="home-kicker">Your business</p><h2>Your working books</h2><p>Jan 1, 2026 – Sep 17, 2026</p></div><a href="/reports">See reports →</a></div>
          <FinancialRelationship business income={state==='new'?0:125000} expenses={state==='new'?0:42500} profit={state==='new'?0:82500}/>
          <p className="home-working-note">Based on the records available so far. Tax-time deductions are tracked separately.</p></section>
        <HomeQuickActions business/>
      </div></main>)
      res.setHeader('content-type','text/html; charset=utf-8');res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${sheets.map(s=>`<link rel="stylesheet" href="/_next/static/css/${s.name}">`).join('')}</head><body>${body}</body></html>`);return
    }
    const image = url.pathname === '/_next/image' ? url.searchParams.get('url')! : null
    const root = resolve(url.pathname.startsWith('/_next/') && !image ? '.next' : 'public')
    const pathname = image ?? url.pathname.replace(/^\/_next\//,'/')
    const file = resolve(root, '.' + pathname);assert(file.startsWith(root+'/'))
    const types:Record<string,string>={'.css':'text/css','.png':'image/png','.woff2':'font/woff2','.svg':'image/svg+xml'}
    res.setHeader('content-type',types[extname(file)]??'application/octet-stream');res.end(await readFile(file))
  } catch { res.writeHead(404);res.end() }
})
await new Promise<void>(r=>server.listen(0,'127.0.0.1',r))
const address=server.address();assert(address && typeof address!=='string')
const browser=await chromium.launch({headless:true}),results=[]
try {
  for(const state of homeStates) for(const width of [390,430,768,1280]) {
    const page=await browser.newPage({viewport:{width,height:900}}),errors:string[]=[]
    page.on('pageerror',e=>errors.push(e.name))
    await page.goto(`http://127.0.0.1:${address.port}/?state=${state}`);await page.locator('.home-betti-art').evaluate(async (img)=>{await (img as HTMLImageElement).decode()})
    const metrics=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,
      bettiHeight:document.querySelector('.home-betti-art')!.getBoundingClientRect().height,
      financialTop:document.querySelector('.home-financial')!.getBoundingClientRect().top,
      ctas:document.querySelectorAll('.home-betti-action').length}))
    assert(!metrics.overflow,`${state}/${width} overflow`);assert(metrics.bettiHeight>=150);assert.equal(errors.length,0)
    if(['processing','waiting','held','deferred','organized'].includes(state))assert.equal(metrics.ctas,0)
    await page.screenshot({path:`${output}/${state}-${width}.png`,fullPage:true})
    results.push({state,width,...metrics});await page.close()
  }
  await writeFile(`${output}/results.json`,JSON.stringify(results,null,2));console.log(`Passed ${results.length} synthetic Home layout/state checks`)
}finally{await browser.close();await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()))}

}
main().catch(error=>{console.error(error);process.exitCode=1})
