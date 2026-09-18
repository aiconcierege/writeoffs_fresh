# Guided-work performance, pass 2

Status: implementation under staging certification. No launch-readiness claim.

## Architecture

`read_betti_work_inputs(business, as_of)` is a tenant/MFA-checked, SECURITY INVOKER,
read-only STABLE input transport. It calls the existing canonical context and
question eligibility functions and supplies bounded read-model rows in one database
statement snapshot. Existing TypeScript question/evidence/scope/guided-stage and
priority selectors remain authoritative. No rules are duplicated in a SQL selector.

A strict read-only repository adapter lets those same readers consume the snapshot.
Unsupported reads, missing columns/tables, foreign rows and capacity overflow fail
closed. It has no mutations, network fallback or cross-request cache. Snapshot
inputs stay server-side; they are not returned as a customer projection.

The ordinary command's validated input snapshot is reused for review hydration and
eligibility confirmation. Canonical write RPCs still validate current
issue/decision/evidence versions under their original locks. A successful answer
still produces a fresh post-command snapshot, not a stale cached next question.

`guidedWorkProjection` returns the exact canonical next action, action counts,
processing/readiness and presentation context, without the full action universe,
job list or source-coverage diagnostics. Initial full work and the narrow response
share a structural presentation contract. Home remains a full canonical consumer.
The narrow DTO reduces transfer/serialization; pure projection CPU was already
only ~1–4 ms, so the principal gain is transport consolidation and read reuse.

PostgreSQL documents that STABLE functions read the calling statement's MVCC
snapshot. This replaces the former multiple-network-call before/after consistency
bracket with a database snapshot, not with weaker consistency.
[PostgreSQL function volatility](https://www.postgresql.org/docs/current/xfunc-volatility.html).
Experimental SQL wall-clock timing was removed from the final STABLE result; only
canonical input data is returned. Timing remains in request diagnostics and separate
SQL profiling.

## Initial differential staging evidence

Eight retained marked synthetic tenants/states: full new projection exactly equals
the reference; narrow next action/count exactly equals full. One includes 13 ready
actions; another retains out-of-scope historical evidence with zero active work.
Direct cross-business and AAL1 reads are rejected.

Initial application-side loader sample: 15–28 network reads -> 1 RPC; 0.7–1.4s ->
0.24–0.52s. These are not public browser latency claims. The RPC still executes
multiple canonical SQL reads; one round trip does not mean one database operation.

## Previous processing wait

Read-only job timestamps for the prior synthetic 50-second transition:

| Job | Queue delay | Execution | Attempts |
|---|---:|---:|---:|
| Initial reassessment | 40.562s | 8.212s | 1 |
| Dependent reassessment | 3.767s | 2.622s | 1 |

The current one-minute drain also processes lifecycle/documents before bookkeeping
and respects one live processing job per business. No retry caused this sample.
Ordinary percentage/evidence answers can create this work, so this is not solely
an ingestion edge case. No worker-dispatch policy was changed in this pass so far.
A targeted post-command worker wake-up needs separate bounded lease/retry/cost
validation; unrelated ready customer actions continue under canonical dependencies.

## Migration and rollback

- `20260929000100_atomic_betti_work_inputs.sql`: additive staging input snapshot.
- `20260929000200_stable_work_input_contract.sql`: removes experimental timing
  fields, retaining identical canonical rows and security.
- No indexes, customer facts, history, classification, tax rules or backfill changed.
- Rollback: restore prior application (`2baaa00`) first, then remove the additive
  function. Existing functions and data were not replaced.

Public staging measurements, concurrency, final regression matrix and release
identity will be appended after certification. Do not treat this document's initial
measurements as a completed performance phase.
