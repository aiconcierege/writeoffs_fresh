'use client'
import {useState} from 'react'
import {useRouter} from 'next/navigation'
import type {WorkAction} from '../lib/bookkeeping/betti-work'
import type {GuidedWorkProjection} from '../lib/bookkeeping/guided-work-projection'
import type {SourceCoverage} from '../lib/bookkeeping/source-coverage'
import {SourceCoverageNotice} from '../components/SourceCoverageNotice'
import {EvidenceStep} from '../components/guided/EvidenceStep'

/** Uses the same owned, versioned evidence command as Check-in. No new facts or
 * responses are recorded by rendering Home or inspecting missing periods. */
export function HomeEvidenceOpportunity({action,coverage}:{action:WorkAction;coverage:SourceCoverage|null}){
 const router=useRouter(),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[saved,setSaved]=useState(false)
 async function perform(command:()=>Promise<GuidedWorkProjection|void>){
  setBusy(true);setError('');setMessage('Got it. I’m checking the next step.')
  try{await command();setSaved(true);router.refresh()}
  catch(e){setError(e instanceof Error?e.message:'I couldn’t confirm that response. Please try again.')}
  finally{setBusy(false);setMessage('')}
 }
 return <div className="home-evidence-opportunity" aria-busy={busy}>
  {coverage?.needsRecords&&<div className="home-evidence-statements"><p>You can send more statements now, or we can keep working on the months I already have.</p><SourceCoverageNotice coverage={coverage} expanded/></div>}
  {saved?<p role="status">Got it. Updating the next step…</p>:<EvidenceStep action={action} showIntroduction={false} busy={busy} perform={perform} onPending={(pending,text)=>{setBusy(pending);setMessage(pending?text??'Receiving your documents…':'')}}/>}
  {message&&<p role="status" aria-live="polite">{message}</p>}
  {error&&<p role="alert">{error}</p>}
 </div>
}
