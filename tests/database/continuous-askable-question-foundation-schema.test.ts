import{readFileSync}from'node:fs'
import{describe,expect,it}from'vitest'

const sql=readFileSync('supabase/migrations/20260908000300_add_continuous_askable_question_foundation.sql','utf8')

describe('continuous askable question foundation schema',()=>{
  it('stores contractor deferrals as immutable version-bound tenant history',()=>{
    expect(sql).toContain('create table public.contractor_question_deferral_events')
    expect(sql).toContain('contractor_question_deferrals_no_mutation')
    expect(sql).toContain('enable row level security')
    expect(sql).toContain('contractor_question_deferrals_select_own')
    expect(sql).toContain('p_expected_source_version_id is distinct from p_question_id')
  })
  it('validates the current source leaf before deferring without resolving it',()=>{
    expect(sql).toContain("payment.payment_method='unknown'")
    expect(sql).toContain("status.status<>'on_file'")
    expect(sql).not.toMatch(/\b(update|delete)\s+public\.contractor_question_deferral_events/i)
    expect(sql).not.toMatch(/event_type[^\n]*(resolved|approved)/i)
  })
  it('exposes only an authenticated deferral RPC',()=>{
    expect(sql).toContain('grant execute on function public.defer_contractor_question')
    expect(sql).toContain('to authenticated;')
    expect(sql).toContain('from public,anon;')
  })
  it('database-gates bookkeeping leaves by tenant, current decision, deferral, and evidence fingerprint',()=>{
    expect(sql).toContain('list_current_askable_bookkeeping_question_event_ids')
    expect(sql).toContain('business.owner_user_id=(select auth.uid())')
    expect(sql).toContain('successor.supersedes_decision_id=event.based_on_decision_id')
    expect(sql).toContain('event.deferred_until<=p_as_of')
    expect(sql).toContain('current_bookkeeping_evidence_fingerprint')
    expect(sql).toContain('is not distinct from event.evidence_fingerprint')
  })
})
