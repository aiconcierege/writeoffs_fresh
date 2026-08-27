import { describe, expect, it } from 'vitest'
import { greetingForTimeZone } from '../../app/home/HomeGreeting'

describe('Home greeting in the canonical business timezone', () => {
  it.each([
    ['2026-08-26T18:59:00Z', 'Good morning'],
    ['2026-08-26T19:00:00Z', 'Good afternoon'],
    ['2026-08-26T23:59:00Z', 'Good afternoon'],
    ['2026-08-27T00:00:00Z', 'Good evening'],
  ])('uses Phoenix boundaries at %s', (instant, expected) => {
    expect(greetingForTimeZone(new Date(instant), 'America/Phoenix')).toBe(expected)
  })

  it('does not use UTC when the stored timezone is elsewhere', () => {
    const instant = new Date('2026-08-26T01:30:00Z')
    expect(greetingForTimeZone(instant, 'America/Phoenix')).toBe('Good evening')
    expect(greetingForTimeZone(instant, 'UTC')).toBe('Good morning')
  })

  it('fails rather than silently inventing a timezone', () => {
    expect(() => greetingForTimeZone(new Date(), 'Not/A_Timezone')).toThrow()
  })
})
