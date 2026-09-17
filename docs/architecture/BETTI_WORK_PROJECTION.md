# Betti work projection — Phase 1

Status: implementation contract. This is an orchestration read model, not a second bookkeeping engine.

## Entry point and ownership

`GET /api/bookkeeping/work` calls `loadBettiWork`, then the pure `projectBettiWork`.
Home and Check-in are **not yet switched** to this endpoint. No existing UI, question
selection/mutation path, onboarding step, financial calculation, or worker is changed.

The authenticated membership supplies the business ID. A caller cannot select a
different business in the URL. The API requires a verified user and AAL2. The SQL
function independently checks owner and AAL2. View-only memberships can read;
`actionsEnabled` is false. All later mutations must retain their existing checks.

`read_betti_work_context` is a STABLE, SELECT-only function with an empty search path.
Its narrow security-definer boundary reads otherwise-private operational jobs, but
returns no storage paths, raw provider data, credentials, lease tokens, or error text.
Every branch restricts business ownership. The projector also rejects mixed-tenant inputs.

Canonical question generation is reused through `getCurrentAskableQuestionQueue`.
No reconcile/ensure/answer/enqueue method runs on this read. Context reads bracket
the question read; a changed snapshot causes one bounded retry, then a 503.
No partial or failed read becomes a misleading zero count.

## Scope

The saved `catch_up_start_date` supplies bookkeeping start. Existing
`onboarding_completed_at` supplies live activation, only for completed onboarding.
Activation uses its **UTC calendar date**, consistently and independent of later
timezone changes. Missing completion evidence yields unknown scope; no read backfills it.
This milestone does not introduce a new activation flag or rewrite existing dates.

* Catch-up: start through activation minus one day.
* Current: activation onward.
* Before start: outside scope, retained in the ledger.
* Missing date/scope: unscoped, never guessed from upload time.

Commercial coverage comes separately from `customer_coverage_start`; this projection
does not grant paid coverage. The existing rolling historical-question suppression
policy remains separate and unchanged. Current activity never becomes Catch-up as it ages.

Validated statement periods are source-coverage evidence, not proof that the customer
has supplied every account. Gaps are calculated per known account through the read date.
Plaid's last transaction date is deliberately not treated as complete history coverage.

## Typed result

The exported `BettiWorkProjection` contains:

| Field | Meaning |
|---|---|
| `scope`, `scopeVersion` | Dates, authority, commercial coverage, known statement periods and gaps |
| `betti.jobs` | Actual queued/running/retry/failed/stale/paused work and owned targets |
| `betti.waiting` | Legitimate actions temporarily waiting on record-specific operational work |
| `betti.systemHeld` | Unorganized records without a current question or job; no invented task |
| `betti.missingJobs` | Documents without an actual job, explicitly **not** “processing” |
| `customer.actionable` | Unique actions available now |
| `customer.deferred` | Current deferred issue leaves; timed and indefinite remain distinct |
| `progress` | Canonical activity, organized activity, processing/blocked activity, separate documentation limitations |
| `readiness` | Done-for-now, available catch-up activity, reviewed/current-through limitations |
| `nextAction` | Deterministically ranked action with target, dependencies, version and reasons |

Actions reserve types for providing records, account use, personal and mixed sweeps,
receipt upload/availability, special workflows, individual facts, review summaries,
and ingestion recovery. Phase 1 only emits actions supported by existing canonical
facts and existing destinations. It does not invent sweep completion or review commands.
Statement account actions use current conversational Check-in; connected-account
actions currently use the existing Banking settings destination. Future guided UI
can consume the same account target without changing the underlying fact.

Account use is keyed by account/fact, not by transaction. An action affecting both
streams has `workstream: shared` and `affects: [catch_up,current]`. It counts **once**
in the overall customer count. Per-stream counts overlap intentionally; never add
those counts together to compute total customer work.

## Organized is not tax-ready

The projection inspects existing current decisions and exact signed allocations.
Resolved allocations must reconcile to the source amount. Business expenses/refunds
require established categories on all business allocations; income and established
non-P&L treatment use their canonical economic treatment. Category candidates alone
are insufficient. Multiple allocations are preserved.

Missing receipts do not erase organized working treatment. Documentation limitations
use existing purchase-receipt eligibility and remain separate. No P&L amounts are
calculated here; Home/Reports retain their canonical working-books service.

## Priority and waiting

Ranking is deterministic and has no Current/Catch-up quota:

* Account prerequisites receive dependency priority.
* More records unlocked increases utility, with a cap on leverage weight.
* Current work receives a freshness preference.
* Existing conversation context receives continuity preference.
* Canonical materiality affecting totals receives a modest preference.
* Outstanding age increases without a cap, preventing starvation.
* Stable action ID breaks ties.

Each action exposes score components/reasons, leverage, age, continuity and materiality.
No deadline is invented: `deadline` is null until a canonical deadline source exists.
These weights are versioned presentation policy, not bookkeeping policy.

A pending/leased/retrying job only blocks actions for records it actually targets.
Account prerequisites remain useful while dependent processing exists. Unknown document
activity dates stay unscoped and do not block unrelated Current questions. Expired leases
are reported as stale, not repaired by viewing Home. Paused processing is explicit.

## Versions and history

Action identity remains stable across repeated reads. Its version hashes projection
version, scope, canonical question/event/context, decision IDs, linked extraction
versions, and dependent job versions/state. Source question ID/version/context are
included for existing command boundaries. Hashes are **not authorization tokens**.
Future UI commands must reload/validate the action and pass existing expected-source
versions; no new write endpoint is added here.

Deferred work uses current event leaves, including deduction and contractor deferrals.
Answered/superseded history is not reopened. The accepted question-loop fix is untouched.

## Readiness and future review snapshots

`doneForNow` means there is no actionable customer work now. Processing, deferrals,
documentation limitations, and holds can still exist.

`available_activity_organized` does not mean historical review is complete.
`catchUpReviewedThrough` remains null: the current weekly-review snapshots do not
establish the newly defined initial-catch-up scope. A later explicit confirmation
must reference an immutable presented snapshot containing interval, account/source
coverage and record/evidence versions. Expanding scope should add only newly affected
intervals/items; it must not erase decisions or fabricate completion of new activity.

`knownAccountsOrganizedThrough` can be supported by continuous validated statement
coverage and organized records with no outstanding actions/jobs. It is narrowly scoped
to **known accounts**. `booksCurrentThrough` remains null until source-universe coverage
and an appropriate completeness assertion exist. A most-recent transaction is not proof.

Completed-action totals are null because no trustworthy session/review denominator exists.
No percentages are manufactured.

## Bounds and remaining integration work

The SQL snapshot caps records/jobs/documents/periods/deferrals at 5,000, accounts at 500,
and links/revision IDs at 10,000, fetching one extra to detect overflow. The existing
canonical question readers have a PostgREST 1,000-row ceiling; this adapter fails closed
before calling them when records, links, or question revision rows reach that ceiling.
It never reports a truncated queue as exact. A paginated canonical question adapter
is required before increasing this Phase 1 bound. Failed reads return 503, not fake zero work.

There is no durable new customer/workstream state, migration backfill, reassessment,
or customer-data repair. The migration adds one read function only; rollback is
`drop function public.read_betti_work_context(uuid)` before removing the API deployment.

Future phases attach Home/Check-in, implement reviewed scope snapshots and sweeps,
and supply stronger coverage assertions. They must consume this projection rather
than recreate independent task counts.
