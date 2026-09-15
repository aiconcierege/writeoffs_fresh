import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), membership: vi.fn(), readiness: vi.fn(), render: vi.fn() }))
vi.mock('../../utils/supabase/server', () => ({ createServerSupabase: async () => ({ auth: { getUser: mocks.auth } }) }))
vi.mock('../../app/lib/membership/entitlements', () => ({ loadCustomerEntitlements: mocks.membership }))
vi.mock('../../app/lib/bookkeeping/tax-year-readiness-service', () => ({
  getAuthenticatedTaxYearReadiness: mocks.readiness,
  validateTaxYear: (value: unknown) => { const year = Number(value); if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('INVALID_TAX_YEAR'); return year },
}))
vi.mock('../../app/lib/bookkeeping/tax-time-report-pdf', () => ({ createTaxTimeReportPdf: mocks.render }))
import { GET } from '../../app/api/reports/tax-time-report/route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ data: { user: { id: 'tenant-a' } } })
  mocks.membership.mockResolvedValue({ plan: 'business', lifecycle: 'active' })
  mocks.readiness.mockResolvedValue({ status: 'ready', taxYear: 2025 })
  mocks.render.mockResolvedValue(new Uint8Array(Buffer.from('%PDF-fixture')))
})
describe('private on-demand report delivery', () => {
  it.each(['businessId', 'business_id', 'tenant'])('rejects arbitrary %s access before reading books', async key => {
    const response = await GET(new Request(`https://example.test/api/reports/tax-time-report?year=2025&${key}=tenant-b`))
    expect(response.status).toBe(400)
    expect(mocks.readiness).not.toHaveBeenCalled()
  })
  it.each(['active', 'expired_read_only', 'pending_deletion'])('allows canonical %s historical access', async lifecycle => {
    mocks.membership.mockResolvedValue({ plan: 'business', lifecycle })
    const response = await GET(new Request('https://example.test/api/reports/tax-time-report?year=2025'))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('location')).toBeNull()
    expect(mocks.readiness).toHaveBeenCalledWith(expect.objectContaining({ taxYear: 2025, includeDataSourceHealth: lifecycle === 'active' }))
    expect(await response.text()).toBe('%PDF-fixture')
  })
  it('rejects deleted/unauthenticated users and absent membership', async () => {
    mocks.auth.mockResolvedValue({ data: { user: null } })
    expect((await GET(new Request('https://example.test/?year=2025'))).status).toBe(401)
    mocks.auth.mockResolvedValue({ data: { user: { id: 'a' } } })
    mocks.membership.mockResolvedValue({ plan: null, lifecycle: 'none' })
    expect((await GET(new Request('https://example.test/?year=2025'))).status).toBe(403)
    expect(mocks.render).not.toHaveBeenCalled()
  })
  it('blocks downloads until customer facts resolve and regenerates from current books', async () => {
    mocks.readiness.mockResolvedValueOnce({ status: 'needs_attention' })
    expect((await GET(new Request('https://example.test/?year=2025'))).status).toBe(409)
    expect(mocks.render).not.toHaveBeenCalled()
    expect((await GET(new Request('https://example.test/?year=2025'))).status).toBe(200)
    expect((await GET(new Request('https://example.test/?year=2025'))).status).toBe(200)
    expect(mocks.readiness).toHaveBeenCalledTimes(3)
  })
})
