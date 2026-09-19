# Versioned canonical Betti action index

Rick approved this architecture for the guided-performance phase. This document
records implementation and recovery contracts; public performance certification
is reported separately. No bookkeeping/tax eligibility policy is replaced.

## Authority and command path

`projectBettiWork` remains the eligibility/priority authority. An explicit worker
loads canonical evidence, questions, authorized scope and processing state, then
publishes its derived actions with a revision compare-and-swap. Base priority and
conversation-continuity variants come from the same engine in two total passes,
not one reconstruction per action. SQL selects those already-assessed values.

Home/full work and guided work read `read_betti_action_index`. Ordinary canonical
review answers use `execute_betti_indexed_question`: owner, MFA, membership,
configuration and indexed version checks, the existing allowlisted answer RPC,
append-only history, transactional invalidation, exact retry receipt, result
hydration and next indexed action selection. The POST does not await workers.

The two indexed API routes authenticate at the handler and SQL boundaries. Proxy
avoids duplicating remote Auth/membership calls for precisely those routes when
the staging index is enabled. No forwarded identity header is trusted. Other
routes retain their existing proxy enforcement. Cookie refresh remains in the
route's server Supabase client.

Contractor/deduction commands retain their existing guarded write paths. They
are not represented as having been converted to the ordinary review-command
SQL envelope. Guided responses still consume the common indexed selector.

## Invalidation and honest partial freshness

Every existing business-owned base table has an AFTER fact trigger. Unknown or
shared sources invalidate the business; explicitly proven record/account/group
sources invalidate their affected records. Refund relationships include both
ends and prior linked purchases. Changing record ownership/dependency falls
back to business-wide invalidation. Shared business/vehicle/recurring facts
remain conservative. Future tables must satisfy the schema coverage test.

A ready entry must match publication/configuration, remain within its eligibility
deadline and have no newer affected dependency. Group membership may shift when
one record changes, so all sweeps refresh on local changes. Independent individual
questions remain available. Dirty record/action counts are not invented; pending
index reconstruction is backed by durable state and reported explicitly.

`index.summaryCurrent`, `summaryAsOf`, revision and publishedRevision identify
summary freshness. Old organized/coverage metrics cannot justify completion or
current-through claims while dirty. Home uses current ready-action counts and
ignores stale activity totals for conversation context. Financial totals continue
to use the unchanged canonical reporting path.

Action eligibility deadlines cover calendar/age/deferral boundaries. Processing
summary deadlines additionally cover job availability and lease expiry. An
unrelated worker lease expiring does not expire a ready question. Both deadlines
schedule durable refresh; neither GET nor render mutates state.

## Recovery and safety

- A short state-row lock serializes publication, invalidation and indexed commits.
- Snapshot revision plus publication CAS rejects a stale worker result.
- Leases prevent duplicate refresh work; cron recovers lost `after()` notifications.
- The drain refreshes indexes before and after heavy document/bookkeeping work.
- Exact retries retain the original result and deferral deadline; changed retries
  fail. A PostgreSQL-confirmed deadlock rollback gets one identical retry; stale
  versions and uncertain network failures do not.
- Deferred expense enrichment requires confirmation of an already-durable normal
  deterministic job for the exact committed decision. Its recovery does not
  depend only on `after()` executing.
- Builder SQL is service-only, uses transaction-local owner/MFA context for the
  existing canonical readers/reconciler, and restores claims on success/error.
  It never creates a customer session or credentials.
- Index tables have RLS and no customer table privileges. Customer reads/commands
  are through owner/MFA-checked functions. Derived tables cascade with business
  deletion; they do not establish a separate retention policy.
- Bootstrap reads may use the existing read-only canonical loader until a worker
  publishes. Reads never populate, reconcile, answer or repair the index.

## Rollback and deployment boundary

The feature is enabled only for `WRITEOFFS_ENVIRONMENT=staging`, unless explicitly
disabled with `BETTI_ACTION_INDEX_ENABLED=false`. Real Production remains on its
existing path. Disabling the staging feature restores the canonical loader and
existing command path without removing customer facts or deleting history.
Additive index tables can remain during rollback; destructive down-migration is
not required. Applied migration files are immutable, hence follow-up migrations
record safeguards discovered during candidate certification.

## Validation evidence

- Full suite: 1,663 passing, 143 environment-dependent skips.
- Existing lint warnings: 16; zero errors and no new warnings.
- Eight synthetic tenants: indexed full/narrow next action and counts matched an
  independently recomputed canonical projection at settled revisions.
- Rollback SQL: MFA/tenant rejection, read-only behavior, persistence/history,
  independent continuation, exact/changed retries, stale publisher rejection,
  schema trigger coverage, summary expiry and configuration rejection.
- Real candidate APIs: anonymous 401, AAL1 403, spoofed identity headers rejected,
  actual AAL2 reads available.
- Existing staging security/cross-surface harness passed: tenant isolation, stale
  and retry rejection, read-only rendering, Home/Check-in agreement, out-of-scope
  exclusion and Reports arithmetic.
- Public ordinary sample (30 interactions): actual click-to-next median 525 ms,
  p95 711 ms, maximum 731 ms. See the certification report for all action classes.
- Public sequential projection reads: p50 288 ms, p95 390 ms.
- Index selector SQL sample: 27.8 ms versus 606.1 ms canonical reconstruction;
  these are component samples, not percentiles or an infrastructure capacity claim.

The public run completed 41 continuous actions without navigation or unnecessary
stops. Its final shared-percentage update exposed delayed index recovery: staging's
public alias had advanced while its cron still used the prior deployment. A proper
staging release aligned both, and migration 009 prioritizes existing index recovery
over dormant bootstrap. Normal cron recovered the synthetic state; the subsequent
receipt Later action settled without navigation. See
[VERSIONED_ACTION_INDEX_CERTIFICATION.md](VERSIONED_ACTION_INDEX_CERTIFICATION.md)
for timings, outliers, remaining slower paths and the complete validation record.
