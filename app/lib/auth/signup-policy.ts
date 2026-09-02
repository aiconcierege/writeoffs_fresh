type SignupEnvironment = {
  WRITEOFFS_ENVIRONMENT?: string
  NEXT_PUBLIC_ENABLE_SIGNUP?: string
}

/**
 * Signup is intentionally available in production-shaped staging, remains
 * waitlist-only in production, and is explicit for local/test environments.
 */
export function isCustomerSignupEnabled(env: SignupEnvironment = process.env as SignupEnvironment) {
  const environment = env.WRITEOFFS_ENVIRONMENT ?? 'local'
  if (environment === 'production') return false
  if (environment === 'staging') return true
  return env.NEXT_PUBLIC_ENABLE_SIGNUP === 'true'
}
