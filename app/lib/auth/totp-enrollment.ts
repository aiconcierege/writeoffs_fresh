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

  return {
    factorId: enrolled.data.id,
    qrCode: enrolled.data.totp.qr_code,
    secret: enrolled.data.totp.secret,
  }
}
