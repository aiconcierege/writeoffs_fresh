# Phase 2: minimum activation and Home

## Activation

Required facts remain business identity/description, Schedule C eligibility, business
start month, customer-job-material/merchandise facts, covered bookkeeping start date,
ingestion preference, MFA and active membership. Existing eligibility and commercial
coverage validation remains authoritative. Onboarding has six fact groups and review.

Historical mileage no longer participates in progression or page loading. No vehicle,
receipt, account-use, transaction answer, or connection is required to reach Home.
The existing historical-mileage collector remains available under Mileage; no vehicle
method or tax logic changed.

`POST /api/onboarding/complete` calls additive `complete_minimum_onboarding`.
The database enforces authenticated business ownership, MFA, membership, and a valid
timezone before invoking the existing completion function. It saves a previously
missing timezone atomically, preserves existing timezone and activation timestamp on
retry, and returns `/home` for either preference. No customer backfill is performed.

## Home

Server rendering calls `loadBettiWork`, exactly the loader behind the canonical GET
`/api/bookkeeping/work`. There is no loopback HTTP request and no second queue.
`homeCommand` translates the projection into copy and a single optional CTA. It does
not derive bookkeeping treatment, coverage, readiness, or question eligibility.

- Provide records: preference-sensitive primary action, visible alternative.
- Canonical customer action: preserve target; Check-in receives `returnTo=/home`.
- Recoverable ingestion: canonical document destination, not a bookkeeping question.
- Actual processing: organizing language; no fake customer CTA.
- Pending/retry: received/waiting language; no active-processing claim.
- System hold: truthful unfinished work, no invented customer task.
- Deferred: saved for later, no false completion claim.
- Supported coverage: use the projection's narrower available-record date, or full
  current-through only if it is actually supplied.
- Projection unavailable: explicit refresh message, never manufacture zero work.

Home calls the same canonical report service as Reports. Amounts are not recomputed.
The displayed period is covered year-to-date through today. Working expenses remain
separate from supported tax deductions and documentation limitations.

Canonical Betti anchors the responsive hero (20rem desktop, 10rem mobile image box).
Utilities have equal visual weight. Documents keep detailed filenames and statuses.
First-use education appears with the no-records state and requires no durable flag.
No Home GET/render path writes decisions or orchestrator state.

## Validation and boundaries

`tests/home/command-center.test.ts` exercises projection-driven presentation.
`tests/fixtures/home-command.ts` creates isolated in-memory canonical projections.
`tests/onboarding/sql/minimum-onboarding.sql` runs inside a rollback transaction with
synthetic identities, testing preferences, timezone/idempotency, MFA and ownership.

`scripts/certify-home-phase2-visuals.tsx` renders real components against synthetic
projection states, using optimized CSS. These screenshots are visual fixtures, not
claims about real customer amounts. `scripts/certify-home-phase2-staging.mjs` tests
real onboarding for isolated users and reads an existing synthetic bookkeeping tenant.
It never targets Rick, connects Plaid, or answers bookkeeping questions.

No sweeps, full Check-in redesign, vehicle redesign, logos, video, reporting-rule,
ingestion, evidence, question-loop, or Phase 1 projection changes are included.
