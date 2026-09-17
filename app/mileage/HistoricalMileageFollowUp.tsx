'use client'
import type {HistoricalMileagePeriod} from '../lib/mileage/historical'
import {HistoricalMileage} from '../onboarding/HistoricalMileage'
export function HistoricalMileageFollowUp(props:{joinedMonth:string;vehicles:Array<{id:string;display_name:string}>;expectedId?:string;coverageStart?:string;initialPeriods?:HistoricalMileagePeriod[]}) {
 return <section className="mx-auto max-w-2xl border-b border-[#dce3de] py-8"><h2 className="text-2xl font-semibold">Your earlier business mileage</h2>{props.initialPeriods?.length&&<p className="mt-4 text-[#59665f]">Your miles are saved. Add the vehicle details when you have them.</p>}<HistoricalMileage {...props} onSaved={()=>window.location.reload()}/></section>
}
