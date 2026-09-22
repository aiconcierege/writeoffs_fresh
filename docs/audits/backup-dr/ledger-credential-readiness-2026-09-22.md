# Ledger credential readiness

Metadata-only verification: all five dedicated ledger secret names exist in the
GitHub `staging-backup` environment. The environment permits only the
`v2-onboarding-staging` branch and requires review by `aiconcierege`.
Secret values were not retrieved. Presence alone does not certify credential validity.

Prepared workflow operation: `certify-ledger` in
`.github/workflows/staging-backup-certification.yml`.

The operation receives only the five ledger secrets. It does not receive database,
Supabase, Vercel, backup-encryption or general backup-runner credentials. It creates
one encrypted, minimized, randomly identified synthetic deletion obligation under
`deletion-ledger/staging/entries/`, intentionally retained with the ledger. It checks
versioned readback, same-version retry, conflicting-content rejection, independent
recovery-reader access and rejection with an incorrect encryption key. It never
deletes objects or changes S3 configuration. The artifact contains checks only,
not secret values or ledger entries. Raw provider errors are suppressed.

This is not a hosted restore certification, an IAM deny-policy certification, a
recovery-key escrow, or installation of application runtime credentials.

Rick approved the limited staging bootstrap commit/push and dispatch, including one
synthetic encrypted entry and the stated verification operations. This exception does
not authorize S3 configuration changes, deletions, Production or real customer data.
GitHub separately requires Rick's environment approval before the dispatched job can
access its secrets. Do not bypass that review.

No live job, AWS mutation, new hosted target, commit, push or deployment occurred
during this preparation. Final Plaid User Offboarding remains incomplete.
