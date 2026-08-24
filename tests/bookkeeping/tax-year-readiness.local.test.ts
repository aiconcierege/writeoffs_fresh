import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { provisionLocalCanonicalOwner } from '../helpers/local-canonical'

const url = process.env.LOCAL_SUPABASE_URL
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY
const enabled = process.env.RUN_LOCAL_SUPABASE_INTEGRATION === '1' && Boolean(url && anonKey && serviceKey)
const suite = enabled ? describe.sequential : describe.skip

suite('tax-year readiness against local PostgreSQL', () => {
  it('derives tenant-scoped unresolved and processing state without another ledger or queue', async () => {
    process.env.SUPABASE_URL = url
    process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey
    const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
    const owner = await provisionLocalCanonicalOwner({ admin, url: url!, anonKey: anonKey!,
      label: 'tax-readiness', amounts: [200000, -50000], occurredYear: 2025 })
    const other = await provisionLocalCanonicalOwner({ admin, url: url!, anonKey: anonKey!,
      label: 'tax-readiness-other', amounts: [] })
    const { getAuthenticatedTaxYearReadiness } = await import('../../app/lib/bookkeeping/tax-year-readiness-service')
    const readiness = await getAuthenticatedTaxYearReadiness({ supabase: owner.customer, taxYear: 2025 })
    expect(readiness.taxYear).toBe(2025)
    expect(readiness.status).toBe('needs_attention')
    expect(readiness.dimensions.find(dimension => dimension.key === 'income')?.status).toBe('needs_attention')
    expect(readiness.dimensions.find(dimension => dimension.key === 'expenses')?.status).toBe('needs_attention')
    const isolated = await getAuthenticatedTaxYearReadiness({ supabase: other.customer, taxYear: 2025 })
    expect(isolated.totals).toMatchObject({ businessIncomeCents: 0, businessExpensesCents: 0 })
    expect(isolated.issues.some(issue => issue.recordId && readiness.issues.some(ownerIssue => ownerIssue.recordId === issue.recordId))).toBe(false)
  })
})
