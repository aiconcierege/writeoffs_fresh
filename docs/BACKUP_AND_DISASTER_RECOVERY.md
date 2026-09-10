# Backup and Disaster Recovery

Status: launch control and operator runbook. Last verified: 2026-09-09.

This runbook does not authorize a Production restore, plan change, or destructive
operation. Production recovery requires the incident lead and database/security
operator to approve the exact target and recovery point.

## Recovery objectives and coverage

- Launch target: database RPO at most 24 hours and service RTO within one business day.
- Supabase managed daily backups protect Postgres, including Auth records, schema,
  functions, policies, and Storage metadata. They do **not** contain Storage objects.
- WriteOffs therefore requires an encrypted off-provider bundle containing a standard
  PostgreSQL custom-format dump plus a private-object mirror and cryptographic manifest.
- Git plus an immutable Vercel deployment recover application source/builds; neither
  replaces database or private-object recovery.

These are targets until the Production plan, backup schedule, destination, key custody,
and a Production-shaped isolated drill are verified. The 2026-09-09 local drill proves
the mechanism, not provider-region recovery time.

## Launch configuration

Use Supabase Pro as the minimum Production tier. It provides daily backups with seven
days of retention, organization MFA enforcement, seven-day log retention, and launch-
appropriate Micro compute allowances. Enable the spend cap initially and monitor
database, connection, bandwidth, and Storage use. Team is not required for initial
capacity; choose it only if 28-day logs, platform audit logs, project-scoped roles, or
its support/compliance features are an approved requirement.

Enable the paid PITR add-on at launch. Canonical financial history and receipt linkage
make a day of possible data loss materially undesirable; Supabase documents recovery
points down to seconds and a worst-case PITR RPO of about two minutes. This is a recurring
cost decision and Rick must enable it in the dashboard.

Recommended cadence:

- Supabase managed database backup: daily, verified every day.
- PITR: continuously retained for at least seven days.
- Independent encrypted database plus Storage bundle: nightly; additionally before
  migrations or risky releases.
- Storage object copy: incremental at least every six hours once an approved independent
  destination exists; nightly bundle remains the recovery checkpoint.
- Integrity verification: every backup; isolated restore: quarterly and before launch.

## Independent encrypted bundle

`scripts/backup/create-encrypted-backup.mjs` packages a PostgreSQL custom-format dump
that preserves grants (required for restored RLS access),
a protected mirror of the private Storage bucket, and a SHA-256 manifest. It encrypts
the archive with AES-256-GCM using a random 96-bit nonce and authenticates the file
header. `scripts/backup/restore-encrypted-backup.mjs` authenticates the archive and
verifies every dump/object hash before restoring.

The 32-byte base64 key is supplied only as `WRITEOFFS_BACKUP_KEY_BASE64`; it must live
in an approved secrets manager, never source control, logs, the backup destination, or
the same recovery account. Rick must designate two key custodians, an offline recovery
copy, rotation procedure, and a separate backup destination. Losing the key loses the
backup. The scripts create mode-0600 artifacts and mode-0700 temporary workspaces and
remove working plaintext on exit, but operators must also use encrypted, access-limited
runner disks.

The tooling deliberately separates collection from storage-provider choice. Before
Production, select a versioned/object-locked destination in a different administrative
and failure domain from the primary Supabase project. Upload only the `.wobak` output;
do not retain the database dump or Storage mirror after successful encrypted upload and
verification.

Example contract (values intentionally omitted):

```sh
WRITEOFFS_BACKUP_DATABASE_URL=... \
WRITEOFFS_BACKUP_STORAGE_ROOT=/protected/receipts-export \
WRITEOFFS_BACKUP_OUTPUT=/protected/writeoffs-YYYYMMDD.wobak \
WRITEOFFS_BACKUP_KEY_BASE64=... \
node scripts/backup/create-encrypted-backup.mjs
```

Use `supabase storage cp --recursive` or the S3-compatible API to populate the protected
private-object mirror. The operator must verify the exact expected project host before
collection. Production automation must add an explicit host allowlist and upload the
encrypted result to the approved destination; that external choice is not yet made.

Restore only into a newly created, isolated target:

```sh
WRITEOFFS_RESTORE_INPUT=... \
WRITEOFFS_RESTORE_DATABASE_URL=... \
WRITEOFFS_RESTORE_STORAGE_ROOT=/protected/restored-objects \
WRITEOFFS_RESTORE_CONFIRM_ISOLATED=yes \
WRITEOFFS_BACKUP_KEY_BASE64=... \
node scripts/backup/restore-encrypted-backup.mjs
```

After database restore, upload objects to a **private** target bucket at their original
paths. Reconfigure Auth URLs, SMTP, API keys, Storage settings, webhooks, extensions,
cron, and environment secrets; these provider settings are not all restored by a
database clone. Keep autonomous workers and external webhooks disabled until verification.

## Verification checklist

1. Compare migration inventory/checksums and required extensions/functions.
2. Confirm all Business-owned tables have RLS and expected policies.
3. Test Tenant A access and a denied Tenant B read using authenticated roles.
4. Verify receipt metadata path, object hash, private bucket, signed access, and linked record.
5. Verify current canonical decisions, allocations, customer correction/history chain,
   mileage, invoice/manual-money records, reports, and no duplicate current projection.
6. Recreate secrets/provider settings from the controlled configuration inventory.
7. Run queue health checks before enabling workers; then process one synthetic job.
8. Import the separately encrypted deletion ledger, run `npm run deletion-ledger:reconcile`,
   drain every scheduled reconciliation deletion, and verify restored private objects for
   those identities are absent. This applies equally to PITR.
9. Record recovery point, database/object restore time, deletion reconciliation result,
   validation time, gaps, and approver.

## Incident paths

| Incident | Contain | Recover and verify |
| --- | --- | --- |
| Bad deployment | Stop promotion; retain database | Reassign the known-good Vercel deployment; smoke-test environment identity and queues |
| Corrupt/deleted database data | Disable writes/workers and preserve evidence | Choose PITR point or isolated backup; restore; run full verification before cutover |
| Lost receipt object | Preserve metadata and stop destructive cleanup | Restore exact object/path from independent bundle; verify hash and tenant-only access |
| Supabase project/region outage | Disable provider-dependent writes | Restore DB plus objects into approved replacement project; rotate keys and reconfigure providers |
| Credential compromise | Revoke sessions/tokens and isolate integrations | Rotate affected keys; restore only if integrity changed; audit access and customer impact |
| Plaid outage | Keep canonical state; pause sync retries if necessary | Resume idempotent sync; no database restore unless local integrity was affected |
| Local/source loss | Revoke any local credentials | Clone the protected Git remote; restore provider configuration from controlled inventory |
| Restore predates customer deletion | Keep restored service isolated | Import the off-provider encrypted deletion ledger, schedule and complete reconciliation deletions, verify objects absent, then activate service |

## Current gaps

- Production plan, PITR, SSL enforcement, region, backup status, and provider access are
  not verified because Production was not accessed.
- The independent destination, retention/object lock, automated Storage exporter,
  secrets-manager ownership, monitoring, and scheduled execution require Rick decisions.
- The deletion ledger must be exported after every completed deletion and at least daily
  to a separately controlled encrypted destination. A backup is not eligible for service
  activation until ledger reconciliation completes.
- A provider-hosted isolated restore remains required after those choices. The local
  drill used synthetic financial records and a private object without Production data.

## Source recovery checkpoint — 2026-09-09

The validated staging application and its launch-readiness tooling are preserved in
`github.com/aiconcierege/writeoffs_fresh` on branch `v2-onboarding-staging`. The coherent
application checkpoint is commit `7cfd8f7b0c30940f5019e88637df824a70907653`
(`checkpoint: preserve validated staging architecture`). A later documentation-only
commit may be the branch/tag head; the application checkpoint remains the immutable
source reference.

Clean recovery procedure:

1. Clone the repository and check out the recorded recovery branch or tag.
2. Install the locked dependency graph with `npm ci`.
3. Recreate environment values from the approved secrets manager using `.env.example`;
   never recover values from Git or copy an environment file between staging and
   Production.
4. Recreate a database from the ordered files in `supabase/migrations/`, then restore
   the independently encrypted database and private-object bundle using the isolated
   restore procedure above.
5. Verify RLS, tenant isolation, object linkage, bookkeeping totals, corrections, and
   queue health before enabling writes, workers, or webhooks.
6. Reconstruct staging in its dedicated Vercel project and verify its Supabase, Plaid,
   Stripe, Auth, and application-environment identities before assigning the staging
   alias. Production deployment requires separate explicit approval and the same
   environment-identity checks.

When using Vercel's local prebuilt path, run `vercel build --prod`, then
`npm run vercel:sanitize-output` before `vercel deploy --prebuilt --prod`. The
sanitizer removes local `.env*` mappings that the prebuild trace may add to server
functions; deployment credentials must come from Vercel and never from the artifact.

Git intentionally does not contain operational secrets. Full recovery therefore also
requires controlled copies of Vercel environment values; Supabase project/API/database
credentials; Plaid credentials; Stripe credentials and webhook secrets; the independent
backup encryption key and destination credentials; DNS/domain controls; and SMTP/email
provider settings. These belong in an approved organization secrets manager with an
offline recovery process and named custodians, not on a developer laptop or in source.

Historical note: Teller was previously used and a Teller private key was committed in
old Git history. Teller has been removed from the application, the provider/service is
defunct, and no provider endpoint or account remains against which the credential could
authenticate or be revoked. Current source contains neither Teller credential material
nor a Teller runtime integration. The historical blob remains security debt; coordinated
history sanitation may be considered later as defense in depth, but it is not required
for operational recovery of the current source.

## Restore drill record — 2026-09-09

An isolated PostgreSQL 17 source and target were created inside the local Supabase Docker
runtime. The synthetic source contained two tenants, six RLS-enabled Business-owned tables,
six policies, `auth.uid()`, one $217.89 record/receipt linkage, a current Personal decision,
its customer correction event, and a 12.375-mile entry. A private receipt image was mirrored
at its tenant path. No staging or Production data was used.

The encrypted bundle creation and authenticated extraction each measured under one second
at shell-second resolution; PostgreSQL restore and validation completed in the same bounded
local exercise. The first validation correctly failed because the manual restore omitted
grants. The tooling was corrected to preserve privileges and the target was recreated. The
successful rerun proved Tenant A saw exactly one record/receipt/current decision/correction
and 12.375 miles, while Tenant B saw zero Tenant A receipts/records. All six policies, all
six RLS flags, `auth.uid()`, the $217.89 total, object hash, and receipt path matched.

This supports a mechanism RTO of seconds for the tiny fixture and proves no intrinsic
24-hour data-loss window in the archive itself. It does **not** prove operational RTO or RPO:
without scheduled off-provider execution, the defensible current independent-backup RPO is
undefined, and provider recovery RTO remains unmeasured. The launch targets remain RPO ≤24
hours for nightly independent backup (about two minutes for DB after PITR is enabled) and
RTO ≤1 business day, pending a Production-shaped provider-hosted drill.
