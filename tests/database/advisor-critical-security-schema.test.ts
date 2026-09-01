import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const path = 'supabase/migrations/20260901000100_remediate_advisor_critical_security.sql'
const sql = readFileSync(path, 'utf8').toLowerCase()

describe('critical Supabase Advisor remediation schema', () => {
  it('makes contractor rules authenticated read-only reference data', () => {
    expect(sql).toContain('alter table public.contractor_awareness_rule_versions enable row level security')
    expect(sql).toContain('create policy contractor_awareness_rules_select_authenticated')
    expect(sql).toContain('for select to authenticated')
    expect(sql).toContain('using (true)')
    expect(sql).toContain('from public, anon, authenticated, service_role')
    expect(sql).toContain('grant select on table public.contractor_awareness_rule_versions')
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|truncate|all)[^;]*contractor_awareness_rule_versions/)
    expect(sql).not.toMatch(/grant\s+select[^;]*contractor_awareness_rule_versions[^;]*anon/)
  })

  it('uses one tightly scoped receipt status function behind an invoker view', () => {
    expect(sql).toContain('function public.read_customer_receipt_processing_status()')
    expect(sql).toContain('security definer')
    expect(sql).toContain("set search_path = ''")
    expect(sql).toContain('receipt.user_id = (select auth.uid())')
    expect(sql).toContain('business.owner_user_id = (select auth.uid())')
    expect(sql).toContain('event.business_id = receipt.business_id')
    expect(sql).toContain('job.business_id = receipt.business_id')
    expect(sql).toContain('with (security_invoker = true, security_barrier = true)')
    expect(sql).not.toContain('select job.*')
    expect(sql).not.toContain('grant execute on function public.read_customer_receipt_processing_status()\n  to service_role')
  })

  it('preserves the latest statement status contract with Business-scoped joins', () => {
    expect(sql).toContain('function public.read_customer_statement_status()')
    for (const field of [
      'transaction_count integer', 'statement_account_id uuid', 'account_link_id uuid',
      'account_link_event_id uuid', 'target_account_id uuid',
    ]) expect(sql).toContain(field)
    expect(sql).toContain('job.business_id = document.business_id')
    expect(sql).toContain('period.business_id = document.business_id')
    expect(sql).toContain('observation.business_id = period.business_id')
    expect(sql).toContain('active_link.business_id = document.business_id')
    expect(sql).toContain('document.owner_user_id = (select auth.uid())')
    expect(sql).not.toContain('select job.*')
    expect(sql).not.toContain('grant execute on function public.read_customer_statement_status()\n  to service_role')
  })

  it('does not alter global default privileges or customer bookkeeping data', () => {
    expect(sql).not.toContain('alter default privileges')
    expect(sql).not.toMatch(/\b(insert into|update|delete from|truncate table)\b/)
  })
})
