'use client'
import {useEffect,useState} from 'react'
import Link from 'next/link'
import type {SourceCoverage} from '../lib/bookkeeping/source-coverage'
import './source-coverage.css'
const date=(value:string)=>new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T00:00:00Z'))
export function SourceCoverageNotice({coverage,expanded=false}:{coverage:SourceCoverage|null;expanded?:boolean}){
 if(!coverage)return <p className="source-coverage-note">I couldn’t check which months are covered. These totals reflect the records available so far.</p>
 if(!coverage.needsRecords&&!coverage.hasRejectedRecords)return null
 return <aside className="source-coverage" aria-label="Records still needed">
  <details open={expanded||undefined}><summary>{coverage.needsRecords?'Records are still needed for part of this period.':'Some bank records need another look.'}</summary>
   <p>Your working totals include the records I can use so far.</p>
   {coverage.accounts.filter(a=>a.recordsNeeded.length||a.quarantined).map(a=><section key={a.id}><h3>{a.name}{a.mask?` · ${a.mask}`:''}</h3>
    {a.bank&&<p>I have bank activity starting {date(a.bank.from)}.</p>}
    {!!a.recordsNeeded.length&&<><p>Send me statements for:</p><ul>{a.recordsNeeded.map(r=><li key={r.from}>{date(r.from)} – {date(r.through)}</li>)}</ul></>}
    {a.quarantined>0&&<p>I couldn’t use {a.quarantined===1?'one bank record':`${a.quarantined} bank records`}. A statement can help me check them.</p>}
   </section>)}
   <Link href="/import">Send statements</Link>
  </details>
 </aside>
}
export function LiveSourceCoverageNotice(){
 const [coverage,setCoverage]=useState<SourceCoverage|null|undefined>(undefined)
 useEffect(()=>{const controller=new AbortController();const load=()=>fetch('/api/bookkeeping/source-coverage',{cache:'no-store',signal:controller.signal}).then(async r=>{if(!r.ok)throw Error();setCoverage(await r.json())}).catch(()=>{if(!controller.signal.aborted)setCoverage(null)})
 void load();window.addEventListener('focus',load);return()=>{controller.abort();window.removeEventListener('focus',load)}},[])
 return coverage===undefined?<p className="source-coverage-note" role="status">Checking which months I have…</p>:<SourceCoverageNotice coverage={coverage} expanded/>
}
