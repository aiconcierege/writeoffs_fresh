import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

const migration = read(
  'supabase/migrations/20260811000300_restore_profiles_and_vertical_integrity.sql'
)
const settingsForm = read('app/settings/profile/SettingsForm.tsx')
const profileUpdate = read('app/api/profile/update/route.ts')

describe('Profile provisioning and vertical integrity', () => {
  it('backfills a Profile for every existing auth user missing one', () => {
    expect(migration).toContain("select users.id, 'general'")
    expect(migration).toContain('left join public.profiles as profiles on profiles.id = users.id')
    expect(migration).toContain('where profiles.id is null')
  })

  it('provisions both Profile and Business for every new auth user', () => {
    expect(migration).toContain('insert into public.profiles (id, vertical)')
    expect(migration).toContain('insert into public.businesses (')
    expect(migration).toContain('create or replace function public.create_business_for_new_user()')
  })

  it('retains constrained legacy values without exposing them as current settings', () => {
    expect(migration).toContain("vertical not in ('general', 'realtor')")
    expect(migration).toContain("check (vertical in ('general', 'realtor'))")
    expect(settingsForm).not.toMatch(/vertical|realtor|general pack|business profile/i)
    expect(profileUpdate).not.toMatch(/vertical|realtor|industry pack/i)
  })

  it('synchronizes the Profile vertical to Business industry', () => {
    expect(migration).toContain('create trigger sync_profile_vertical_to_business')
    expect(migration).toContain('set industry = new.vertical')
    expect(migration).toContain('where owner_user_id = new.id')
  })

  it('does not silently succeed when the Profile is missing', () => {
    expect(profileUpdate).toContain("count: 'exact'")
    expect(profileUpdate).toMatch(/count !== 1/)
    expect(profileUpdate).toMatch(/profile is unavailable/i)
  })
})
