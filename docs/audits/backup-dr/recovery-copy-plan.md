# Protected recovery copy — certified; token revocation pending

Live publication certification passed in run 35683014590. All 13 scoped live permission
probes passed in run 35683422210; the valid ledger was preserved. These probes do not
prove every effective IAM permission or separately establish governance-bypass denial.

## Certified protected destination

GitHub repository `aiconcierege/writeoffs_fresh`, environment `staging-dr-recovery`.
Require review by Rick (`aiconcierege`, user ID 231313481), permit only the branch
`v2-onboarding-staging`, and retain existing source protections. Exact environment
configuration: `recovery-environment.proposed.json`; branch rule:
`{"name":"v2-onboarding-staging","type":"branch"}`.

Copy ONLY the existing ledger key and the two recovery-reader credentials. No writer,
application database, backup-decryption or provider-administration credentials belong
in this destination. This is independent of the application database, backup bundles,
and normal runtime, but not independent of the GitHub account/provider. It is not an
offline/password-manager escrow and must not be described as one.

## Copy and verification

The executed workflow is operation `copy-recovery` in
`.github/workflows/staging-backup-certification.yml`. Copy uses
stdin to GitHub CLI, which encrypts secrets before upload. Values are never placed in
command arguments, logs, files, artifacts or job outputs. Existing destination secret
names cause a stop instead of overwrite. Partial-copy recovery requires inspection;
never rerun by deleting or replacing the encryption key automatically.

The independent verification job receives secrets exclusively from the destination
environment and must authenticate/decrypt the existing live ledger using the reader.
The artifact contains only the outcome. No key fingerprints or ledger content are output.

## Authorization/credential prerequisite

Rick approved the destination and controlled transfer. On September 22, the destination
was created and read back through GitHub's API: exactly one permitted branch,
`v2-onboarding-staging`, required reviewer `aiconcierege`, and zero secrets. The
bootstrap credential name is now present in `staging-backup`; its value was not read.
No secret transfer has run yet. The active workflow entry point is operation
`copy-recovery` in `staging-backup-certification.yml` with two separately protected jobs.
The Actions GITHUB_TOKEN has no environment-secret
write capability. Do not copy the operator's broad local GitHub token into the runner.

Use a one-time fine-grained GitHub token scoped to this repository with Environments
read/write permission (and mandatory metadata read), shortest available expiry. This
permission covers repository environments, not just one destination: it is a sensitive,
temporary bootstrap credential. Rick must create it and store it directly as protected
`staging-backup` secret `WRITEOFFS_RECOVERY_BOOTSTRAP_TOKEN`, never in chat or source.
Remove that secret and revoke the token once the copy and destination verification pass.
No AWS permission changes, key regeneration, or broader runtime permissions are needed.

The hosted target has not been recreated; avoid spend while this prerequisite is pending.

## Live certification — September 22, 2026

Run [35757112853](https://github.com/aiconcierege/writeoffs_fresh/actions/runs/35757112853)
on commit `944e1d2ff86b181a5f26bd0663483b34dbabf76f` passed both copy and verification.
At 2026-09-22T16:59:02.983Z the destination-only recovery job decrypted/authenticated
the existing live ledger using the copied existing key and reader credentials. It
attempted zero writes and did not regenerate the key. Sanitized evidence:
`recovery-copy-certified-2026-09-22.json`.

Post-run API inspection verified exactly the three approved recovery secrets, Rick as
required reviewer, and only the staging branch permitted. No writer credential exists
in the destination. `WRITEOFFS_RECOVERY_BOOTSTRAP_TOKEN` was then deleted from
`staging-backup`; a fresh secret-name listing returned zero matches.

This removes the runner's stored bootstrap credential, but does NOT establish personal
access-token revocation. Rick must delete `writeoffs-recovery-bootstrap` in GitHub
Settings → Developer settings → Personal access tokens → Fine-grained tokens. No token
value is needed. Hosted provisioning is paused until that action is confirmed, as
requested. The recovery key and both persistent reader credentials remain untouched.

Rick confirmed manual deletion/revocation of the bootstrap token on September 22.
The runner secret removal is API-verified; personal token deletion is owner-attested.
Hosted DR preparation may proceed under the existing $25 authorization.
