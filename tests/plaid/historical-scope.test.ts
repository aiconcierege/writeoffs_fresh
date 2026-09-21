import { expect, it } from 'vitest'
import { validateOnboardingBusinessPatch } from '../../app/lib/onboarding/validation'
it('accepts an otherwise valid prior-year start beyond Plaid initial history', () => {
  expect(validateOnboardingBusinessPatch({ step: 'catch_up', data: { catch_up_start_date: '2022-01-01' } }, new Date('2026-09-21'))).toMatchObject({ ok: true, update: { catch_up_start_date: '2022-01-01' } })
})
