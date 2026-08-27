import{describe,expect,it}from'vitest'
import{CANONICAL_STAGING_SUPABASE_HOST,validateStagingReviewOpener}from'../../scripts/lib/staging-review-opener-safety'
import{readFileSync}from'node:fs'
const valid={environment:'staging',url:`https://${CANONICAL_STAGING_SUPABASE_HOST}`,expectedHost:CANONICAL_STAGING_SUPABASE_HOST,
 email:'qa@example.test',allowlist:'qa@example.test',asOf:'2026-08-28',now:new Date('2026-08-27T12:00:00Z')}
describe('designated staging weekly-review opener',()=>{
 it('rejects production and a non-allowlisted account',()=>{
  expect(()=>validateStagingReviewOpener({...valid,environment:'production'})).toThrow(/only in staging/)
  expect(()=>validateStagingReviewOpener({...valid,email:'other@example.test'})).toThrow(/not an explicitly designated/)
 })
 it('pins the dedicated staging project and a bounded review date',()=>{
  expect(()=>validateStagingReviewOpener({...valid,url:'https://production.supabase.co',expectedHost:'production.supabase.co'})).toThrow(/approved staging project/)
  expect(()=>validateStagingReviewOpener({...valid,asOf:'2026-09-30'})).toThrow(/seven days/)
  expect(validateStagingReviewOpener(valid)).toMatchObject({email:'qa@example.test',asOf:'2026-08-28'})
 })
 it('derives the Business from the designated Auth identity and calls the canonical scoped worker',()=>{
  const source=readFileSync('scripts/open-staging-test-weekly-review.ts','utf8')
  expect(source).not.toMatch(/argument\(['"]--business-id/)
  expect(source).toContain("user_metadata?.staging_test_user!==true")
  expect(source).toContain('prepareWeeklyReviews({admin,asOf:safety.asOf,businessId:business.data.id,limit:1})')
  expect(source).toContain('historical immutable review event changed')
  expect(JSON.parse(readFileSync('package.json','utf8')).scripts['staging:review:open']).toContain('--conditions=react-server')
 })
 it('keeps deterministic existing-period reuse in the canonical worker',()=>{
  const worker=readFileSync('app/lib/bookkeeping/weekly-review-processing.ts','utf8')
  expect(worker).toContain(".eq('check_in_date',checkInDate).maybeSingle()")
  expect(worker).toContain("if(input.businessId)cadenceQuery=cadenceQuery.eq('business_id',input.businessId)")
  expect(worker).toContain("admin.from('business_memberships').select('plan,lifecycle')")
  expect(worker).not.toContain("admin.from('current_customer_membership')")
 })
})
