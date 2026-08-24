import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { startTotpEnrollment } from '../../app/lib/auth/totp-enrollment'

function mfa(overrides: Record<string, unknown> = {}) {
  return {
    listFactors: vi.fn().mockResolvedValue({ data: { all: [] }, error: null }),
    unenroll: vi.fn().mockResolvedValue({ error: null }),
    enroll: vi.fn().mockResolvedValue({
      data: { id: 'factor-1', totp: { qr_code: 'data:image/svg+xml,test', secret: 'SETUPSECRET' } },
      error: null,
    }),
    ...overrides,
  }
}

describe('MFA enrollment interaction', () => {
  it('starts TOTP enrollment and returns the instructions displayed by the client', async () => {
    const client = mfa()
    await expect(startTotpEnrollment(client)).resolves.toEqual({
      factorId: 'factor-1',
      qrCode: 'data:image/svg+xml,test',
      secret: 'SETUPSECRET',
    })
    expect(client.enroll).toHaveBeenCalledWith({ factorType: 'totp', friendlyName: 'WriteOffs authenticator' })
  })

  it('fails visibly when factor lookup, cleanup, enrollment, or payload validation fails', async () => {
    await expect(startTotpEnrollment(mfa({
      listFactors: vi.fn().mockResolvedValue({ data: null, error: { message: 'network' } }),
    }))).rejects.toThrow('factor_lookup_failed')
    await expect(startTotpEnrollment(mfa({
      enroll: vi.fn().mockResolvedValue({ data: null, error: { message: 'disabled' } }),
    }))).rejects.toThrow('enrollment_failed')

    const component = readFileSync('app/settings/security/SecuritySettings.tsx', 'utf8')
    expect(component).toContain('action={SECURITY_SETTINGS_PATH}')
    expect(component).toContain('void beginEnrollment()')
    expect(component).toContain("setError('We couldn’t start two-factor authentication. Please try again.')")
    expect(component).toContain('Starting authenticator setup…')
    expect(component).toContain('setEnrollment(await startTotpEnrollment')
  })
})
