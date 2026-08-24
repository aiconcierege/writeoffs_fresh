import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { isSafeTotpQrCode, startTotpEnrollment } from '../../app/lib/auth/totp-enrollment'

function mfa(overrides: Record<string, unknown> = {}) {
  return {
    listFactors: vi.fn().mockResolvedValue({ data: { all: [] }, error: null }),
    unenroll: vi.fn().mockResolvedValue({ error: null }),
    enroll: vi.fn().mockResolvedValue({
      data: { id: 'factor-1', totp: { qr_code: 'data:image/svg+xml;utf-8,%3Csvg%3Etest%3C/svg%3E', secret: 'SETUPSECRET' } },
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
      qrCode: 'data:image/svg+xml;utf-8,%3Csvg%3Etest%3C/svg%3E',
      secret: 'SETUPSECRET',
    })
    expect(client.enroll).toHaveBeenCalledWith({ factorType: 'totp', friendlyName: 'WriteOffs authenticator' })
  })

  it('accepts the Supabase SVG data URI and renders it without next/image', () => {
    const supabaseQr = 'data:image/svg+xml;utf-8,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"%3E%3Cpath d="M0 0h8v8H0z"/%3E%3C/svg%3E'
    expect(isSafeTotpQrCode(supabaseQr)).toBe(true)
    const component = readFileSync('app/settings/security/SecuritySettings.tsx', 'utf8')
    expect(component).toContain('<img src={enrollment.qrCode}')
    expect(component).not.toContain("from 'next/image'")
    expect(component).not.toContain('dangerouslySetInnerHTML')
  })

  it('rejects missing, malformed, non-SVG, and oversized QR responses', async () => {
    for (const qr_code of ['', '/account/security', 'data:image/png;base64,abc', `data:image/svg+xml;utf-8,${'x'.repeat(1_000_001)}`]) {
      expect(isSafeTotpQrCode(qr_code)).toBe(false)
      await expect(startTotpEnrollment(mfa({
        enroll: vi.fn().mockResolvedValue({ data: { id: 'factor-1', totp: { qr_code, secret: 'SETUPSECRET' } }, error: null }),
      }))).rejects.toThrow('invalid_qr_code')
    }
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
