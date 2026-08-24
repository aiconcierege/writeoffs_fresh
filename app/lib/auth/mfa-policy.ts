export type MfaEnforcementMode = 'off' | 'enrolled' | 'required'

export function mfaEnforcementMode(value = process.env.MFA_ENFORCEMENT_MODE): MfaEnforcementMode {
  return value === 'off' || value === 'required' ? value : 'enrolled'
}

export function safeAuthenticatedNext(value: string | null | undefined, fallback = '/home') {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback
  if (value.startsWith('/login') || value.startsWith('/signup') || value.startsWith('/auth/')) return fallback
  return value
}

export function isMfaWorkflow(pathname: string) {
  return pathname === '/mfa/challenge' || pathname === '/settings/security'
}
