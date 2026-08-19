import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
const page = readFileSync('app/onboarding/page.tsx', 'utf8')
const signup = readFileSync('app/signup/page.tsx', 'utf8')
const home = readFileSync('app/home/page.tsx', 'utf8')

describe('canonical onboarding entry and existing-user compatibility', () => {
  it('requires auth and loads exactly the authenticated owner Business', () => {
    expect(page).toContain('supabase.auth.getUser()')
    expect(page).toContain("redirect('/login')")
    expect(page).toContain(".from('businesses')")
    expect(page).toContain(".eq('owner_user_id', user.id)")
  })
  it('redirects only users whose current v3 facts are complete', () => {
    expect(page).toContain('onboardingNeedsFollowUp')
    expect(page).toContain("redirect('/home')")
    expect(page).not.toContain(".from('business_vehicles')")
    expect(page).toContain("params.edit === '1'")
  })
  it('sends new signups into onboarding and gives existing users a minimal Home follow-up', () => {
    expect(signup).toContain("router.push('/onboarding')")
    expect(home).toContain('A few business details need an update')
    expect(home).toContain('Your existing work stays in place.')
  })
})
