# Guided next-action architecture: approved action index

Status: approved architecture implemented in `fffe012`; public dedicated staging
certification is recorded in `VERSIONED_ACTION_INDEX_CERTIFICATION.md`. Additive
index migrations are applied only to dedicated staging. The measurements below
record the investigation preceding implementation, not the final runtime.

## Recommendation

Maintain a **versioned, derived customer-action index** using the existing canonical
eligibility engine. Home and Check-in must read the same index. This is a projection
of decisions/evidence, not another ledger, an independent classifier, or an
optimistic client queue.

The alternative is to relocate the complete eligibility and priority engine into
PostgreSQL, with both consumers using that implementation. A SQL selector layered
on the existing TypeScript engine would duplicate rules; that is unacceptable.

Repository instructions require a decision when materially different architectures
have significant tradeoffs. The action index introduces durable derived state,
transactional invalidation and recovery obligations; the SQL alternative relocates
the orchestration engine. Rick approved the index. Its implementation retains the existing TypeScript
eligibility engine and publishes versioned derived actions with transactional invalidation.

## Measurements obtained safely

Public dedicated staging, one existing isolated synthetic customer, sequential
requests, no concurrent load ramp:

| Probe | Samples | p50 | p95 | Max |
|---|---:|---:|---:|---:|
| Authenticated invalid ordinary command | 20 warm | 428.9 ms | 689.5 ms | 718.9 ms |
| Proxy portion of those requests | 20 warm | 193.7 ms | 433.8 ms | 478.1 ms |

The probe signs in with real MFA, calls the deployed ordinary-command endpoint with
an invalid identifier/body, and asserts HTTP 400. The handler exits after user
validation and parsing, before action eligibility or persistence. Proxy membership
enforcement remains enabled. This measures the existing authenticated stack's
overhead, **not an immutable physical network floor**. It does not prove the target
is impossible. It uses Playwright's authenticated API request context; it does not
measure next-question rendering or a successful mutation.

Artifact: `/private/tmp/writeoffs-phase3-perf3-floor/floor.json`.
Reproducible probe: `scripts/measure-guided-auth-floor-staging.mjs`.

### Scope reuse

The same recovered database was queried with bounded, read-only EXPLAIN ANALYZE:

| Query | Planning | Execution |
|---|---:|---:|
| Existing complete transaction-work query | 65.917 ms | 160.869 ms |
| Retained work joined to materialized authorized scope | 87.348 ms | 102.529 ms |

This is one sample per query, not a percentile benchmark. Scope authority is still
the existing guarded function; the activity-date predicate is unchanged.

A connection-local temporary copy of the context helper was compared against the
existing helper for eight synthetic businesses. All eight JSON outputs were equal.
Existing helper timings ranged 108–239 ms; scope-reuse copies ranged 48–99 ms.
Original was evaluated first, so cache/order effects may contribute to the measured
difference. No shared function was replaced. Each comparison had a four-second
statement timeout, 250 ms lock timeout, and rollback. These are promising bounded
SQL savings, not a claim that scope reuse alone solves ordinary interaction latency.

Artifacts: `/private/tmp/perf3-original-explain.json`,
`/private/tmp/perf3-scope-explain.json`, `/private/tmp/perf3-scope-0.json` through
`/private/tmp/perf3-scope-7.json`.

### Where reconstruction remains

- `questions/[id]` calls `loadCurrentCustomerWork` to validate one submitted action.
- That invokes the full snapshot and complete canonical action construction.
- The command wrapper reconciles questions and builds another complete snapshot.
- `guidedWorkProjection` removes response fields only after full reconstruction.
- `projectBettiWork` owns prerequisite suppression, grouped sweeps, document/job
  dependencies, special-workflow ownership, deferrals and deterministic ranking.
- SQL question eligibility alone is insufficient: a question row can be current
  while an account prerequisite, guided sweep or processing dependency owns the work.

A representative SQL component probe on a settled 28-record synthetic customer
measured context 336 ms on its first call, current reviews 2 ms, askability 27 ms,
then complete inputs 258 ms. These are serial samples with differing cache warmth,
not additive waterfall components. Context was approximately 47 KB of the 51 KB
input snapshot. The existing context is not a financial report; it is primarily
the source universe needed to reconstruct orchestration.

The complete ledger EXPLAIN also executes askable/evidence-question functions once
per record (28 loops). Some of those columns can be pruned in narrower callers;
their full SELECT cost must not be attributed indiscriminately to every command.

## Approved index contract

1. Canonical facts/decisions remain authoritative. One shared eligibility engine
   builds action records; neither client nor SQL transport invents eligibility.
2. Actions carry tenant, source identity/version, scope version, dependency versions,
   availability, workstream, priority inputs and minimum render context.
3. Canonical writes invalidate affected actions in the **same transaction** as the
   fact/event. A committed fact must never leave a stale action apparently current.
4. Scope/account changes invalidate the appropriate business/account partitions.
   Record/evidence changes invalidate their record and any affected batch/relationship
   partitions. Unmatched-document dependencies require explicit broader invalidation.
5. Independent ready actions remain usable. Dirty dependencies have a real durable
   refresh job; they are not mislabeled complete or silently dropped.
6. A publisher compares dependency revisions before atomically publishing derived
   actions. A stale computation cannot overwrite newer evidence or an answered action.
7. Priority handles time/deferral expiry and request continuity from canonical inputs;
   a stored rank cannot freeze aging or force a fixed historical/current quota.
8. The next-action read validates ownership, MFA, scope, availability and revisions,
   then selects from current eligible actions. Full Home uses the same action truth.
9. Ordinary POST validates the current action, persists, invalidates and returns the
   next independent action. No worker is awaited inside the POST.
10. When a same-record follow-up needs local reassessment, do only that local work or
    return a real processing dependency. Unrelated work remains available.

Before enabling this path, the implementation must prove not just narrow/full
agreement, but agreement with independently recomputed canonical eligibility at the
same settled revision. During dirty revisions, waiting must be backed by real jobs;
readiness may never masquerade as a complete projection. Required tests include
missed/duplicate delivery, crashed publication, delayed workers, concurrent answers,
scope changes, receipt matching and cross-record batch invalidation.

Reads must not populate/repair the index. Bootstrap and rebuilding belong to explicit
workers/migrations. A missing or stale index must return truthful recovery/processing
state or a deliberately bounded canonical fallback, never fabricated completion.

This design needs measured proof. No sub-second latency or capacity result is claimed.

## Worker findings

The current cron runs once per minute. The drain awaits membership/lifecycle work,
then document processing, then bookkeeping. Bookkeeping claims one job at a time
with a 60-second lease and processes up to 12 sequentially per invocation. Claiming
only immediately executable work protects leases; replacing this with preclaiming
a large batch would be unsafe.

The earlier approximately 50-second sample contained 40.56 seconds of initial queue
wait and 8.21 seconds of execution. A dependent job waited 3.77 seconds and executed
for 2.62 seconds. A later sample waited 15.25 seconds, executed for 5.31 seconds, then
had a dependent job wait 2.67 seconds and execute for 2.85 seconds. All sampled jobs
were first attempts. These observations support scheduling/serial-drain delay as a
contributor; they do not establish production frequency or redundant job fan-out.

Recommended follow-up with the index implementation: wake bounded orchestration
refresh work promptly after commit while retaining the durable cron as recovery,
and isolate that light work from OCR/document batches. Preserve leases, idempotency
and dependency versions; do not introduce a worker wait in ordinary HTTP requests.

## Staging incident

Cause remains unknown. The previous management-log query returned no matching
events. Current counters are not historical evidence of the outage's cause.

At this investigation's check, services were healthy; database activity showed 14
connections against a configured maximum of 60, no lock waiters and no queries
running longer than 30 seconds. Current metrics showed approximately 978 MB total
memory, 524 MB available and zero OOM kills since the counter's reset. These values
do **not** prove those conditions held during the outage.

The earlier experimental transaction replaced a shared function before rollback.
This investigation avoids that pattern entirely: temporary connection-local copies,
timeouts and sequential reads only. We cannot attribute the outage to that experiment
without incident-time evidence. No restart, resize or aggressive load test occurred.

## Delivery status

- Investigation and bounded scope-output equivalence: complete.
- Architecture decision: versioned canonical action index approved.
- New next-action selector: implemented; end-to-end certification pending.
- New command timing/regression/concurrency certification: not run.
- Additive staging migrations: index and durable background-dependency guard.
- Application deployment and commit: pending validation.
- No Rick bookkeeping changes, reset, upload or Plaid connection.
- No broad UX changes; main and real Production untouched.
