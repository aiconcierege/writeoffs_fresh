'use client'

import { useMemo, useRef, useState } from 'react'
import { formatMiles } from '../lib/mileage/validation'
import { AuthenticatedPage } from '../components/ui'

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
  return <AuthenticatedPage className="mileage-page" title="Mileage" description="Tell me about your business driving. I’ll keep the record.">
    <div className="mileage-workspace">
    <div className="mileage-entry">
    {addingVehicle&&<VehicleForm firstVehicle={active.length===0} onDone={async()=>{setAddingVehicle(false);await refresh()}}/>}
    {!addingVehicle&&active.length>0&&<MileageForm vehicles={active} entry={editing} onDone={async()=>{setEditing(null);setMessage('Mileage saved.');await refresh()}}/>}
    <div className="mt-4"><button onClick={()=>setAddingVehicle((v)=>!v)} className="min-h-11 text-sm font-semibold text-[#243186]">{addingVehicle?'Cancel':'Add vehicle'}</button></div>
    </div>
    <aside className="mileage-vehicle-context" aria-label="Your vehicles">
    {vehicles.length>0&&<details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-slate-600">Vehicles</summary>
      <div className="mt-2 grid gap-2">{vehicles.map((vehicle)=><div key={vehicle.id} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm"><span>{vehicle.display_name} · {vehicle.archived_at?'Inactive':'Active'}</span>
        <button className="min-h-10 font-semibold text-[#243186]" onClick={async()=>{await fetch(`/api/mileage/vehicles/${vehicle.id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({active:Boolean(vehicle.archived_at)})});await refresh()}}>{vehicle.archived_at?'Make active':'Make inactive'}</button></div>)}</div></details>}
    {active.length>0&&<details className="mt-7" open={methods.some(row=>row.method==='unresolved')||methods.length===0}><summary id="vehicle-tracking-heading" className="min-h-11 cursor-pointer py-2 text-lg font-semibold">Finish setting up your vehicle</summary><p className="mt-1 text-sm text-slate-600">Betti needs this once for each vehicle. You can still record trips while you decide.</p><section className="mt-3 grid gap-4" aria-labelledby="vehicle-tracking-heading">
      {active.map(vehicle=><VehicleTaxForm key={vehicle.id} vehicle={vehicle} identity={identities.find(row=>row.vehicle_id===vehicle.id)??null}
        method={methods.find(row=>row.vehicle_id===vehicle.id&&row.tax_year===new Date().getFullYear())??null}
        useFact={useFacts.find(row=>row.vehicle_id===vehicle.id&&row.tax_year===new Date().getFullYear())??null} onDone={refresh}/>)}</section></details>}
    </aside></div>
    {message&&<p role="status" className="mt-3 text-sm text-emerald-700">{message}</p>}
    <section className="mt-9 border-t border-slate-200 pt-6" aria-labelledby="trips-heading"><div className="flex flex-wrap items-center justify-between gap-3"><h2 id="trips-heading" className="text-lg font-semibold">Recorded trips</h2><a href={`/api/mileage/export?year=${new Date().getFullYear()}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-[#243186]">Download mileage</a></div>
      {entries.length===0?<div className="empty-state"><h3>No trips recorded yet</h3><p>Add a business trip above. It only takes a few seconds.</p></div>:<div className="record-list mt-4">{entries.map((entry)=><article key={entry.id} className="record-row py-5">
        <div className="flex items-start justify-between gap-4"><div><p className="font-semibold text-slate-950">{formatMiles(Number(entry.miles_milli))} miles</p>
          <p className="mt-1 text-sm text-slate-600">{formatCustomerDate(entry.occurred_on)} · {vehicleNames.get(entry.vehicle_id)??'Vehicle'}</p>
          {(entry.business_purpose||entry.destination||entry.job_label)&&<p className="mt-2 text-sm text-slate-700">{[entry.business_purpose,entry.destination,entry.job_label].filter(Boolean).join(' · ')}</p>}</div>
          <button onClick={()=>setEditing(entry)} className="min-h-11 px-2 text-sm font-semibold text-[#243186]">Edit</button></div>
        <button onClick={async()=>{if(!confirm('Remove this mileage from current records?'))return;await fetch(`/api/mileage/${entry.id}`,{method:'DELETE',headers:{'content-type':'application/json','idempotency-key':`void-${crypto.randomUUID()}`},body:JSON.stringify({expectedEventId:entry.current_event_id})});await refresh()}}
          className="mt-2 min-h-11 text-sm font-semibold text-slate-600">Remove</button>
      </article>)}</div>}
    </section>
  </AuthenticatedPage>
}

function MileageForm({vehicles,entry,onDone}:{vehicles:Vehicle[];entry:Entry|null;onDone:()=>Promise<void>}){
  const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);const key=useRef(crypto.randomUUID())
  return <form key={entry?.id??'new'} className="authenticated-form-surface" onSubmit={async(e)=>{e.preventDefault();if(busy)return;setBusy(true);setError(null);const form=e.currentTarget;const f=new FormData(form);let saved=false
    try {const body={miles:String(f.get('miles')),occurredOn:String(f.get('date')),vehicleId:String(f.get('vehicleId')),jobLabel:String(f.get('jobLabel')??''),destination:String(f.get('destination')??''),businessPurpose:String(f.get('businessPurpose')??''),...(entry?{expectedEventId:entry.current_event_id}:{})}
      const response=await fetch(entry?`/api/mileage/${entry.id}`:'/api/mileage/create',{method:entry?'PATCH':'POST',headers:{'content-type':'application/json','idempotency-key':`mileage-${key.current}`},body:JSON.stringify(body),signal:AbortSignal.timeout(15_000)})
      const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error??'Mileage could not be saved.')
      saved=true;key.current=crypto.randomUUID();form.reset();await onDone()
    } catch(cause) {setError(saved?'Mileage was saved, but the list could not be refreshed. Reload to see it.':cause instanceof Error&&cause.name!=='TimeoutError'?cause.message:'Mileage could not be saved. Please try again.')
    } finally {setBusy(false)}}}>
    <h2 className="text-lg font-semibold">{entry?'Correct trip':'Add a business trip'}</h2><div className="trip-primary-fields mt-5 grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium">Business miles<input name="miles" inputMode="decimal" required placeholder="12.5" defaultValue={entry?formatMiles(Number(entry.miles_milli)):''} className="field mt-2"/></label>
      <label className="text-sm font-medium">Date<input name="date" type="date" required max={new Date().toISOString().slice(0,10)} defaultValue={entry?.occurred_on??new Date().toISOString().slice(0,10)} className="field mt-2"/></label>
      <label className="text-sm font-medium sm:col-span-2">Vehicle<select name="vehicleId" required defaultValue={entry?.vehicle_id??vehicles[0]?.id} className="field mt-2">{vehicles.map((v)=><option key={v.id} value={v.id}>{v.display_name}</option>)}</select></label>
      <label className="text-sm font-medium sm:col-span-2">Business purpose <span className="font-normal text-slate-500">(optional)</span><input name="businessPurpose" maxLength={1000} defaultValue={entry?.business_purpose??''} placeholder="Meeting with a customer" className="field mt-2"/></label>
      <details className="form-secondary-details sm:col-span-2" open={Boolean(entry?.job_label||entry?.destination)||undefined}><summary>Trip details <span>(optional)</span></summary><div className="form-group-fields"><label className="text-sm font-medium">Job or project <span className="font-normal text-slate-500">(optional)</span><input name="jobLabel" maxLength={200} defaultValue={entry?.job_label??''} className="field mt-2"/></label>
      <label className="text-sm font-medium">Destination <span className="font-normal text-slate-500">(optional)</span><input name="destination" maxLength={500} defaultValue={entry?.destination??''} className="field mt-2"/></label></div></details>
    </div>{error&&<p role="alert" className="notice notice-error mt-4">{error}</p>}<button disabled={busy} className="btn btn-primary mt-6 w-full sm:w-auto">{busy?'Saving…':entry?'Save correction':'Save mileage'}</button>
  </form>}

function VehicleForm({onDone,firstVehicle}:{onDone:()=>Promise<void>;firstVehicle:boolean}){const [error,setError]=useState<string|null>(null);return <form className="authenticated-form-surface" onSubmit={async(e)=>{e.preventDefault();const f=new FormData(e.currentTarget);const response=await fetch('/api/mileage/vehicles',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({displayName:f.get('displayName'),vehicleYear:f.get('vehicleYear'),make:f.get('make'),model:f.get('model'),isMixedUse:f.get('isMixedUse')==='yes'})});const data=await response.json().catch(()=>({}));if(!response.ok){setError(data.error??'Vehicle could not be added.');return}await onDone()}}>
  <h2 className="text-lg font-semibold">{firstVehicle?'First, add your vehicle':'Add a vehicle'}</h2>{firstVehicle&&<p className="mt-2 text-sm leading-6 text-slate-600">You only need to do this once before recording your first trip.</p>}<div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium sm:col-span-2">Vehicle name<input name="displayName" required maxLength={120} placeholder="My car" className="field mt-2"/></label><div className="vehicle-optional-fields grid grid-cols-3 gap-3 sm:col-span-2"><label className="text-sm font-medium">Year <span className="font-normal text-slate-500">(optional)</span><input name="vehicleYear" inputMode="numeric" className="field mt-2"/></label><label className="text-sm font-medium">Make <span className="font-normal text-slate-500">(optional)</span><input name="make" maxLength={120} className="field mt-2"/></label><label className="text-sm font-medium">Model <span className="font-normal text-slate-500">(optional)</span><input name="model" maxLength={120} className="field mt-2"/></label></div><fieldset className="vehicle-use-choice sm:col-span-2"><legend>Also used personally?</legend><div><label><input type="radio" name="isMixedUse" value="yes" defaultChecked/>Yes</label><label><input type="radio" name="isMixedUse" value="no"/>No, business only</label></div></fieldset></div>{error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}<button className="btn btn-primary mt-5 min-h-12">Save vehicle</button></form>}

function VehicleTaxForm({vehicle,identity,method,useFact,onDone}:{vehicle:Vehicle;identity:VehicleIdentity|null;method:VehicleMethod|null;useFact:VehicleUse|null;onDone:()=>Promise<void>}){
  const year=new Date().getFullYear();const [busy,setBusy]=useState(false);const [message,setMessage]=useState<string|null>(null);const [error,setError]=useState<string|null>(null)
  async function save(body:Record<string,unknown>){setBusy(true);setError(null);setMessage(null);try{const response=await fetch(`/api/mileage/vehicles/${vehicle.id}/tax`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({...body,requestKey:crypto.randomUUID()}),signal:AbortSignal.timeout(15_000)});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error??'Vehicle details could not be saved.');await onDone();setMessage('Vehicle tracking saved.')}catch(cause){setError(cause instanceof Error?cause.message:'Vehicle details could not be saved.')}finally{setBusy(false)}}
  const selected=method?.method??'unresolved'
  return <div className="vehicle-details-form"><h3 className="font-semibold">{vehicle.display_name}</h3><div className="mt-4 grid gap-5">
    <label className="max-w-sm text-sm font-medium">Do you own or lease it?<select disabled={busy} value={identity?.ownership??'unknown'} onChange={event=>void save({kind:'identity',ownership:event.target.value,expectedEventId:identity?.id??null})} className="field mt-2"><option value="unknown">Choose one</option><option value="owned">I own it</option><option value="leased">I lease it</option></select></label>
    <fieldset><legend className="text-base font-semibold">How should I handle this vehicle for {year}?</legend><p className="mt-1 text-sm text-slate-600">Choose the way you want Betti to keep track of it.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">
      <button type="button" disabled={busy} aria-pressed={selected==='standard_mileage'} onClick={()=>void save({kind:'method',method:'standard_mileage',taxYear:year,expectedEventId:method?.id??null})} className={`min-h-24 rounded-xl border p-4 text-left transition ${selected==='standard_mileage'?'border-[#243186] bg-[#f1f2fb] ring-1 ring-[#243186]':'border-slate-300 bg-white hover:border-slate-400'}`}><strong className="block text-base text-slate-950">Track my business miles</strong><span className="mt-1 block text-sm leading-5 text-slate-600">Tell me the business miles you drive. I’ll handle the deduction.</span></button>
      <button type="button" disabled={busy} aria-pressed={selected==='actual_expenses'} onClick={()=>void save({kind:'method',method:'actual_expenses',taxYear:year,expectedEventId:method?.id??null})} className={`min-h-24 rounded-xl border p-4 text-left transition ${selected==='actual_expenses'?'border-[#243186] bg-[#f1f2fb] ring-1 ring-[#243186]':'border-slate-300 bg-white hover:border-slate-400'}`}><strong className="block text-base text-slate-950">Track my vehicle costs</strong><span className="mt-1 block text-sm leading-5 text-slate-600">I’ll track eligible costs and how much you use the vehicle for business.</span></button>
    </div></fieldset>
    {vehicle.is_mixed_use&&method?.method==='actual_expenses'&&<form className="sm:col-span-2" onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);void save({kind:'total_miles',taxYear:year,totalMiles:String(data.get('totalMiles')),expectedEventId:useFact?.id??null})}}><label className="text-sm font-medium">About how many total miles did you drive this vehicle in {year}?<div className="mt-1 flex gap-2"><input name="totalMiles" inputMode="decimal" required defaultValue={useFact?Number(useFact.total_miles_milli)/1000:''} className="min-h-12 min-w-0 flex-1 rounded-md border border-slate-300 px-3 text-base"/><button disabled={busy} className="btn btn-secondary min-h-12">Save</button></div></label></form>}
  </div>{selected!=='unresolved'&&<p className="mt-3 text-sm leading-6 text-slate-600">Betti will keep the rules straight and make sure the same cost is not counted twice.</p>}{message&&<p role="status" className="mt-2 text-sm text-emerald-700">{message}</p>}{error&&<p role="alert" className="notice notice-error mt-2">{error}</p>}</div>
}

function formatCustomerDate(value:string){return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(`${value}T00:00:00Z`))}
