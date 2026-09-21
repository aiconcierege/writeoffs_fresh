import {readFileSync} from 'node:fs'
import {describe,it,expect} from 'vitest'
const sql=readFileSync('supabase/migrations/20261005000600_plaid_offboarding_retention.sql','utf8')
describe('offboarding regression boundaries',()=>{
 it('scrubs terminated credentials without deleting the historical transaction ledger',()=>{
  const disconnect=sql.slice(0,sql.indexOf('-- Accept legacy'))
  expect(disconnect).toContain("access_token_ciphertext = ''")
  expect(disconnect).toContain('sync_cursor = null')
  expect(disconnect).toContain('sync_lease_id = null')
  expect(disconnect).not.toContain('delete from')
 })
 it('removes Item-owned inbox dependencies before the generic tenant cleanup',()=>{
  expect(sql.indexOf('delete from public.plaid_webhook_events')).toBeLessThan(sql.indexOf('for passes in 1..100 loop'))
  expect(sql).toContain('where business_id=selected.business_id')
 })
 it('supports both keyed and legacy retention tombstones with hosted pgcrypto',()=>{
  expect(sql).toContain('extensions.hmac')
  expect(sql).toContain('extensions.digest')
  expect(sql).not.toContain('public.digest')
  expect(sql).toContain("entry->>'reason'='retention_expired'")
 })
 it('does not let a customer-supplied time shorten deletion grace',()=>{
  const schedule=sql.slice(sql.indexOf('create or replace function public.schedule_customer_account_deletion'))
  expect(schedule.match(/p_now:=now\(\)/g)).toHaveLength(2)
  expect(schedule).toContain("p_now+interval '7 days'")
 })
})
