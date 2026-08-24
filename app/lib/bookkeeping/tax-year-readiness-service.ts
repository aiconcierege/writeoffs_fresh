import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerAdminSupabase } from '../../../utils/supabase/admin'
import { getAuthenticatedCanonicalReport } from './reporting-service'
import { listCustomerQuestions } from './customer-questions'
import { deriveTaxYearReadiness } from './tax-year-readiness'

export function validateTaxYear(value: unknown) {
  const year = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('INVALID_TAX_YEAR')
  return year
}

export async function getAuthenticatedTaxYearReadiness(input: { supabase: SupabaseClient; taxYear: number }) {
  const taxYear = validateTaxYear(input.taxYear)
  const { data: { user } } = await input.supabase.auth.getUser()
  if (!user) throw new Error('AUTH_REQUIRED')
  const { data: business } = await input.supabase.from('businesses').select('id').eq('owner_user_id', user.id).maybeSingle()
  if (!business) throw new Error('BUSINESS_UNAVAILABLE')
  const start = `${taxYear}-01-01`, end = `${taxYear}-12-31`
  const [report, questions] = await Promise.all([
    getAuthenticatedCanonicalReport({ supabase: input.supabase, periodStart: start, periodEnd: end }),
    listCustomerQuestions({ supabase: input.supabase }),
  ])
  const admin = createServerAdminSupabase()
  const [{ data: jobs, error: jobsError }, { data: receiptEvents, error: receiptEventsError },
    { data: deductionAttentions, error: deductionError }, { data: facts, error: factsError },
    { data: invoices, error: invoiceError }, { data: plaidItems, error: plaidError }] = await Promise.all([
    admin.from('bookkeeping_processing_jobs').select('bookkeeping_record_id,state,created_at,bookkeeping_records!inner(occurred_on)')
      .eq('business_id', business.id).gte('bookkeeping_records.occurred_on', start).lte('bookkeeping_records.occurred_on', end)
      .order('created_at', { ascending: false }),
    input.supabase.from('bookkeeping_receipt_events').select('id,receipt_id,supersedes_event_id,event_type,created_at')
      .eq('business_id', business.id),
    input.supabase.from('current_deduction_attentions').select('id').eq('business_id', business.id).eq('event_type', 'opened'),
    input.supabase.from('current_deduction_business_facts').select('fact_type,fact_value').eq('business_id', business.id).eq('scope_kind', 'business'),
    input.supabase.from('current_canonical_invoices').select('status,bookkeeping_record_id,issue_date').eq('business_id', business.id)
      .gte('issue_date', start).lte('issue_date', end),
    admin.from('plaid_items').select('connection_status,consent_status').eq('business_id', business.id),
  ])
  if (jobsError || receiptEventsError || deductionError || factsError || invoiceError || plaidError) {
    throw new Error('READINESS_CONTEXT_UNAVAILABLE')
  }
  const factMap = new Map((facts ?? []).map(row => [String(row.fact_type), row.fact_value]))
  const regular = factMap.get('home_office_regular_use')
  const homeOfficeStarted = regular === true
  const incompleteHomeOfficeProfile = homeOfficeStarted && ['home_office_exclusive_use','home_office_square_feet','home_total_square_feet']
    .some(key => !factMap.has(key))
  const supersededReceiptEvents = new Set((receiptEvents ?? []).map(row => row.supersedes_event_id).filter(Boolean))
  const currentReceiptEvents = (receiptEvents ?? []).filter(row => !supersededReceiptEvents.has(row.id))
  const latestJobByRecord = new Map<string, { state: string }>()
  for (const job of jobs ?? []) if (!latestJobByRecord.has(String(job.bookkeeping_record_id))) {
    latestJobByRecord.set(String(job.bookkeeping_record_id), { state: String(job.state) })
  }
  const currentJobs = [...latestJobByRecord.values()]
  return deriveTaxYearReadiness(taxYear, {
    report, customerQuestions: questions, contractorSummaries: report.contractorSummaries,
    businessMilesMilli: report.businessMilesMilli, undatedRecordCount: report.completeness.undatedRecordCount,
    processingCount: currentJobs.filter(row => ['pending','processing','retryable'].includes(row.state)).length,
    failedProcessingCount: currentJobs.filter(row => row.state === 'dead_letter').length,
    // Receipt-understanding shadow jobs are intentionally excluded: shadow state
    // cannot make canonical customer records look incomplete.
    receiptProcessingCount: currentReceiptEvents.filter(row => row.event_type === 'uploaded'
      && String(row.created_at).startsWith(`${taxYear}-`)).length,
    openDeductionAttentionCount: deductionAttentions?.length ?? 0, incompleteHomeOfficeProfile,
    paidInvoiceWithoutIncomeCount: (invoices ?? []).filter(row => row.status === 'paid' && !row.bookkeeping_record_id).length,
    disconnectedDataSourceCount: (plaidItems ?? []).filter(row => row.connection_status === 'needs_attention'
      || row.connection_status === 'reconnect_required' || row.connection_status === 'disconnected'
      || row.consent_status !== 'active').length,
  })
}
