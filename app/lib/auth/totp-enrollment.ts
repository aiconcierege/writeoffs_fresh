type MfaError = { message?: string } | null

type Factor = {
  id: string
  factor_type: string
  status: string
}

type MfaEnrollmentClient = {
  listFactors: () => Promise<{ data: { all?: Factor[] } | null; error: MfaError }>
  unenroll: (input: { factorId: string }) => Promise<{ error: MfaError }>
  enroll: (input: { factorType: 'totp'; friendlyName: string }) => Promise<{
    data: { id: string; totp?: { qr_code: string; secret: string } } | null
    error: MfaError
  }>
}

export type TotpEnrollment = { factorId: string; qrCode: string; secret: string }

// Supabase's uncompressed SVG QR is commonly larger than 100 KB. One MB remains
// a narrow bound for this authenticated, ephemeral setup artifact.
const MAX_QR_DATA_URI_LENGTH = 1_000_000

export function isSafeTotpQrCode(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 'data:image/svg+xml;utf-8,'.length
    && value.length <= MAX_QR_DATA_URI_LENGTH
    && /^data:image\/svg\+xml;(?:charset=)?utf-8,/i.test(value)
}

export async function startTotpEnrollment(mfa: MfaEnrollmentClient): Promise<TotpEnrollment> {
  const existing = await mfa.listFactors()
  if (existing.error) throw new Error('factor_lookup_failed')

  for (const factor of existing.data?.all?.filter(
    (item) => item.factor_type === 'totp' && item.status === 'unverified',
  ) ?? []) {
    const removed = await mfa.unenroll({ factorId: factor.id })
    if (removed.error) throw new Error('factor_cleanup_failed')
  }

  const enrolled = await mfa.enroll({
    factorType: 'totp',
    friendlyName: 'WriteOffs authenticator',
  })
  if (enrolled.error || !enrolled.data?.totp) throw new Error('enrollment_failed')
  if (!isSafeTotpQrCode(enrolled.data.totp.qr_code)) throw new Error('invalid_qr_code')
  if (typeof enrolled.data.totp.secret !== 'string' || !enrolled.data.totp.secret.trim()) {
    throw new Error('invalid_setup_secret')
  }

  return {
    factorId: enrolled.data.id,
    qrCode: enrolled.data.totp.qr_code,
    secret: enrolled.data.totp.secret,
  }
}
