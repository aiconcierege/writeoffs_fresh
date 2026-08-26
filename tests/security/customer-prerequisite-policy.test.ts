import { describe, expect, it } from 'vitest'
import { nextRequiredCustomerDestination, type CustomerPrerequisiteState } from '../../app/lib/auth/prerequisite-policy'

const complete: CustomerPrerequisiteState = {
  mfaSatisfied: true,
  mfaFactorEnrolled: true,
  membershipLifecycle: 'active',
  onboardingComplete: true,
  getStartedComplete: true,
}

describe('authenticated customer prerequisite policy', () => {
  it('orders MFA, membership, onboarding, get started, then the requested product route', () => {
    expect(nextRequiredCustomerDestination({ ...complete, mfaSatisfied: false, mfaFactorEnrolled: false }, '/home'))
      .toBe('/settings/security?enroll=required&next=%2Fhome')
    expect(nextRequiredCustomerDestination({ ...complete, mfaSatisfied: false }, '/transactions'))
      .toBe('/mfa/challenge?next=%2Ftransactions')
    expect(nextRequiredCustomerDestination({ ...complete, membershipLifecycle: null }, '/home')).toBe('/membership')
    expect(nextRequiredCustomerDestination({ ...complete, onboardingComplete: false }, '/home')).toBe('/onboarding')
    expect(nextRequiredCustomerDestination({ ...complete, getStartedComplete: false }, '/home')).toBe('/get-started')
    expect(nextRequiredCustomerDestination(complete, '/reports')).toBeNull()
  })

  it('allows only the route needed for the current prerequisite and safe account recovery routes', () => {
    expect(nextRequiredCustomerDestination({ ...complete, membershipLifecycle: null }, '/membership')).toBeNull()
    expect(nextRequiredCustomerDestination({ ...complete, membershipLifecycle: null }, '/transactions')).toBe('/membership')
    expect(nextRequiredCustomerDestination({ ...complete, onboardingComplete: false }, '/onboarding')).toBeNull()
    expect(nextRequiredCustomerDestination({ ...complete, onboardingComplete: false }, '/reports')).toBe('/onboarding')
    expect(nextRequiredCustomerDestination({ ...complete, getStartedComplete: false }, '/receipts')).toBeNull()
    expect(nextRequiredCustomerDestination({ ...complete, getStartedComplete: false }, '/home')).toBe('/get-started')
    expect(nextRequiredCustomerDestination({ ...complete, membershipLifecycle: null }, '/settings/security')).toBeNull()
  })

  it('keeps expired customers in historical mode and never trusts unsafe continuations', () => {
    expect(nextRequiredCustomerDestination({ ...complete, membershipLifecycle: 'expired_read_only' }, '/home')).toBe('/membership/read-only')
    expect(nextRequiredCustomerDestination({ ...complete, mfaSatisfied: false }, '//evil.example'))
      .toBe('/mfa/challenge?next=%2Fhome')
  })
})
