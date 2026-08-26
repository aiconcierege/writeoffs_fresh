import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseMilesToMilli, validateMileageFacts } from '../../app/lib/mileage/validation'

const source=(file:string)=>readFileSync(resolve(process.cwd(),file),'utf8')
describe('canonical mileage product',()=>{
  it('parses exact mileage without floating-point storage',()=>{
    expect(parseMilesToMilli('12.345')).toBe(12345);expect(parseMilesToMilli('0.1')).toBe(100)
    expect(parseMilesToMilli('1.2345')).toBeNull();expect(parseMilesToMilli('0')).toBeNull()
  })
  it('validates required facts and bounded optional job context',()=>{
    const result=validateMileageFacts({vehicleId:'11111111-1111-4111-8111-111111111111',miles:'8.5',occurredOn:'2026-08-24',jobLabel:'Kitchen remodel',destination:'Main St',businessPurpose:'Client visit'},'2026-08-24')
    expect(result).toEqual({ok:true,value:{vehicleId:'11111111-1111-4111-8111-111111111111',milesMilli:8500,occurredOn:'2026-08-24',jobLabel:'Kitchen remodel',destination:'Main St',businessPurpose:'Client visit'}})
    expect(validateMileageFacts({...('ok' in result&&result.ok?{}:{}),vehicleId:'bad'},'2026-08-24').ok).toBe(false)
  })
  it('provides a protected mobile-first fast form and factual copy',()=>{
    const page=source('app/mileage/MileageClient.tsx');const policy=source('app/lib/route-policy.ts')
    expect(policy).toContain("'/mileage'");expect(page).toContain('inputMode="decimal"')
    expect(page).toContain('Business purpose');expect(page).toContain('Job or project')
    expect(page).not.toMatch(/standard mileage|actual expense method|choose.*method/i)
    expect(page).toContain('finally {setBusy(false)}')
    expect(page).toContain('AbortSignal.timeout')
  })
  it('keeps legacy APIs on canonical services and reports facts fail closed',()=>{
    expect(source('app/api/mileage/create/route.ts')).toContain("rpc('record_canonical_mileage'")
    expect(source('app/api/mileage/list/route.ts')).toContain('listMileageContext')
    expect(source('app/lib/bookkeeping/reporting-service.ts')).toContain('mileageDeductionCents: null')
    expect(source('app/lib/bookkeeping/reporting-service.ts')).toContain("'facts_only'")
  })
  it('does not couple mileage to transactions or receipts',()=>{
    const migration=source('supabase/migrations/20260824000200_add_canonical_business_mileage.sql')
    expect(migration).not.toContain('financial_transactions');expect(migration).not.toContain('receipts')
  })
})
