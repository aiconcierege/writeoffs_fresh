import { describe, expect, it } from 'vitest'
import { customerFirstName, projectBettiHome, timeOfDayGreeting } from '../../app/lib/home/betti-home'

const base = {
  name: 'Rick', greeting: 'Good morning', actionableReviewIds: [], receiptsProcessing: 0,
  receiptsNeedHelp: 0, outstandingDocumentation: 0,
}

describe('Betti-led Home projection', () => {
  it('makes an actionable canonical review the single primary request', () => {
    const state = projectBettiHome({ ...base, actionableReviewIds: ['review-1'] })
    expect(state.state).toBe('needs-customer')
    expect(state.heading).toBe('Good morning, Rick. I went through your books.')
    expect(state.action).toEqual({ href: '/weekly-review/review-1', label: 'See what Betti needs', note: 'I’ll ask one thing at a time.' })
  })

  it('distinguishes processing from customer intervention', () => {
    expect(projectBettiHome({ ...base, receiptsProcessing: 1 }).state).toBe('working')
    const attention = projectBettiHome({ ...base, receiptsNeedHelp: 2, receiptsProcessing: 1 })
    expect(attention.state).toBe('attention')
    expect(attention.action?.href).toBe('/receipts')
  })

  it('keeps ordinary documentation separate from caught-up bookkeeping', () => {
    const documentation = projectBettiHome({ ...base, outstandingDocumentation: 2 })
    expect(documentation.state).toBe('documentation-follow-up')
    expect(documentation.supporting).toContain('2 receipts')
    expect(documentation.action).toBeNull()
    expect(projectBettiHome(base)).toMatchObject({ state: 'caught-up', action: null })
  })

  it('uses safe profile names and time-zone-aware greetings', () => {
    expect(customerFirstName({ full_name: '  Rick Smith  ' })).toBe('Rick')
    expect(customerFirstName({ full_name: 'rick@example.com' })).toBeNull()
    expect(customerFirstName({})).toBeNull()
    expect(timeOfDayGreeting(new Date('2026-09-02T14:00:00Z'), 'America/Phoenix')).toBe('Good morning')
    expect(timeOfDayGreeting(new Date('2026-09-02T23:00:00Z'), 'America/Phoenix')).toBe('Good afternoon')
  })
})
