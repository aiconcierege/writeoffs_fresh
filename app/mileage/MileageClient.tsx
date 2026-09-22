'use client'

import { useMemo, useRef, useState } from 'react'
import { formatMiles } from '../lib/mileage/validation'
import {WorkspaceEmpty,WorkspaceField,WorkspaceGroup} from '../components/Workspace'
import { AuthenticatedPage } from '../components/ui'
import { BettiPresence } from '../components/experience/BettiPresence'
import { completedVehicleTaxYear, needsAnnualVehicleUse } from '../lib/mileage/annual-use-question'

type Vehicle = { id:string;display_name:string;vehicle_year:number|null;make:string|null;model:string|null;is_mixed_use:boolean|null;archived_at:string|null }
type Entry = { id:string;current_event_id:string;miles_milli:number;occurred_on:string;vehicle_id:string;job_label:string|null;destination:string|null;business_purpose:string|null }
type VehicleIdentity={id:string;vehicle_id:string;ownership:'owned'|'leased'|'unknown';business_use_began_on:string|null;lease_started_on:string|null;lease_ended_on:string|null}
type VehicleMethod={id:string;vehicle_id:string;tax_year:number;method:'standard_mileage'|'actual_expenses'|'unresolved'|'cpa_review'}
type VehicleUse={id:string;vehicle_id:string;tax_year:number;total_miles_milli:number}

export function MileageClient({ initialVehicles, initialEntries,initialVehicleIdentities=[],initialVehicleMethods=[],initialVehicleUseFacts=[] }: { initialVehicles:Vehicle[];initialEntries:Entry[];initialVehicleIdentities?:VehicleIdentity[];initialVehicleMethods?:VehicleMethod[];initialVehicleUseFacts?:VehicleUse[] }) {
  const [vehicles,setVehicles]=useState(initialVehicles); const [entries,setEntries]=useState(initialEntries)
  const [identities,setIdentities]=useState(initialVehicleIdentities);const [methods,setMethods]=useState(initialVehicleMethods);const [useFacts,setUseFacts]=useState(initialVehicleUseFacts)
  const [addingVehicle,setAddingVehicle]=useState(vehicles.filter((v)=>!v.archived_at).length===0)
  const [editing,setEditing]=useState<Entry|null>(null); const [message,setMessage]=useState<string|null>(null)
  const active=vehicles.filter((v)=>!v.archived_at); const vehicleNames=useMemo(()=>new Map(vehicles.map((v)=>[v.id,v.display_name])),[vehicles])
  async function refresh(){const response=await fetch('/api/mileage/list',{cache:'no-store',signal:AbortSignal.timeout(10_000)});if(!response.ok)throw new Error('Mileage list could not be refreshed.')
    const data=await response.json();setVehicles(data.vehicles);setEntries(data.entries);setIdentities(data.vehicleIdentities??[]);setMethods(data.vehicleMethods??[]);setUseFacts(data.vehicleUseFacts??[])}
  const firstUse=vehicles.length===0
  const recordedMiles=entries.reduce((total,entry)=>total+Number(entry.miles_milli),0)
  const needsVehicleFacts=active.some(vehicle=>!identities.some(identity=>identity.vehicle_id===vehicle.id&&identity.ownership!=='unknown')||!methods.some(method=>method.vehicle_id===vehicle.id&&method.tax_year===new Date().getFullYear()&&method.method!=='unresolved'))
  return <AuthenticatedPage className={`mileage-page signature-page ${firstUse?'mileage-first-use':''}`} eyebrow="Business mileage" title={firstUse?'Let’s set up your vehicle.':'Mileage'} description={firstUse?'Tell me which vehicle you use for business. You’ll only need to do this once.':'Every business trip, kept together.'} actions={firstUse?<BettiPresence state="question" className="vehicle-setup-betti" sizes="(max-width: 639px) 120px, 360px"/>:undefined}>
    {!firstUse&&entries.length>0&&<div className="mileage-log-overview"><div><span className="workspace-kicker">In this log</span><strong>{formatMiles(recordedMiles)} <small>business miles</small></strong></div><p>{entries.length} {entries.length===1?'trip recorded':'trips recorded'}</p></div>}
    <div className={`mileage-workspace ${!firstUse?'workspace-surface':''}`}>
     <div className="mileage-entry">
      {addingVehicle&&<VehicleForm firstVehicle={active.length===0} onDone={async()=>{setAddingVehicle(false);await refresh()}}/>}
      {!addingVehicle&&active.length>0&&<MileageForm vehicles={active} entry={editing} onDone={async()=>{setEditing(null);setMessage('Mileage saved.');await refresh()}}/>}
      {active.length>0&&<button onClick={()=>setAddingVehicle(value=>!value)} className="workspace-text-action mileage-add-vehicle">{addingVehicle?'Back to trips':'+ Add vehicle'}</button>}
      {message&&<p role="status" className="workspace-success">{message}</p>}
     </div>
     {!firstUse&&<aside className="mileage-vehicle-context" aria-label="Your vehicles">
      <p className="workspace-kicker">Your vehicle{active.length===1?'':'s'}</p>
      <h2>{active.length===1?active[0].display_name:'Vehicle details'}</h2>
      {active.length===1&&<p className="vehicle-description">{[[active[0].vehicle_year,active[0].make,active[0].model].filter(Boolean).join(' '),active[0].is_mixed_use===true?'Business + personal':active[0].is_mixed_use===false?'Business only':''].filter(Boolean).join(' · ')}</p>}
      {active.length>0&&<details className="vehicle-settings" open={needsVehicleFacts||undefined}><summary id="vehicle-tracking-heading">{needsVehicleFacts?'Finish setting up your vehicle':'Vehicle tracking choices'}<span aria-hidden="true">＋</span></summary><p>You can record trips while you decide.</p><section aria-labelledby="vehicle-tracking-heading">
       {active.map(vehicle=><VehicleTaxForm key={vehicle.id} vehicle={vehicle} identity={identities.find(row=>row.vehicle_id===vehicle.id)??null}
        method={methods.find(row=>row.vehicle_id===vehicle.id&&row.tax_year===new Date().getFullYear())??null}
        useFact={useFacts.find(row=>row.vehicle_id===vehicle.id&&row.tax_year===new Date().getFullYear())??null} onDone={refresh}/>)}</section></details>}
      {active.flatMap(vehicle=>methods.filter(method=>method.vehicle_id===vehicle.id&&method.method==='actual_expenses'&&vehicle.is_mixed_use!==false&&completedVehicleTaxYear(method.tax_year)).map(method=><AnnualVehicleUse key={`${vehicle.id}:${method.tax_year}`} vehicle={vehicle} year={method.tax_year} useFact={useFacts.find(use=>use.vehicle_id===vehicle.id&&use.tax_year===method.tax_year)??null} onDone={refresh}/>))}
      {vehicles.length>0&&<details className="vehicle-management workspace-disclosure"><summary>Manage vehicles<span aria-hidden="true">＋</span></summary><div>{vehicles.map(vehicle=><div key={vehicle.id} className="vehicle-management-row"><span>{vehicle.display_name}<small>{vehicle.archived_at?'Inactive':'Active'}</small></span><button className="workspace-text-action" onClick={async()=>{await fetch(`/api/mileage/vehicles/${vehicle.id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({active:Boolean(vehicle.archived_at)})});await refresh()}}>{vehicle.archived_at?'Make active':'Make inactive'}</button></div>)}</div></details>}
     </aside>}
    </div>
    {!firstUse&&<section className="mileage-history workspace-surface" aria-labelledby="trips-heading"><div className="workspace-section-heading"><h2 id="trips-heading">Recorded trips</h2><a href={`/api/mileage/export?year=${new Date().getFullYear()}`} className="workspace-text-action">Download mileage <span aria-hidden="true">↓</span></a></div>
     {entries.length===0?<WorkspaceEmpty title="Your next business trip starts here.">Add the miles above. Your trip record will be waiting here.</WorkspaceEmpty>:<div className="record-list">{entries.map(entry=><article key={entry.id} className="record-row mileage-log-row">
      <div className="trip-log-distance"><strong>{formatMiles(Number(entry.miles_milli))}</strong><span>miles</span></div>
      <div className="trip-log-description"><p>{entry.business_purpose||entry.destination||'Business trip'}</p><span>{formatCustomerDate(entry.occurred_on)} · {vehicleNames.get(entry.vehicle_id)??'Vehicle'}</span>{(entry.destination||entry.job_label)&&<small>{[entry.destination,entry.job_label].filter(Boolean).join(' · ')}</small>}</div>
      <div className="trip-log-actions"><button onClick={()=>{setEditing(entry);document.querySelector('.mileage-entry')?.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})}} className="workspace-text-action">Edit</button>
       <button onClick={async()=>{if(!confirm('Remove this mileage from current records?'))return;await fetch(`/api/mileage/${entry.id}`,{method:'DELETE',headers:{'content-type':'application/json','idempotency-key':`void-${crypto.randomUUID()}`},body:JSON.stringify({expectedEventId:entry.current_event_id})});await refresh()}} className="workspace-text-action trip-remove">Remove</button></div>
     </article>)}</div>}
    </section>}
  </AuthenticatedPage>
}

function MileageForm({vehicles,entry,onDone}:{vehicles:Vehicle[];entry:Entry|null;onDone:()=>Promise<void>}){
  const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);const key=useRef(crypto.randomUUID())
  return <form key={entry?.id??'new'} className="trip-composer" onSubmit={async(e)=>{e.preventDefault();if(busy)return;setBusy(true);setError(null);const form=e.currentTarget;const f=new FormData(form);let saved=false
    try {const body={miles:String(f.get('miles')),occurredOn:String(f.get('date')),vehicleId:String(f.get('vehicleId')),jobLabel:String(f.get('jobLabel')??''),destination:String(f.get('destination')??''),businessPurpose:String(f.get('businessPurpose')??''),...(entry?{expectedEventId:entry.current_event_id}:{})}
      const response=await fetch(entry?`/api/mileage/${entry.id}`:'/api/mileage/create',{method:entry?'PATCH':'POST',headers:{'content-type':'application/json','idempotency-key':`mileage-${key.current}`},body:JSON.stringify(body),signal:AbortSignal.timeout(15_000)})
      const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error??'Mileage could not be saved.')
      saved=true;key.current=crypto.randomUUID();form.reset();await onDone()
    } catch(cause) {setError(saved?'Mileage was saved, but the list could not be refreshed. Reload to see it.':cause instanceof Error&&cause.name!=='TimeoutError'?cause.message:'Mileage could not be saved. Please try again.')
    } finally {setBusy(false)}}}>
    <p className="workspace-kicker">Your business driving</p><h2 className="workspace-title">{entry?'Correct trip':'Add a business trip'}</h2><div className="trip-primary-fields mt-5 grid gap-4 sm:grid-cols-2">
      <label className="trip-distance workspace-field">Business miles<input name="miles" inputMode="decimal" required placeholder="12.5" defaultValue={entry?formatMiles(Number(entry.miles_milli)):''} className="field mt-2"/></label>
      <label className="text-sm font-medium">Date<input name="date" type="date" required max={new Date().toISOString().slice(0,10)} defaultValue={entry?.occurred_on??new Date().toISOString().slice(0,10)} className="field mt-2"/></label>
      <label className="text-sm font-medium sm:col-span-2">Vehicle<select name="vehicleId" required defaultValue={entry?.vehicle_id??vehicles[0]?.id} className="field mt-2">{vehicles.map((v)=><option key={v.id} value={v.id}>{v.display_name}</option>)}</select></label>
      <label className="text-sm font-medium sm:col-span-2">Business purpose <span className="font-normal text-slate-500">(optional)</span><input name="businessPurpose" maxLength={1000} defaultValue={entry?.business_purpose??''} placeholder="Meeting with a customer" className="field mt-2"/></label>
      <details className="form-secondary-details sm:col-span-2" open={Boolean(entry?.job_label||entry?.destination)||undefined}><summary>Trip details <span>(optional)</span></summary><div className="form-group-fields"><label className="text-sm font-medium">Job or project <span className="font-normal text-slate-500">(optional)</span><input name="jobLabel" maxLength={200} defaultValue={entry?.job_label??''} className="field mt-2"/></label>
      <label className="text-sm font-medium">Destination <span className="font-normal text-slate-500">(optional)</span><input name="destination" maxLength={500} defaultValue={entry?.destination??''} className="field mt-2"/></label></div></details>
    </div>{error&&<p role="alert" className="notice notice-error mt-4">{error}</p>}<button disabled={busy} className="btn btn-primary mt-6 w-full sm:w-auto">{busy?'Saving…':entry?'Save correction':'Save mileage'}</button>
  </form>}

function VehicleForm({onDone,firstVehicle}:{onDone:()=>Promise<void>;firstVehicle:boolean}){const [error,setError]=useState<string|null>(null);return <form className="vehicle-composer" onSubmit={async(e)=>{e.preventDefault();const f=new FormData(e.currentTarget);const response=await fetch('/api/mileage/vehicles',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({displayName:f.get('displayName'),vehicleYear:f.get('vehicleYear'),make:f.get('make'),model:f.get('model'),isMixedUse:f.get('isMixedUse')==='yes'})});const data=await response.json().catch(()=>({}));if(!response.ok){setError(data.error??'Vehicle could not be added.');return}await onDone()}}>
  <p className="workspace-kicker">Your vehicle</p><h2 className="workspace-title">{firstVehicle?'What do you call this vehicle?':'Add a vehicle'}</h2>
  <WorkspaceField label="Vehicle name" className="vehicle-name-field"><input name="displayName" required maxLength={120} placeholder="My car" className="field"/></WorkspaceField>
  <WorkspaceGroup title="A few details · optional" className="vehicle-optional-group"><div className="vehicle-optional-fields"><WorkspaceField label="Year"><input name="vehicleYear" inputMode="numeric" className="field"/></WorkspaceField><WorkspaceField label="Make"><input name="make" maxLength={120} className="field"/></WorkspaceField><WorkspaceField label="Model"><input name="model" maxLength={120} className="field"/></WorkspaceField></div></WorkspaceGroup>
  <fieldset className="vehicle-use-choice"><legend>Do you also use it personally?</legend><div><label><input type="radio" name="isMixedUse" value="yes" defaultChecked/>Yes</label><label><input type="radio" name="isMixedUse" value="no"/>No, business only</label></div></fieldset>
  {error&&<p role="alert" className="notice notice-error">{error}</p>}<button className="btn btn-primary vehicle-save">Save vehicle <span aria-hidden="true">→</span></button></form>}


function VehicleTaxForm({vehicle,identity,method,onDone}:{vehicle:Vehicle;identity:VehicleIdentity|null;method:VehicleMethod|null;useFact:VehicleUse|null;onDone:()=>Promise<void>}){
  const year=new Date().getFullYear();const [busy,setBusy]=useState(false);const [message,setMessage]=useState<string|null>(null);const [error,setError]=useState<string|null>(null)
  async function save(body:Record<string,unknown>){setBusy(true);setError(null);setMessage(null);try{const response=await fetch(`/api/mileage/vehicles/${vehicle.id}/tax`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({...body,requestKey:crypto.randomUUID()}),signal:AbortSignal.timeout(15_000)});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error??'Vehicle details could not be saved.');await onDone();setMessage('Vehicle tracking saved.')}catch(cause){setError(cause instanceof Error?cause.message:'Vehicle details could not be saved.')}finally{setBusy(false)}}
  const selected=method?.method??'unresolved'
  return <div className="vehicle-details-form"><h3 className="font-semibold">{vehicle.display_name}</h3><div className="mt-4 grid gap-5">
    <label className="max-w-sm text-sm font-medium">Do you own or lease it?<select disabled={busy} value={identity?.ownership??'unknown'} onChange={event=>void save({kind:'identity',ownership:event.target.value,expectedEventId:identity?.id??null})} className="field mt-2"><option value="unknown">Choose one</option><option value="owned">I own it</option><option value="leased">I lease it</option></select></label>
    <fieldset><legend className="text-base font-semibold">How should I handle this vehicle for {year}?</legend><p className="mt-1 text-sm text-slate-600">Choose the way you want Betti to keep track of it.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">
      <button type="button" disabled={busy} aria-pressed={selected==='standard_mileage'} onClick={()=>void save({kind:'method',method:'standard_mileage',taxYear:year,expectedEventId:method?.id??null})} className={`min-h-24 rounded-xl border p-4 text-left transition ${selected==='standard_mileage'?'border-[#243186] bg-[#f1f2fb] ring-1 ring-[#243186]':'border-slate-300 bg-white hover:border-slate-400'}`}><strong className="block text-base text-slate-950">Track my business miles</strong><span className="mt-1 block text-sm leading-5 text-slate-600">Tell me the business miles you drive. I’ll handle the deduction.</span></button>
      <button type="button" disabled={busy} aria-pressed={selected==='actual_expenses'} onClick={()=>void save({kind:'method',method:'actual_expenses',taxYear:year,expectedEventId:method?.id??null})} className={`min-h-24 rounded-xl border p-4 text-left transition ${selected==='actual_expenses'?'border-[#243186] bg-[#f1f2fb] ring-1 ring-[#243186]':'border-slate-300 bg-white hover:border-slate-400'}`}><strong className="block text-base text-slate-950">Track my vehicle costs</strong><span className="mt-1 block text-sm leading-5 text-slate-600">I’ll track eligible costs and how much you use the vehicle for business.</span></button>
    </div></fieldset>
    {vehicle.is_mixed_use&&method?.method==='actual_expenses'&&!completedVehicleTaxYear(year)&&<p className="vehicle-year-note">Keep recording your business trips. We’ll finish the yearly mileage total after {year} ends.</p>}
  </div>{selected!=='unresolved'&&<p className="mt-3 text-sm leading-6 text-slate-600">Betti will keep the rules straight and make sure the same cost is not counted twice.</p>}{message&&<p role="status" className="mt-2 text-sm text-emerald-700">{message}</p>}{error&&<p role="alert" className="notice notice-error mt-2">{error}</p>}</div>
}

function formatCustomerDate(value:string){return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(`${value}T00:00:00Z`))}

function AnnualVehicleUse({vehicle,year,useFact,onDone}:{vehicle:Vehicle;year:number;useFact:VehicleUse|null;onDone:()=>Promise<void>}){
 const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null)
 const key=useRef(crypto.randomUUID())
 return <details className="annual-vehicle-use" open={needsAnnualVehicleUse({taxYear:year,method:'actual_expenses',isMixedUse:vehicle.is_mixed_use,totalMilesMilli:useFact?.total_miles_milli??null})||undefined}><summary>{vehicle.display_name} · {year} mileage</summary><form onSubmit={async event=>{event.preventDefault();if(busy)return;setBusy(true);setError(null);const data=new FormData(event.currentTarget)
  try{const response=await fetch(`/api/mileage/vehicles/${vehicle.id}/tax`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'total_miles',taxYear:year,totalMiles:String(data.get('totalMiles')),expectedEventId:useFact?.id??null,requestKey:key.current})});if(!response.ok)throw Error('Yearly mileage could not be saved. Please try again.');await onDone();key.current=crypto.randomUUID()}catch(cause){setError(cause instanceof Error?cause.message:'Please try again.')}finally{setBusy(false)}}}>
  <label>How many total miles did you drive in {year}?<input name="totalMiles" inputMode="decimal" required defaultValue={useFact?Number(useFact.total_miles_milli)/1000:''} className="field mt-2"/></label><p>Include business and personal driving. I’ll work out the business share.</p>{error&&<p role="alert">{error}</p>}<button className="btn btn-secondary" disabled={busy}>{busy?'Saving…':'Save yearly mileage'}</button>
 </form></details>
}
