'use client'

import { useMemo, useRef, useState } from 'react'
import { formatMiles } from '../lib/mileage/validation'
import { BettiPageIntro } from '../components/ui'

type Vehicle = { id:string;display_name:string;vehicle_year:number|null;make:string|null;model:string|null;is_mixed_use:boolean|null;archived_at:string|null }
type Entry = { id:string;current_event_id:string;miles_milli:number;occurred_on:string;vehicle_id:string;job_label:string|null;destination:string|null;business_purpose:string|null }

export function MileageClient({ initialVehicles, initialEntries }: { initialVehicles:Vehicle[];initialEntries:Entry[] }) {
  const [vehicles,setVehicles]=useState(initialVehicles); const [entries,setEntries]=useState(initialEntries)
  const [addingVehicle,setAddingVehicle]=useState(vehicles.filter((v)=>!v.archived_at).length===0)
  const [editing,setEditing]=useState<Entry|null>(null); const [message,setMessage]=useState<string|null>(null)
  const active=vehicles.filter((v)=>!v.archived_at); const vehicleNames=useMemo(()=>new Map(vehicles.map((v)=>[v.id,v.display_name])),[vehicles])
  async function refresh(){const response=await fetch('/api/mileage/list',{cache:'no-store',signal:AbortSignal.timeout(10_000)});if(!response.ok)throw new Error('Mileage list could not be refreshed.')
    const data=await response.json();setVehicles(data.vehicles);setEntries(data.entries)}
  return <main className="app-page -mx-4 -mb-10 sm:-mx-6 lg:-mx-8"><div className="page-container page-container-narrow">
    <BettiPageIntro state="welcome" eyebrow="Business driving" title="Tell me about your business driving.">
      Add the miles, date, and business reason. I’ll keep the records together for you.
    </BettiPageIntro>
    {addingVehicle&&<VehicleForm firstVehicle={active.length===0} onDone={async()=>{setAddingVehicle(false);await refresh()}}/>}
    {!addingVehicle&&active.length>0&&<MileageForm vehicles={active} entry={editing} onDone={async()=>{setEditing(null);setMessage('Mileage saved.');await refresh()}}/>}
    <div className="mt-4"><button onClick={()=>setAddingVehicle((v)=>!v)} className="min-h-11 text-sm font-semibold text-[#243186]">{addingVehicle?'Cancel':'Add vehicle'}</button></div>
    {vehicles.length>0&&<details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-slate-600">Vehicles</summary>
      <div className="mt-2 grid gap-2">{vehicles.map((vehicle)=><div key={vehicle.id} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm"><span>{vehicle.display_name} · {vehicle.archived_at?'Inactive':'Active'}</span>
        <button className="min-h-10 font-semibold text-[#243186]" onClick={async()=>{await fetch(`/api/mileage/vehicles/${vehicle.id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({active:Boolean(vehicle.archived_at)})});await refresh()}}>{vehicle.archived_at?'Make active':'Make inactive'}</button></div>)}</div></details>}
    {message&&<p role="status" className="mt-3 text-sm text-emerald-700">{message}</p>}
    <section className="mt-9 border-t border-slate-200 pt-6" aria-labelledby="trips-heading"><div className="flex flex-wrap items-center justify-between gap-3"><h2 id="trips-heading" className="text-lg font-semibold">Recorded trips</h2><a href={`/api/mileage/export?year=${new Date().getFullYear()}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-[#243186]">Download mileage</a></div>
      {entries.length===0?<div className="empty-state"><h3>No mileage yet</h3><p>Add a business trip above. It only takes a few seconds.</p></div>:<div className="record-list mt-4">{entries.map((entry)=><article key={entry.id} className="record-row py-5">
        <div className="flex items-start justify-between gap-4"><div><p className="font-semibold text-slate-950">{formatMiles(Number(entry.miles_milli))} miles</p>
          <p className="mt-1 text-sm text-slate-600">{entry.occurred_on} · {vehicleNames.get(entry.vehicle_id)??'Vehicle'}</p>
          {(entry.business_purpose||entry.destination||entry.job_label)&&<p className="mt-2 text-sm text-slate-700">{[entry.business_purpose,entry.destination,entry.job_label].filter(Boolean).join(' · ')}</p>}</div>
          <button onClick={()=>setEditing(entry)} className="min-h-11 px-2 text-sm font-semibold text-[#243186]">Edit</button></div>
        <button onClick={async()=>{if(!confirm('Remove this mileage from current records?'))return;await fetch(`/api/mileage/${entry.id}`,{method:'DELETE',headers:{'content-type':'application/json','idempotency-key':`void-${crypto.randomUUID()}`},body:JSON.stringify({expectedEventId:entry.current_event_id})});await refresh()}}
          className="mt-2 min-h-11 text-sm font-semibold text-slate-600">Remove</button>
      </article>)}</div>}
    </section>
  </div></main>
}

function MileageForm({vehicles,entry,onDone}:{vehicles:Vehicle[];entry:Entry|null;onDone:()=>Promise<void>}){
  const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);const key=useRef(crypto.randomUUID())
  return <form key={entry?.id??'new'} className="surface mt-7 p-5 sm:p-7" onSubmit={async(e)=>{e.preventDefault();if(busy)return;setBusy(true);setError(null);const form=e.currentTarget;const f=new FormData(form);let saved=false
    try {const body={miles:String(f.get('miles')),occurredOn:String(f.get('date')),vehicleId:String(f.get('vehicleId')),jobLabel:String(f.get('jobLabel')??''),destination:String(f.get('destination')??''),businessPurpose:String(f.get('businessPurpose')??''),...(entry?{expectedEventId:entry.current_event_id}:{})}
      const response=await fetch(entry?`/api/mileage/${entry.id}`:'/api/mileage/create',{method:entry?'PATCH':'POST',headers:{'content-type':'application/json','idempotency-key':`mileage-${key.current}`},body:JSON.stringify(body),signal:AbortSignal.timeout(15_000)})
      const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error??'Mileage could not be saved.')
      saved=true;key.current=crypto.randomUUID();form.reset();await onDone()
    } catch(cause) {setError(saved?'Mileage was saved, but the list could not be refreshed. Reload to see it.':cause instanceof Error&&cause.name!=='TimeoutError'?cause.message:'Mileage could not be saved. Please try again.')
    } finally {setBusy(false)}}}>
    <h2 className="text-lg font-semibold">{entry?'Correct trip':'Add mileage'}</h2><div className="mt-4 grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium">Miles<input name="miles" inputMode="decimal" required placeholder="12.5" defaultValue={entry?formatMiles(Number(entry.miles_milli)):''} className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3 text-base"/></label>
      <label className="text-sm font-medium">Date<input name="date" type="date" required max={new Date().toISOString().slice(0,10)} defaultValue={entry?.occurred_on??new Date().toISOString().slice(0,10)} className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3 text-base"/></label>
      <label className="text-sm font-medium sm:col-span-2">Vehicle<select name="vehicleId" required defaultValue={entry?.vehicle_id??vehicles[0]?.id} className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3 text-base">{vehicles.map((v)=><option key={v.id} value={v.id}>{v.display_name}</option>)}</select></label>
      <label className="text-sm font-medium sm:col-span-2">Business purpose <span className="font-normal text-slate-500">(optional)</span><input name="businessPurpose" maxLength={1000} defaultValue={entry?.business_purpose??''} placeholder="Meeting with a customer" className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3 text-base"/></label>
      <label className="text-sm font-medium">Job or project <span className="font-normal text-slate-500">(optional)</span><input name="jobLabel" maxLength={200} defaultValue={entry?.job_label??''} className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3 text-base"/></label>
      <label className="text-sm font-medium">Destination <span className="font-normal text-slate-500">(optional)</span><input name="destination" maxLength={500} defaultValue={entry?.destination??''} className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3 text-base"/></label>
    </div>{error&&<p role="alert" className="notice notice-error mt-4">{error}</p>}<button disabled={busy} className="btn btn-primary mt-6 w-full sm:w-auto">{busy?'Saving…':entry?'Save correction':'Save mileage'}</button>
  </form>}

function VehicleForm({onDone,firstVehicle}:{onDone:()=>Promise<void>;firstVehicle:boolean}){const [error,setError]=useState<string|null>(null);return <form className="surface mt-7 p-5 sm:p-7" onSubmit={async(e)=>{e.preventDefault();const f=new FormData(e.currentTarget);const response=await fetch('/api/mileage/vehicles',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({displayName:f.get('displayName'),vehicleYear:f.get('vehicleYear'),make:f.get('make'),model:f.get('model'),isMixedUse:f.get('isMixedUse')==='yes'})});const data=await response.json().catch(()=>({}));if(!response.ok){setError(data.error??'Vehicle could not be added.');return}await onDone()}}>
  <h2 className="text-lg font-semibold">{firstVehicle?'First, tell us which vehicle you use for business':'Add a vehicle'}</h2>{firstVehicle&&<p className="mt-2 text-sm leading-6 text-slate-600">You only need to do this once before recording your first trip.</p>}<div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium sm:col-span-2">Vehicle name<input name="displayName" required maxLength={120} placeholder="My car" className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3 text-base"/></label><label className="text-sm font-medium">Year <span className="font-normal text-slate-500">(optional)</span><input name="vehicleYear" inputMode="numeric" className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3 text-base"/></label><label className="text-sm font-medium">Make <span className="font-normal text-slate-500">(optional)</span><input name="make" maxLength={120} className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3 text-base"/></label><label className="text-sm font-medium">Model <span className="font-normal text-slate-500">(optional)</span><input name="model" maxLength={120} className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3 text-base"/></label><label className="text-sm font-medium">Also used personally?<select name="isMixedUse" defaultValue="yes" className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3 text-base"><option value="yes">Yes</option><option value="no">No</option></select></label></div>{error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}<button className="btn btn-primary mt-5 min-h-12">Save vehicle</button></form>}
