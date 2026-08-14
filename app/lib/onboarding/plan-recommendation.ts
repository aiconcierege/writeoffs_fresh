import {
  ONBOARDING_START_METHODS,
  type OnboardingBusinessUpdate,
} from './validation'

export const ONBOARDING_PLANS = {
  essential: {
    id: 'essential',
    name: 'Essential',
    monthlyPrice: 14.99,
    generallyRecommended: false,
    trialDays: 30,
    trialRequiresCreditCard: false,
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    monthlyPrice: 19.99,
    generallyRecommended: true,
    trialDays: 30,
    trialRequiresCreditCard: false,
  },
  premium_plus: {
    id: 'premium_plus',
    name: 'Premium Plus',
    monthlyPrice: 24.99,
    generallyRecommended: false,
    trialDays: 0,
    trialRequiresCreditCard: null,
  },
} as const

export type OnboardingPlanRecommendation =
  (typeof ONBOARDING_PLANS)[keyof typeof ONBOARDING_PLANS] & {
    informationalOnly: true
  }

type RecommendationInput = Pick<
  OnboardingBusinessUpdate,
  'expected_financial_account_count' | 'onboarding_start_method'
>

export function recommendOnboardingPlan(
  input: RecommendationInput
): OnboardingPlanRecommendation {
  const count = input.expected_financial_account_count
  const method = input.onboarding_start_method
  if (!Number.isInteger(count) || Number(count) < 0 || Number(count) > 6) {
    throw new Error('expected_financial_account_count must be an integer from 0 to 6')
  }
  if (
    typeof method !== 'string' ||
    !ONBOARDING_START_METHODS.includes(
      method as (typeof ONBOARDING_START_METHODS)[number]
    )
  ) {
    throw new Error('onboarding_start_method is invalid')
  }

  const plan =
    Number(count) >= 3
      ? ONBOARDING_PLANS.premium_plus
      : Number(count) >= 1 || method !== 'receipts'
        ? ONBOARDING_PLANS.premium
        : ONBOARDING_PLANS.essential

  return { ...plan, informationalOnly: true }
}
