import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const page = readFileSync(join(process.cwd(), 'app/onboarding/page.tsx'), 'utf8')
const header = readFileSync(join(process.cwd(), 'app/components/Header.tsx'), 'utf8')

describe('/onboarding server page', () => {
  it('requires authentication and redirects completed users safely', () => {
    expect(page).toContain('supabase.auth.getUser()')
    expect(page).toContain("redirect('/login')")
    expect(page).toContain("business.onboarding_state === 'completed'")
    expect(page).toContain("redirect('/home')")
  })

  it('loads the one Business by authenticated owner and active vehicles by Business', () => {
    expect(page).toContain(".from('businesses')")
    expect(page).toContain(".eq('owner_user_id', user.id)")
    expect(page).toContain(".from('business_vehicles')")
    expect(page).toContain(".eq('business_id', business.id)")
    expect(page).toContain(".is('archived_at', null)")
    expect(page).toContain(".order('slot')")
  })

  it('does not query Profile, vertical, or industry data', () => {
    expect(page).not.toContain(".from('profiles')")
    expect(page).not.toMatch(/\bvertical\b/i)
    expect(page).not.toMatch(/\bindustry\b/i)
  })

  it('uses a simplified header only for onboarding', () => {
    expect(header).toContain('pathname === "/onboarding"')
    expect(header).toContain('<SignOutButton />')
    expect(header).toContain('navItems.map')
  })
})
