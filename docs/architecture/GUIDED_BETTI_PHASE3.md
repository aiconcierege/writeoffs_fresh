# Guided Work with Betti — Phase 3

## Authority

`GET /api/bookkeeping/work` remains the read-only orchestration authority. Home and
Check-in consume its same action population. Neither surface derives bookkeeping
or tax treatment. Authorized scope is applied before guided grouping: uploading an
old document cannot create Catch-up or enlarge coverage.

## Guided actions

The projection groups eligible ordinary purchases by account, workstream, stage,
deferral and processing dependencies, at most eight visible purchases per group.
An account prerequisite remains one shared action across workstreams. Existing
priority reasoning favors prerequisites and leverage; no fixed historical/current
quota is introduced.

For business-only accounts, personal exceptions precede mixed exceptions. An
unchanged group records review, not fabricated business facts. Mixed accounts
require factual choices for unresolved purchases; partly personal choices collect
exact business dollars. Customer-authored decisions and valid existing splits are
not flattened or repeatedly reviewed.

Receipt upload uses the unified intake and normal workers. Receipt availability
confirmation covers only the exact displayed/versioned group. Matching and
canonical reassessment can remove members before confirmation; stale groups are
rejected. Optional shadow analysis is not a required processing dependency.
Missing receipts remain separate from working expense inclusion.

Individual and special-transaction controls reuse canonical existing question and
correction commands. Known unresolved refunds and loan payments project their
existing supporting-evidence workflow even when no ordinary question row remains.
They are not inferred from merchant text by this adapter. Existing seven-day
special-event deferrals remain deferred, scoped to the current decision; completed
non-P&L payments do not acquire new work. Deferral does not erase a prior refund
relationship-type answer. An unsure payment answer leads to supporting evidence
instead of re-showing the same classification choice. Evidence-specific prompts are not replaced by generic
purchase questions. Equivalent answered-question protections remain in force.

## Durable snapshots and security

`betti_guided_assertions` stores immutable tenant-owned completed/deferred snapshots.
`answer_betti_guided_work` checks ownership/MFA, authorized activity, account-use
version, decision/evidence version, processing dependencies and exact record IDs.
It calls existing personal/mixed correction and receipt-unavailable commands.
A request ID retries idempotently only with identical payload. Stale or changed
payloads fail closed. Existing decisions, source identities and history remain.

The read context enriches records with review versions and account labels, plus
these prior assertions. It does not create questions or bookkeeping facts.

## Conversation and sessions

The shared conversation shell gives canonical Betti a meaningful presence, with
merchant identity, one dominant question and responsive answer controls. Local,
reviewed merchant marks are used for a small strict allowlist. Unknown identities
use a neutral storefront; no speculative image requests or category inference.

A visit continues while legitimate actions remain; there is no count-based pause.
Deferrals are counted separately. Receipt Later preserves the scoped opportunity
and does not assert unavailability. Session storage remembers presentation progress for two hours; it is
not bookkeeping authority. Each explicit answer reconciles then reloads the work
projection. Pending real work shows a waiting transition; failures and out-of-scope
evidence retain distinct projections. Unrelated eligible work may proceed.

## Validation entry points

- `tests/bookkeeping/betti-work.test.ts`: grouping, scope, dependency, deferral,
  customer authority, splits and versions.
- `tests/bookkeeping/guided-work-route.test.ts`: UI/API snapshot boundaries.
- `scripts/certify-guided-work-staging.mjs`: isolated marked synthetic customers,
  normal onboarding/upload/answer flows and four-width screenshots.
- `scripts/certify-guided-security-staging.mjs`: actual tenant/RLS, retry/staleness
  and read-only rendering assertions.

Individual-question dates use the business timezone. Workstream-boundary fixtures
use the existing canonical UTC activation date; report comparisons use the same
period as Home. These conventions are not changed by Phase 3.
Private credentials and screenshots stay outside the repository. Certification
artifacts may be isolated with `CERTIFICATION_ARTIFACT_DIR` under
`/private/tmp/writeoffs-phase3-*`.

No vehicle-method redesign, Reports calculation changes, broad ledger redesign,
authoritative AI, or onboarding expansion is included.

### Economic evidence and continuous guided work correction

The evaluator consumes observed financial-origin evidence from the shared snapshot.
Accepted statement imports and Plaid records can establish economic nature only
when direction, account type, complete bank narrative/provider classification,
and existing authority agree. Bare `PAYMENT`, `TRANSFER`, ACH deposits, payouts,
Zelle names and invoice references remain insufficient. Customer-payment income
also requires the customer's Business-only account fact. Transfer recognition
establishes non-P&L treatment, not account ownership or completed reconciliation.
Refund recognition does not establish the original purchase; loan recognition
never establishes principal/interest amounts. Existing special workflows collect
those remaining facts. Customer decisions, allocations, conflicting evidence and
usable purchase receipts prevent this narrow financial-narrative inference.

The trusted drain schedules bounded, versioned `source_economic_evidence_v1`
reassessment jobs for active-scope unresolved financial records. Reads do not
schedule work. Existing answers are not replaced, and no customer fixture is
manually classified by the upgrade.

Controlled certification exposed a pre-existing review-history constraint that
rejected an evidence-only refresh with the same question context. The migration
retains the context lookup index but removes its historical uniqueness: the RPC's
advisory lock, same-current-version check, unique predecessor chain and event
sequence validation govern idempotency. Answered, deferred and resolved issues
remain closed. A rollback validation exercises same-context evidence refresh,
identical retries, deferral and resolution before staging application.

Receipt Later uses the existing scoped guided-review deferral. It creates no
receipt-unavailable evidence and changes no expense decisions. The explicit
availability confirmation remains a separate, versioned assertion. Session
progress is informational; no action-count threshold interrupts continued work.

The real global scheduler check also caught repeated commercial-scope evaluation
for every historical record. A follow-up migration materializes eligible records
and evaluates the canonical scope authority once per business. The staging batch
then scheduled 12 records in 987 ms instead of timing out.

Background guided-work reads are single-flight and abort when an answer or its
reconciliation takes ownership. A successful later read clears only a background
refresh error, never an unconfirmed save error. This prevents a slow obsolete poll
from replacing current work or leaving a recovered read failure permanently on
screen. Mutation versions and canonical stale-write checks remain authoritative.
The real browser runner can inject a transient read failure and verify recovery
without changing customer assertions (`--refresh-recovery`).
