'use client'
import {useRef,useState} from 'react'
import {historicalMileagePeriods,type HistoricalMileagePeriod} from '../lib/mileage/historical'
export function HistoricalMileage({joinedMonth,coverageStart,vehicles,expectedId,initialPeriods,onSaved}:{joinedMonth:string;coverageStart?:string;initialPeriods?:HistoricalMileagePeriod[];vehicles:Array<{id:string;display_name:string}>;expectedId?:string;onSaved:(answer:string,id:string)=>void}) {
 const periods=initialPeriods?.length?initialPeriods:historicalMileagePeriods(joinedMonth,coverageStart),[values,setValues]=useState<string[]>(periods.map((_,i)=>initialPeriods?.[i]?String(initialPeriods[i].milesMilli/1000):'')),[vehicleId,setVehicle]=useState('')
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),requests=useRef(new Map<string,string>()),lock=useRef(false)
 const date=(value:string)=>new Intl.DateTimeFormat('en-US',{month:'long',day:'numeric',timeZone:'UTC'}).format(new Date(value+'T00:00:00Z'))
 async function save(answer:'entered'|'zero'|'deferred') {
  if(lock.current)return
  if(answer==='entered'&&values.some(v=>!/^\d{1,6}(\.\d{1,3})?$/.test(v))){setError('Enter miles for each period, or come back to this later.');return}
  lock.current=true;setBusy(true);setError('')
  const payload={answer,vehicleId:vehicleId||null,expectedId:expectedId||null,periods:answer==='entered'?periods.map((p,i)=>({...p,milesMilli:Math.round(Number(values[i])*1000)})):null}
  const fingerprint=JSON.stringify(payload),requestId=requests.current.get(fingerprint)??crypto.randomUUID();requests.current.set(fingerprint,requestId)
  try{const response=await fetch('/api/onboarding/historical-mileage',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...payload,requestId})});const body=await response.json();if(!response.ok)throw new Error(body.error);onSaved(answer,body.id)}catch(e){setError(e instanceof Error?e.message:'We couldn’t save these miles.')}finally{lock.current=false;setBusy(false)}
 }
 return <div><p className="mt-4 leading-7 text-[#59665f]">Enter the business miles from {periods[0]?date(periods[0].from):'January 1'} through {periods.at(-1)?date(periods.at(-1)!.through):'the start of your membership'}. Use your mileage log or other records to determine this number.</p>
 {periods.length>1&&<p className="mt-4 text-sm leading-6 text-[#59665f]">Enter each period from your records so we can use the right mileage rate and match the months in your books.</p>}
 <div className="mt-6 space-y-5">{periods.map((period,index)=><label className="block text-sm font-semibold" key={period.from}>{date(period.from)} – {date(period.through)}<input inputMode="decimal" className="field mt-2" value={values[index]} onChange={e=>setValues(current=>current.map((v,i)=>i===index?e.target.value:v))} aria-label={`Business miles ${date(period.from)} through ${date(period.through)}`}/></label>)}</div>
 {vehicles.length>0&&<label className="mt-5 block text-sm font-semibold">Which vehicle was this for?<select className="field mt-2" value={vehicleId} onChange={e=>setVehicle(e.target.value)}><option value="">I’ll add the vehicle details later</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.display_name}</option>)}</select></label>}
 <p className="mt-4 text-sm leading-6 text-[#59665f]">These are totals for the period, including any trips already recorded in WriteOffs. We’ll keep the miles saved if vehicle details are still needed.</p>
 <div className="mt-6 grid gap-3"><button type="button" disabled={busy} className="btn btn-primary min-h-12" onClick={()=>void save('entered')}>Save business miles</button><button type="button" disabled={busy} className="btn btn-secondary min-h-12" onClick={()=>void save('zero')}>I had no business driving in this period</button><button type="button" disabled={busy} className="min-h-12 text-sm font-semibold text-[#243186]" onClick={()=>void save('deferred')}>I’ll come back to this</button></div>{error&&<p role="alert" className="mt-4 text-red-700">{error}</p>}</div>
}
