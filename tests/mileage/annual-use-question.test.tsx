import React from 'react'
import {createRequire} from 'node:module'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {completedVehicleTaxYear,needsAnnualVehicleUse,vehicleAnnualQuestionAvailable} from '../../app/lib/mileage/annual-use-question'
import {MileageClient} from '../../app/mileage/MileageClient'
const {renderToStaticMarkup}=createRequire(import.meta.url)('react-dom/server') as {renderToStaticMarkup:(node:React.ReactNode)=>string}
const now=new Date('2026-09-22T18:00:00Z')
const car={id:'vehicle',display_name:'My car',vehicle_year:null,make:null,model:null,is_mixed_use:true,archived_at:null}
afterEach(()=>vi.useRealTimers())
describe('annual vehicle use is a completed-year fact',()=>{
 it('does not request current/future annual totals, including the final day of the year',()=>{
  for(const taxYear of [2026,2027])expect(needsAnnualVehicleUse({taxYear,method:'actual_expenses',isMixedUse:true,totalMilesMilli:null},now)).toBe(false)
  expect(completedVehicleTaxYear(2026,new Date('2027-01-01T09:59:00Z'))).toBe(false)
  expect(completedVehicleTaxYear(2026,new Date('2027-01-01T10:00:00Z'))).toBe(true)
 })
 it('asks for an unresolved completed-year denominator only for actual costs',()=>{
  expect(needsAnnualVehicleUse({taxYear:2025,method:'actual_expenses',isMixedUse:true,totalMilesMilli:null},now)).toBe(true)
  for(const method of ['standard_mileage','unresolved','cpa_review'] as const)expect(needsAnnualVehicleUse({taxYear:2025,method,isMixedUse:true,totalMilesMilli:null},now)).toBe(false)
  expect(needsAnnualVehicleUse({taxYear:2025,method:'actual_expenses',isMixedUse:false,totalMilesMilli:null},now)).toBe(false)
  expect(needsAnnualVehicleUse({taxYear:2025,method:'actual_expenses',isMixedUse:true,totalMilesMilli:20000000},now)).toBe(false)
 })
 it('keeps prematurely opened annual questions unavailable without changing other questions',()=>{
  expect(vehicleAnnualQuestionAvailable('vehicle_total_miles','vehicle:2026',now)).toBe(false)
  expect(vehicleAnnualQuestionAvailable('vehicle_total_miles','vehicle:2025',now)).toBe(true)
  expect(vehicleAnnualQuestionAvailable('vehicle_total_miles','bad',now)).toBe(false)
  expect(vehicleAnnualQuestionAvailable('phone_business_use_percentage','phone',now)).toBe(true)
 })
 it('keeps current leased actual-cost entry usable and exposes completed-year follow-up',()=>{
  vi.useFakeTimers();vi.setSystemTime(now)
  const html=renderToStaticMarkup(<MileageClient initialVehicles={[car]} initialEntries={[]} initialVehicleIdentities={[{id:'i',vehicle_id:'vehicle',ownership:'leased',business_use_began_on:null,lease_started_on:null,lease_ended_on:null}]} initialVehicleMethods={[{id:'m26',vehicle_id:'vehicle',tax_year:2026,method:'actual_expenses'},{id:'m25',vehicle_id:'vehicle',tax_year:2025,method:'actual_expenses'}]}/>)
  expect(html).toContain('Add a business trip');expect(html).toContain('after 2026 ends')
  expect(html).not.toContain('How many total miles did you drive in 2026?')
  expect(html).toContain('How many total miles did you drive in 2025?')
 })
 it('first use has meaningful setup and no empty history/export/cancel furniture',()=>{
  const html=renderToStaticMarkup(<MileageClient initialVehicles={[]} initialEntries={[]}/>);
  expect(html).toContain('Let’s set up your vehicle.');expect(html).toContain('What do you call this vehicle?')
  expect(html).not.toContain('Recorded trips');expect(html).not.toContain('Download mileage');expect(html).not.toContain('Cancel')
 })
})
