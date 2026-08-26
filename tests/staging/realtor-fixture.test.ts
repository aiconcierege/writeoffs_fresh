import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'

const script=readFileSync('scripts/populate-staging-realtor.mjs','utf8')
const repair=readFileSync('scripts/repair-staging-realtor-functional-fixture.mjs','utf8')

describe('staging realtor UX fixture',()=>{
 it('fails closed on environment, host, designated identity, and nonfresh books',()=>{
  expect(script).toContain("need('WRITEOFFS_ENVIRONMENT')!=='staging'")
  expect(script).toContain("new URL(url).host!==expected")
  expect(script).toContain("allowed.has(email)")
  expect(script).toContain("Reset this Business before applying the fixture")
 })
 it('uses canonical workflows and never manufactures display totals or receipt matches',()=>{
  for(const contract of ['ingest_csv_financial_activity','append_bookkeeping_decision','open_bookkeeping_review_issue_v2',
   'keep_unmatched_bookkeeping_receipt_with_facts','record_canonical_mileage','create_canonical_invoice','set_business_review_cadence']){
   expect(script).toContain(contract)
  }
  expect(script).not.toContain('potential_writeoff_count')
 expect(script).not.toContain('attach_bookkeeping_receipt_journey')
 })
 it('keeps functional fixture repair staging-only and append-only',()=>{
  expect(repair).toContain("need('WRITEOFFS_ENVIRONMENT') !== 'staging'")
  expect(repair).toContain("new URL(url).host !== need('WRITEOFFS_EXPECTED_SUPABASE_HOST')")
  expect(repair).toContain('allowed.has(email)')
  expect(repair).toContain("rpc('append_bookkeeping_decision'")
  expect(repair).toContain("rpc('open_bookkeeping_review_issue_v2'")
  expect(repair).not.toMatch(/\.from\([^\n]+\)\.(?:delete|update)\(/)
 })
})
