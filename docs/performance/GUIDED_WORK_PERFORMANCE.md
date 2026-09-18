# Guided-work performance — staging investigation

Status: implementation and measurement in progress; not release certification.
The first measured, equivalence-tested migration was applied to dedicated staging on September 18; no customer facts were changed.

## Measurement boundary

The prior 7.3–19.0 s / median 10.4 s metric included a projection verification read
*after* the next action was rendered. This phase records actual screen advancement
separately (`renderedMs`), verification-inclusive latency (`nextVisibleMs`), command
response and click-to-first-animation-frame acknowledgment. The acknowledgment frame
is not a persistence confirmation. No performance result implies a saved answer
until the canonical command succeeds.

Request-local Server-Timing and staging-only numeric waterfalls record database/auth
round trips, repeated resources and total request duration. No query strings,
credentials, customer answers or response data enter these diagnostics. Home and
Check-in render traces use the same request-local instrumentation. RPC duration
includes DB execution and Vercel-to-Supabase transport; SQL experiments separately
measure database execution. These are different measures.

## Measured causes

- Baseline work-context RPC cumulative staging mean approximately 750 ms, maximum
  7,376 ms; not a clean single-tenant percentile. Each projection reads it twice.
- Synthetic steady database timings: base context 58–63 ms; guided enrichment
  316–356 ms; complete context 424–429 ms. Guided fingerprinting repeatedly rebuilt
  the same canonical transaction view. Special deferrals rebuilt it again.
- Each canonical review question hydrated its record, source, decision, allocations,
  financial source and Plaid state independently. Observed requests reached 113
  database/auth calls and ~9.9 s when the consistency bracket retried.
- Deduction, contractor and review loaders serialized independent work and repeated
  authentication/business resolution. Resolution evidence was loaded twice.
- Guided answers then issued a reconciliation POST and a separate projection GET,
  each repeating authentication and membership work.
- Seven-second fixed polling added latency during brief processing and spent reads
  while customers considered a ready question.

## First optimization set

- Preserve context fingerprints exactly but reuse already-read rows. Preserve null
  versions for out-of-scope rows. Seven synthetic tenant snapshots match exactly.
  Transaction-local before/after experiment: context ~424–429 ms -> ~142–159 ms.
- Bounded tenant-scoped review hydration: six queries per <=100-record batch instead
  of approximately six per record. Preserve all allocations, financial authority,
  provider-current checks, missing-source failures and bounded capacity safeguards.
- Restrict answer-time hydration to the relevant issue; canonical eligibility and
  stale/evidence checks remain in place.
- Parallel independent question reads; reuse convergence read within that load.
- Reuse authentication/client/membership data only inside one request. No question,
  decision or work-projection cache; no cross-request customer cache.
- Optional guided command response includes reconciled canonical work. Non-guided
  callers remain compatible. A continuation failure never converts a committed
  answer into a reported failed write; existing read-only recovery remains.
- Pure deferrals need no question generation. Read their durable event in the fresh
  projection. Completed factual answers retain reconciliation.
- One reconciliation RPC runs the same three canonical commands in the same order.
- Bounded processing polling starts at 500 ms, backs off and stops during ready work.
  No arbitrary action quota. Focus still refreshes; stale writes remain rejected.
- Immediate accessible “Saving your answer…” acknowledgment does not claim success.

## Safety / database experiments

Experiments run inside BEGIN/ROLLBACK on dedicated staging, using only marked
synthetic customer contexts. No customer facts are modified by equivalence tests.
One initial candidate changed out-of-scope null review versions into hashes. The
seven-tenant differential test caught it before persistent application; fixed with
an explicit null guard. All seven contexts then matched, including version hashes.
No speculative indexes were added. No tax, categorization, loan, refund, scope,
receipt matching or evidence rules are changed.

## Artifact locations (private; do not publish fixture credentials)

- `/private/tmp/guided-performance-baseline-reads.json`
- `/private/tmp/guided-performance-before-runtime.jsonl`
- `/private/tmp/guided-perf-context-timing.json`
- `/private/tmp/guided-perf-equivalence.json`
- `/private/tmp/writeoffs-phase3-performance-baseline/continuity-result.json`

Final before/after percentiles, concurrency assumptions, functional matrix and
release details must be appended after the optimized staging run.
