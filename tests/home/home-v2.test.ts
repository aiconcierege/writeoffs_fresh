import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { resolveAskBettiDestination } from '../../app/home/HomeAskBetti'

const home = readFileSync('app/home/page.tsx', 'utf8')
const invitation = readFileSync('app/home/HomeReviewInvitation.tsx', 'utf8')
const quickActions = readFileSync('app/home/HomeQuickActions.tsx', 'utf8')
const financial = readFileSync('app/home/HomeVisuals.tsx', 'utf8')
const weeklyPage = readFileSync('app/weekly-review/[id]/page.tsx', 'utf8')
const weeklyIndex = readFileSync('app/weekly-review/page.tsx', 'utf8')
const weeklyReadModel = readFileSync('app/lib/bookkeeping/weekly-review.ts', 'utf8')
const styles = readFileSync('app/globals.css', 'utf8')

describe('Home command center', () => {
  it('derives potential-writeoff dollars canonically without manufacturing savings', () => {
    expect(home).toContain('getAuthenticatedPotentialWriteoffs')
    expect(home).toContain('potential.items.reduce((sum,item)=>sum+item.businessAmountCents,0)')
    expect(home).toContain('Potential writeoffs found in')
    expect(home).toContain('This is not an estimate of tax savings or a refund.')
    expect(home).not.toContain('potential.count')
    expect(home).not.toContain(".from('transactions')")
  })

  it('moves the weekly workflow off Home and keeps invitation dismissal local', () => {
    expect(home).not.toContain('<WeeklyReview')
    expect(home).toContain('<HomeReviewInvitation count={waitingCount}/>')
    expect(invitation).toContain('href="/weekly-review"')
    expect(invitation).toContain('Are you ready for your weekly review?')
    expect(invitation).toContain("setDismissed(true)")
    expect(invitation).not.toContain('/api/bookkeeping/reviews')
  })

  it('supports truthful zero, one, and many review language', () => {
    expect(home).toContain('waitingCount=actionable.length')
    expect(home).toContain("waitingCount>0?'Your books need your attention.'")
    expect(home).toContain("waitingCount===1?'One weekly review is'")
    expect(home).toContain('`${waitingCount} weekly reviews are`')
    expect(home).toContain("'Your books are up to date.'")
    expect(home).toContain("'I’ll keep working in the background.'")
    expect(invitation).toContain("count===1?'One weekly review is waiting.'")
  })

  it('keeps financial presentation within membership scope', () => {
    expect(home).toContain('business={isBusiness}')
    expect(financial).toContain('<span>Business income</span>')
    expect(financial).toContain('<span>Estimated business profit</span>')
    expect(home).toContain('Income and profit are outside its reporting scope.')
  })

  it('offers compact actions with mobile receipt capture priority', () => {
    for (const label of ['Add miles', 'Record money', 'Create invoice']) {
      expect(quickActions).toContain(label)
    }
    const upload = readFileSync('app/receipts/ReceiptUploadAction.tsx', 'utf8')
    expect(upload).toContain('Upload receipt</span>')
    expect(quickActions).toContain('mobileLabel="Take a picture"')
    expect(quickActions).toContain('capture="environment"')
    expect(styles).toContain('.home-quick-list')
    expect(styles).toContain('@media (max-width:639px)')
  })

  it('provides bounded deterministic Ask Betti routing and admits its limit', () => {
    expect(resolveAskBettiDestination('Show me my July report')).toBe('/reports')
    expect(resolveAskBettiDestination('I need to add mileage')).toBe('/mileage')
    expect(resolveAskBettiDestination("Did I upload the Lowe's receipt?")).toBe("/transactions?q=Lowe's")
    expect(resolveAskBettiDestination('Explain depreciation for my exact situation')).toBeNull()
    const ask = readFileSync('app/home/HomeAskBetti.tsx', 'utf8')
    expect(ask).toContain('I can’t safely answer that question from here yet.')
  })

  it('uses one Betti and keeps the established visual hierarchy mobile-safe', () => {
    expect(home.match(/<BettiIllustration/g)).toHaveLength(1)
    expect(home.indexOf('home-agent-hero')).toBeLessThan(home.indexOf('home-value'))
    expect(home.indexOf('home-value')).toBeLessThan(home.indexOf('home-financial'))
    expect(home.indexOf('home-financial')).toBeLessThan(home.indexOf('home-tools'))
    expect(home.indexOf('home-tools')).toBeLessThan(home.indexOf('home-recent'))
    expect(styles).toContain('.home-agent-betti')
    expect(styles).toContain('@media (max-width:340px)')
  })
})

describe('dedicated weekly review routing', () => {
  it('resolves the oldest actionable review and protects exact period identity', () => {
    expect(weeklyIndex).toContain('reviews.find(review=>review.actionable)')
    expect(weeklyIndex).toContain("redirect(oldest?`/weekly-review/${oldest.id}`:'/home')")
    expect(weeklyPage).toContain('getCustomerWeeklyReviewById(supabase,id)')
    expect(weeklyPage).toContain('if(!review||!selected||!selected.actionable)notFound()')
    expect(weeklyReadModel).toContain(".eq('business_id',businessId).order('period_start',{ascending:true})")
    expect(weeklyReadModel).toContain("if(reviewId)periodQuery=periodQuery.eq('id',reviewId)")
  })

  it('keeps deferred and terminal reviews out of active selection', () => {
    expect(weeklyReadModel).toContain("['confirmed','closed_unreviewed'].includes(leaf.event_type)")
    expect(weeklyReadModel).toContain("actionable:leaf.event_type!=='deferred'")
    expect(weeklyReadModel).toContain("if(leaf?.event_type==='deferred')continue")
  })

  it('moves completion to the next actionable period through the canonical resolver', () => {
    const weekly = readFileSync('app/home/WeeklyReview.tsx', 'utf8')
    expect(weekly).toContain('href="/weekly-review" className="btn btn-primary">Review next week')
    expect(weekly).toContain('Math.max(0,waitingCount-1)')
    expect(weeklyIndex).toContain('reviews.find(review=>review.actionable)')
  })

  it('allows another actionable week without making it navigation', () => {
    expect(weeklyPage).toContain('Choose another week')
    expect(weeklyPage).toContain('actionable.map')
    expect(weeklyPage).toContain('href={`/weekly-review/${item.id}`}')
    const header = readFileSync('app/components/Header.tsx', 'utf8')
    expect(header).not.toContain('Weekly Review')
  })
})
