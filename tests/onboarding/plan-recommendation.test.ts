import { describe, expect, it } from 'vitest'
import {
  ONBOARDING_PLANS,
  recommendOnboardingPlan,
} from '../../app/lib/onboarding/plan-recommendation'

describe('v2 informational plan recommendation', () => {
  it('recommends Essential for zero accounts and receipt-oriented use', () => {
    expect(
      recommendOnboardingPlan({
        expected_financial_account_count: 0,
        onboarding_start_method: 'receipts',
      })
    ).toMatchObject({
      id: 'essential',
      monthlyPrice: 14.99,
      trialDays: 30,
      trialRequiresCreditCard: false,
      informationalOnly: true,
    })
  })

  it.each([1, 2])('recommends Premium for %i expected accounts', (count) => {
    expect(
      recommendOnboardingPlan({
        expected_financial_account_count: count,
        onboarding_start_method: 'connected_financial_accounts',
      })
    ).toMatchObject({
      id: 'premium',
      monthlyPrice: 19.99,
      generallyRecommended: true,
      trialDays: 30,
      trialRequiresCreditCard: false,
    })
  })

  it.each([3, 6])('recommends Premium Plus for %i expected accounts', (count) => {
    expect(
      recommendOnboardingPlan({
        expected_financial_account_count: count,
        onboarding_start_method: 'connected_financial_accounts',
      })
    ).toMatchObject({
      id: 'premium_plus',
      monthlyPrice: 24.99,
      trialDays: 0,
    })
  })

  it.each(['connected_financial_accounts', 'statement_uploads'] as const)(
    'does not recommend Essential for the %s workflow',
    (method) => {
      expect(
        recommendOnboardingPlan({
          expected_financial_account_count: 0,
          onboarding_start_method: method,
        }).id
      ).toBe('premium')
    }
  )

  it('defines exactly the three approved monthly products', () => {
    expect(ONBOARDING_PLANS).toMatchObject({
      essential: { monthlyPrice: 14.99 },
      premium: { monthlyPrice: 19.99, generallyRecommended: true },
      premium_plus: { monthlyPrice: 24.99, trialDays: 0 },
    })
  })
})
