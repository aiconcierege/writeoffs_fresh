# Plaid offboarding — hosted DR result and rollout assessment

## Decision

**Hosted DR certification: PASS. Plaid User Offboarding overall: NOT COMPLETE.**

The remaining limitation is application rollout, not another failed restore test. The new
independent-ledger publication call is validated in repository code but not deployed to
the normal application deletion worker. Its runtime configuration and reconciliation of
older completed deletion tombstones are not certified. Do not click Mark complete yet.

## Actual hosted evidence inspected

[Run 35767459267](https://github.com/aiconcierege/writeoffs_fresh/actions/runs/35767459267),
commit `839e1f291f8862ccc61d9ee7da171f997d66b60d`, completed September 22, 2026.
The actual drill step ran 18:31:27–18:32:52 UTC.
[Original sanitized artifact](hosted-dr-certified-2026-09-22.json) is preserved unchanged.
The artifact fields were checked against the committed assertions in
`scripts/backup/drill-hosted-fresh-restore.mjs`.

| Required hosted assertion | Actual result |
| --- | --- |
| Initial hosted isolation | true |
| Independent S3 publication/version/readback before irreversible source deletion | true |
| Canonical source permanent deletion | true |
| Old backup restores both A and B | true; exact fixture snapshots compared |
| Deleted A demonstrably resurrected | true |
| Restored target blocked before reconciliation | true |
| Wrong ledger key fails closed | true |
| Application/bookkeeping/question-history removal | true |
| Auth and MFA removal | true |
| Plaid Item/token/cursor and connection state removal | true; synthetic Plaid state |
| Private object removal | true; real hosted Storage API |
| Job/lease removal | true |
| B preserved | true; database snapshots and private-file contents compared |
| Minimized tombstone retained | true |
| Final eligibility | true, eligible-not-activated |
| Customer access / normal workers / Production cutover | false / false / false |

The source was an isolated synthetic PostgreSQL database using current staging schema.
The destination was an isolated hosted Supabase project. Live AWS/S3 and existing ledger
key were used by the protected runner. This is not a real Plaid API removal test; the prior
Sandbox offboarding certification supplies that evidence. Source deletion used canonical
verified-request/claim/delete/complete SQL with an explicit synthetic clock advance and
Auth SQL deletion. It did not invoke a newly deployed TypeScript deletion worker.

## Cleanup and cost

[Cleanup evidence](hosted-dr-cleanup-2026-09-22.json):
- `WRITEOFFS_TEMP_DR_TARGET_JSON` removed from `staging-backup`; fresh name-only listing verified absence.
- `hkvmfbqshqthsfxmwlsq` / `writeoffs-dr-certification-20260922` deleted; a fresh provider listing verified absence and preservation of other projects.
- Existing ledger, AWS policies, protected recovery copy and encryption key untouched.
- 1.589 hours at verified Micro $0.01344/hour: conservative rounded-up compute estimate **$0.02688**.
- Earlier short-lived disposable target estimate **$0.01344**; combined **$0.04032**.
  This is not an invoice and does not claim measured incidental storage/network usage.
- No actual cutover, real customer data, main change or real Production change.

## Final requirement matrix

Prior application evidence is preserved in [the September 21 certification](../plaid-offboarding/README.md).
No accepted test was repeated merely to obtain a newer timestamp.

| Requirement | Result | Evidence level and reference |
| --- | --- | --- |
| /item/remove | PASS | REAL PLAID SANDBOX; prior disconnect/replay and provider ITEM_NOT_FOUND |
| Plaid credential/token removal | PASS | REAL PLAID SANDBOX + INTERNAL DETERMINISTIC state/race tests |
| Sync shutdown | PASS | INTERNAL DETERMINISTIC; terminal Item, queued work and held lease rejected |
| Historical books after ordinary disconnect | PASS | REAL PLAID SANDBOX; preserved source revisions after settled replay |
| Membership cancellation / paid-through | PASS at accepted deterministic level | INTERNAL DETERMINISTIC + source review; no new live Stripe cancellation |
| 12-month read-only retention | PASS at accepted deterministic level | INTERNAL DETERMINISTIC; no 12-month elapsed observation |
| Seven-day deletion grace | PASS | REAL PUBLIC STAGING request + server-time tests |
| Cancellation of deletion during grace | PASS | REAL PUBLIC STAGING synthetic request/cancel |
| Permanent application deletion | PASS for certified fixtures | Prior application test + HOSTED DR TEST canonical SQL path; new publisher rollout separately pending |
| Independent encrypted ledger | PASS in protected infrastructure | LIVE AWS/S3 runs 35683014590, 35683422210 and hosted run |
| Automatic ledger publication by normal application worker | PARTIAL | INTERNAL DETERMINISTIC call ordering/retry/config tests; undeployed server hook |
| Previously completed tombstones represented independently | UNVERIFIED | Requires scoped reconciliation/backfill before rollout; new synthetic writes do not prove old coverage |
| Writer boundaries | PASS for tested boundaries | LIVE AWS/S3 conditional Put/Get/retry/conflict; safe deny probes; valid tombstone preserved |
| Recovery-reader boundaries | PASS for tested boundaries | LIVE AWS/S3 list/read and safe write/delete-denial probes; not a claim of exhaustive IAM inventory |
| Protected recovery key | PASS | LIVE AWS/S3 recovery authentication run 35757112853; GitHub branch/reviewer protections verified |
| Current backup expiration | CONFIGURATION VERIFIED | LIVE AWS/S3 read-only run 35662828362; 35/84/90 days; no elapsed-expiration claim |
| Noncurrent expiration / markers / multipart | CONFIGURATION VERIFIED | LIVE AWS/S3; 1 day subject to Object Lock, marker cleanup, abort7d |
| Automatic restore reconciliation | PASS | HOSTED DR TEST; independent current ledger, re-deletion, second ledger read |
| Private-object reconciliation | PASS | HOSTED DR TEST; A files deleted, B files intact |
| Plaid-state reconciliation | PASS | HOSTED DR TEST; synthetic Item/token/cursor deleted |
| Worker/job/lease safety | PASS for tested restored state | HOSTED DR TEST; A jobs absent and normal workers never enabled; prior race tests retained |
| Fail-closed activation gate | PASS for verify-only recovery | HOSTED DR TEST; wrong key denied, checks before eligibility; actual cutover not performed |
| Hosted resurrection drill | PASS | HOSTED DR TEST, original artifact above |
| Tenant isolation | PASS | HOSTED DR TEST B preserved + prior cross-tenant API/SQL denial |
| MFA/security | PASS at tested boundaries | Prior real AAL1/foreign request denial; hosted Auth/MFA cleanup; secret checks |
| Runtime rollout / operational activation | NOT CERTIFIED | Protected runner is not application runtime; operational source fence/cutover adapter not exercised |

No elapsed retention or actual Production restore is claimed. Manual-only backup cadence
remains unchanged; nightly scheduling is a separate pre-launch operational requirement.
The recovery copy is independent of the database/backups/runtime but shares the GitHub
provider account; no offline escrow is claimed.

## Exact remaining authorization/configuration step

A read-only Vercel environment-metadata request returned **403**; values were not decrypted
or displayed. This does not prove variables absent. Evidence:
[runtime inspection](runtime-configuration-2026-09-22.json).

Before deploying the new hook, authorize a protected, server-only transfer/verification of:
- the EXISTING writer Access Key ID and Secret Access Key;
- the EXISTING `WRITEOFFS_DELETION_LEDGER_KEY_BASE64`;
- `WRITEOFFS_DELETION_LEDGER_SOURCE=staging`.

Destination must be ONLY the primary slot of dedicated project `writeoffs-fresh-staging`
(`prj_o56739F1pzd0TjFirEYoLMaa6oIJ`). Do not transfer the recovery-reader into runtime,
rotate the key, expose values locally, or broaden IAM. Current authorization keeps the
key in its approved protected environments; a new destination requires Rick's approval.
Use a protected transfer mechanism with destination-scoped access, not pasted secrets.
Then verify/backfill minimized historical tombstones, deploy, and certify one isolated
application-worker publication/retry. No new hosted restore run is necessary for this.

The earlier gate/ledger requirements cannot be declared globally enforced until this
rollout is complete. Keeping deployment blocked here avoids disrupting accepted deletion
behavior with an unconfigured fail-closed publisher.

## Final validation

Final checks: 1,884 tests passed; 143 existing environment-dependent tests skipped.
TypeScript and optimized webpack build passed. Lint has zero errors and 16 pre-existing
warnings. Gitleaks scans of lifecycle code, backup scripts and audit files found no secrets;
git diff --check passed. Dependency audit reports two existing moderate development-only
findings (vitest and @vitest/mocker); zero high/critical findings. No packages changed.

No dependency,
Plaid architecture, financial calculation, permission, or secret-value changes are part of
this finalization. Application hook code may be committed for review while deployment
remains explicitly blocked on configuration.
