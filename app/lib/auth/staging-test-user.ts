type StagingTestEnvironment = {
  WRITEOFFS_ENVIRONMENT?: string
  WRITEOFFS_STAGING_TEST_USERS?: string
  WRITEOFFS_STAGING_MFA_BYPASS_ENABLED?: string
}

function designatedEmails(value: string | undefined) {
  return new Set((value ?? '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean))
}

/** A narrow application-policy exception. It never changes Supabase's real AAL. */
export function hasStagingTestMfaBypass(email: string | null | undefined, env: StagingTestEnvironment = process.env as StagingTestEnvironment) {
  if (env.WRITEOFFS_ENVIRONMENT !== 'staging') return false
  if (env.WRITEOFFS_STAGING_MFA_BYPASS_ENABLED !== 'true') return false
  if (!email) return false
  return designatedEmails(env.WRITEOFFS_STAGING_TEST_USERS).has(email.trim().toLowerCase())
}
