# Plaid User Offboarding — final staging certification

## Decision

**YES. Rick may now click “Mark complete” for User offboarding in Plaid Launch Center.**

The application-level offboarding, live independent ledger, hosted restore gate, protected
recovery copy, and real staging application-worker publication are certified at the levels
shown below. Real Production was not changed or used. No actual customer cutover is claimed.

## Latest real application-worker evidence

Dedicated staging deployment: `dpl_9s8CE5XZqU63v3Ji6VzXevik61an`, from `f8115f4`,
https://writeoffs-fresh-staging.vercel.app . [Deployment metadata](staging-runtime-deployment-2026-09-22.json).

[Protected run 35770340171](https://github.com/aiconcierege/writeoffs_fresh/actions/runs/35770340171)
verified 15 authoritative completed staging tombstones through encrypted conditional S3
publication and durable readback. No identities/timestamps were fabricated. Final coverage is 17 tombstones: those 15 plus
the two new application-published synthetic deletions, with no unaccounted entries
([coverage check](staging-tombstone-coverage-final-2026-09-22.json)). It transferred
only the existing writer ID, writer secret and ledger key to sensitive server variables on
the primary slot of the dedicated staging project. SOURCE=staging is nonsecret configuration.
No recovery-reader credential exists in runtime. The expired CLI OAuth session was refreshed
normally; no permission was broadened. The temporary transfer token secret was removed and
its absence verified. The one-time workflow operation is retired in the final commit.
The short-lived access token copy was removed; no refresh token or new long-lived credential
was created. Existing ledger key and recovery copy were not rotated or regenerated.

[Real worker result](staging-runtime-worker-certified-2026-09-22.json) and
[all-table residual check](staging-runtime-residual-check-2026-09-22.json):

| Step | Real staging observation |
| --- | --- |
| Verified request | Customer A used public deletion API with MFA; seven-day grace returned |
| Authorization | AAL1 denied; B cannot cancel A; A cannot schedule B; unauthenticated worker denied |
| Grace completion | Only A's synthetic dates advanced; normal scheduled worker claimed request |
| Publication failure | Synthetic invalid effective timestamp caused INVALID_DELETION_ENTRY; all A data/files remained |
| Durable publication then interrupted cleanup | Valid timestamp published; deliberately invalid synthetic Plaid envelope blocked downstream cleanup |
| Idempotent retry | Identical facts passed publication again and reached the same controlled downstream failure |
| Conflicting content | One-second synthetic timestamp change returned INDEPENDENT_DELETION_CONFLICT; A data/files remained |
| Successful completion | Original timestamp restored, synthetic blocker released; scheduled application worker completed on attempt 5 |
| Full cleanup | Zero A rows across 99 business-owned tables; Auth=0, MFA=0, private objects=0 |
| Plaid/jobs | Item/token/cursor and processing jobs/leases absent; deleted-business sync guard false |
| Retained evidence | Minimized tombstone and deletion attempt history remain |
| Isolation | B's scoped counts and private files preserved before separate fixture cleanup |

No manual global drain, new debug route, worker bypass or ledger-key retrieval was used.
The test modifies only explicitly marked synthetic fixtures. Source records and decisions
use existing canonical RPCs; a rejected direct fixture insert was corrected without
bypassing integrity checks. The initial invalid timestamp tests publisher validation failure,
not an induced live AWS outage. AWS failures and unavailable configuration also retain their
existing deterministic fail-closed tests. The controlled downstream failure uses synthetic
Plaid state, not a real provider Item. Prior real Sandbox /item/remove evidence is preserved.

The deployed publisher requires an S3 version ID, authenticated decryption and matching
content before returning. Observed downstream failure, identical retry, immutable conflict,
and final completion establish that the application uses that path before irreversible
cleanup. No raw ledger contents or version payloads are returned to customers or the artifact.

## Existing hosted DR evidence retained

[Run 35767459267](https://github.com/aiconcierege/writeoffs_fresh/actions/runs/35767459267),
commit `839e1f2`, [original artifact](hosted-dr-certified-2026-09-22.json): old backup restored
both tenants and resurrected deleted A under isolation. Live independent-ledger reconciliation
re-deleted A across application/bookkeeping, Auth/MFA, Plaid, objects and jobs. B survived.
Wrong-key decryption failed closed; successful verification yielded eligible-not-activated.
Customer access and normal workers were never enabled. No repeat hosted drill was needed.

[Cleanup](hosted-dr-cleanup-2026-09-22.json): temporary hosted-target secret removed; disposable
project deleted and absence verified, other projects preserved. Conservative combined compute
estimate **$0.04032**, using verified Micro $0.01344/hour and rounded-up project lifetimes.
Not an invoice or measured incidental storage/network usage. Valid S3 tombstones preserved.

## Final requirement matrix

| Requirement | Result | Evidence level |
| --- | --- | --- |
| /item/remove | PASS | REAL PLAID SANDBOX; prior disconnect/replay and ITEM_NOT_FOUND |
| Plaid token/credential erasure | PASS | REAL PLAID SANDBOX + real staging worker / hosted synthetic state |
| Sync shutdown | PASS | Prior lease/webhook race tests + real deleted-business sync denial |
| Historical books after disconnect | PASS | REAL PLAID SANDBOX; retained source revisions after replay |
| Cancellation / paid-through service | PASS at accepted level | INTERNAL DETERMINISTIC and implementation review; no new Stripe cancellation |
| Twelve-month read-only retention | PASS at accepted level | INTERNAL DETERMINISTIC; not twelve months elapsed |
| Seven-day deletion grace | PASS | REAL PUBLIC STAGING; actual server deadline, synthetic time advancement for execution |
| Cancel deletion during grace | PASS | Prior REAL PUBLIC STAGING request/cancel |
| Permanent deletion | PASS | REAL STAGING APPLICATION WORKER + prior application/hosted certification |
| Automatic independent publication before cleanup | PASS | REAL STAGING APPLICATION WORKER, live S3 |
| Historical completed-tombstone coverage | PASS | LIVE AWS/S3; 15 authoritative existing entries verified, new deletions use deployed publisher |
| Failure/retry/conflict | PASS | REAL STAGING APPLICATION WORKER + live S3 / deterministic failure tests |
| Writer permission boundaries | PASS for tested boundaries | LIVE AWS/S3 conditional Put/Get and safe denied-operation probes |
| Recovery-reader boundaries | PASS for tested boundaries | LIVE AWS/S3 list/read and safe denied write/delete probes; no exhaustive IAM inventory claim |
| Protected recovery key | PASS | LIVE AWS/S3 recovery authentication run 35757112853; branch/reviewer restrictions verified |
| Current backup expiration | CONFIGURATION VERIFIED | LIVE AWS/S3 read-only run 35662828362; daily35/weekly84/monthly90 |
| Noncurrent versions / markers / multipart | CONFIGURATION VERIFIED | LIVE AWS/S3; one day subject to holds, marker cleanup, abort7d |
| Restore reconciliation | PASS | HOSTED DR TEST; latest independent ledger and second read |
| Private-object reconciliation | PASS | HOSTED DR TEST + REAL STAGING APPLICATION WORKER |
| Plaid-state reconciliation | PASS | HOSTED DR TEST + REAL STAGING APPLICATION WORKER synthetic state |
| Worker/job/lease safety | PASS | Hosted isolation, real worker cleanup and prior stale-lease rejection |
| Fail-closed activation gate | PASS | HOSTED DR TEST; wrong key blocked, successful checks before eligibility |
| Hosted resurrection drill | PASS | HOSTED DR TEST original artifact preserved |
| Tenant isolation | PASS | Real public cross-tenant denial, hosted B preservation, real worker B preservation |
| MFA / secret security | PASS | Real AAL1 denial/MFA cleanup, server-only sensitive configuration, scans |
| Temporary infrastructure cleanup | PASS | Hosted project/temporary secrets removed; no extra permissions or keys created |

Previous application evidence: [September 21 certification](../plaid-offboarding/README.md).
No accepted tests were repeated merely to refresh timestamps. Configuration verification is
not a claim of months of elapsed S3 expiration. No real Production rollout/cutover is claimed.
The recovery copy shares GitHub as a provider but is independent of app/database/backups;
no offline escrow is claimed. Manual backup scheduling remains a separate operational
pre-launch matter, not reopened by this application-runtime certification.

## Validation

1,895 tests passed; 143 existing environment-dependent skips. TypeScript and optimized
webpack build passed. Lint: zero errors, 16 existing warnings. Secret scans and diff checks
passed. Browser static output contains zero ledger configuration references. Two existing
moderate development-only dependency advisories (Vitest and @vitest/mocker), no high/critical
findings; no dependencies changed. Main, real Production, Rick's data and AWS permissions
were untouched. Unapproved Betti assets remain untracked and were excluded from deployment.
