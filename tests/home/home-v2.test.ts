import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
const home = readFileSync('app/home/page.tsx', 'utf8')
const bettiHero = readFileSync('app/home/HomeBettiHero.tsx', 'utf8')
const bettiModel = readFileSync('app/lib/home/betti-home.ts', 'utf8')
const quickActions = readFileSync('app/home/HomeQuickActions.tsx', 'utf8')
const financial = readFileSync('app/home/HomeVisuals.tsx', 'utf8')
const weeklyPage = readFileSync('app/weekly-review/[id]/page.tsx', 'utf8')
const weeklyIndex = readFileSync('app/weekly-review/page.tsx', 'utf8')
const weeklyReadModel = readFileSync('app/lib/bookkeeping/weekly-review.ts', 'utf8')
const styles = readFileSync('app/globals.css', 'utf8')

describe('Home command center', () => {
  it('keeps the large potential-writeoff value treatment off Home', () => {
    expect(home).not.toContain('getAuthenticatedPotentialWriteoffs')
    expect(home).not.toContain('Potential writeoffs found in')
    expect(home).not.toContain('home-value')
    expect(home).not.toContain(".from('transactions')")
  })

  it('moves the weekly workflow off Home and gives Betti one direct invitation', () => {
    expect(home).not.toContain('<WeeklyReview')
    expect(home).toContain('<HomeBettiHero projection={betti} actions=')
    expect(bettiModel).toContain("label: 'Answer Betti’s questions'")
    expect(bettiHero).not.toContain('Not right now')
    expect(bettiHero).not.toContain('/api/bookkeeping/reviews')
  })

  it('projects Home language exclusively from shared Betti work', () => {
    expect(home).toContain('loadBettiWork')
    expect(home).toContain('homeCommand(work,')
    expect(home).not.toMatch(/askableQuestionCount|receiptWorkflow|HomeOperatingStatus/)
  })

  it('keeps financial presentation within membership scope', () => {
    expect(home).toContain('business={isBusiness}')
    expect(financial).toContain('<dt>Business income</dt>')
    expect(financial).toContain('<dt>Estimated profit</dt>')
    expect(financial).not.toContain('home-financial-operator')
    expect(home).toContain('Income and profit are outside its reporting scope.')
  })

  it('offers compact Add something actions with mobile receipt capture priority', () => {
    for (const label of ['Send documents', 'Add mileage', 'Add money', 'Create invoice']) {
      expect(quickActions).toContain(label)
    }
    const upload = readFileSync('app/receipts/ReceiptUploadAction.tsx', 'utf8')
    expect(upload).toContain("label='Upload receipt'")
    expect(quickActions).not.toContain('DocumentIntake')
    expect(quickActions).toContain('href="/import"')
    for (const copy of ['Tell Betti anytime','Send documents']) expect(quickActions).toContain(copy)
    expect(quickActions).not.toContain('Quick actions')
    expect(styles).toContain('.home-add-list')
    expect(styles).toContain('@media (max-width:639px)')
  })

  it('removes the chatbot-like Ask Betti input from primary Home', () => {
    expect(home).not.toContain('HomeAskBetti')
    expect(home).not.toContain('How can I help?')
    expect(home).not.toContain('Ask Betti about your books')
  })

  it('uses one canonical Betti hero before her financial work and customer actions', () => {
    expect(bettiHero.match(/<BettiPresence/g)).toHaveLength(1)
    expect(home.indexOf('<HomeBettiHero')).toBeLessThan(home.indexOf('home-financial'))
    expect(home.indexOf('home-financial')).toBeLessThan(home.indexOf('<HomeRecentActivity'))
    expect(home.indexOf('<HomeQuickActions')).toBeLessThan(home.indexOf('<HomeRecentActivity'))
    expect(styles).toContain('.home-betti-hero')
    expect(styles).toContain('@media (max-width:340px)')
    expect(styles).toContain('.home-add-list { grid-template-columns: repeat(2,minmax(0,1fr))')
    expect(bettiHero).toContain('data-betti-state={projection.state}')
    expect(readFileSync('app/components/experience/BettiPresence.tsx', 'utf8')).toContain('decorative')
    expect(quickActions).toContain('<svg')
  })

  it('renders recent transactions and receipt matches only from available data',()=>{
    const recent=readFileSync('app/home/HomeRecentActivity.tsx','utf8')
    expect(home).toContain('<HomeRecentActivity activity={recentActivity}/>')
    expect(recent).toContain('Recent transactions')
    expect(recent).toContain('<Link href="/transactions">View all')
    expect(recent).toContain('Recent receipt matches')
    expect(recent).toContain('Recently handled by Betti')
    expect(recent).toContain('activity.receiptMatches.length>0&&')
    expect(recent).toContain("if(!activity.transactions.length&&!activity.receiptMatches.length)return null")
    expect(recent).toContain('home-merchant-fallback')
    expect(recent).not.toMatch(/logo vendor|clearbit|brandfetch/i)
  })
})

describe('legacy weekly review compatibility', () => {
  it('redirects old customer URLs to the continuous check-in while retaining internal history reads', () => {
    expect(weeklyIndex).toContain("redirect('/check-in')")
    expect(weeklyPage).toContain("redirect('/check-in')")
    expect(weeklyReadModel).toContain(".eq('business_id',businessId).order('period_start',{ascending:true})")
    expect(weeklyReadModel).toContain("if(reviewId)periodQuery=periodQuery.eq('id',reviewId)")
  })

  it('keeps deferred and terminal reviews out of active selection', () => {
    expect(weeklyReadModel).toContain("['confirmed','closed_unreviewed'].includes(leaf.event_type)")
    expect(weeklyReadModel).toContain("actionable:leaf.event_type!=='deferred'")
    expect(weeklyReadModel).toContain("if(leaf?.event_type==='deferred')continue")
  })

  it('does not expose the old workflow in navigation', () => {
    const header = readFileSync('app/components/Header.tsx', 'utf8')
    expect(header).not.toContain('Weekly Review')
  })
})
