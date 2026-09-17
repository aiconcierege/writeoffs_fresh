# Check-in loop and evidence audit — September 17, 2026

Point-in-time diagnosis, not authorization for the proposed product changes below.
Scope: dedicated staging; existing clean-room customer preserved. Base revision:
`60884015308e52c8e34bb652c2e2624f20de51b8`.

## 1. Confirmed incident and root cause

The September 8 receipt-only restaurant purchase is $9.54. It is independent of
the 24 May statement transactions. Its extraction is usable: merchant McDonald's,
date September 8, total 954 cents. Stored OCR contains both restaurant wording and
food-item text. It has no bank match. No receipt was downloaded or changed during
this investigation; diagnostics checked content indicators without exposing card data.

The record history proves persistence works. Customer decisions were appended at
20:49:21 UTC (purchase), 20:49:30 (business), 20:50:00 (purchase description),
20:51:10 (`food`), and 20:51:24 (`food`). Each purchase-purpose issue received an
answered event and a resolved event. Reassessment immediately opened a new
`ordinary_expense_purpose` issue at 20:50:02, 20:51:11, and 20:51:25.

`processOperatingExpenseTreatment` constructed issue identity from record ID **and
current decision ID**. Answering appends a decision. If the deterministic classifier
still returns `needs_facts`, this constructs a new issue instead of recognizing that
the requested fact has already been supplied. `finishAnsweredExpense` invokes this
synchronously after the answer; a worker race is not needed to reproduce the bug.

The UI removes the answered issue version, then accepts the newly generated issue
as fresh work. Same-record follow-up ordering brings it back immediately. The
answer counter counts successful commands, not completed transactions. This is
not a lost answer, duplicate upload, or merely a stale client cache.

## 2. Narrow repair

One shared database predicate checks whether the **current** decision still carries
a customer-supplied answer to `ordinary_expense_purpose`, on the same business and
record. It requires an actual answered event and matching saved answer, not a
nonempty generic purpose, business-use answer, deferral, or answer count.

- The category processor consults this predicate before opening another generic
  purpose issue. Classifier uncertainty remains `needs_facts`; no category or
  deduction is invented.
- Canonical evidence-question eligibility consults the same predicate. Already
  generated duplicates stop being actionable, including through the Check-in
  application answer boundary and projections. This is not a UI-only hiding rule.
- Existing events and decisions remain untouched. No answer is fabricated and no
  duplicate issue is falsely marked answered. No backfill or customer job is run.
- Travel context, category conflicts, meal relationship/purpose and other distinct
  facts are not suppressed by this predicate.
- The eligibility function is replaced in place so dependent projections retain
  its identity. The helper is service-only; existing authenticated eligibility
  retains its tenant/ownership boundary.

This does **not** finish categorizing the restaurant receipt. Its existing business
allocation remains unchanged and its category/tax uncertainty remains visible as
system-held work, with the existing supporting-document action. Repeatedly asking
the same generic question is not a valid substitute for evidence understanding.
The current supporting-document fallback is still unsatisfactory for an already
legible receipt; remedying that is part of the proposed evidence work, not this fix.

Rollback-only staging validation: raw canonical askable events 26 → 25. Exactly
the current repeated receipt-purpose event disappeared; all other IDs remained.
These are canonical event counts, not necessarily the UI's deduplicated count.
Receipt `needs_fact` became false without changing any customer row. This does not
mean its category/tax treatment became resolved.

## 3. Why useful receipt evidence was ignored

Two different processing paths exist:

1. Canonical OCR uses Google Vision and saves merchant/date/total plus raw extracted
   text. This receipt completed that path in one attempt.
2. An optional OpenAI receipt-understanding path can propose bounded document
   context, including a meal candidate. It cannot establish business purpose or
   deductible treatment. Here its job is pending with **zero attempts**, no
   evaluation and no meal candidate.

Read-only dedicated-staging environment inspection found expensive document
processing enabled, but the semantic reader's enable flag, provider/model settings
and required credential are not configured. No settings were changed. This is not
an OCR failure or evidence of a provider parsing failure.

`loadBookkeepingEvaluationSnapshot` initializes merchant and description to null.
Without a financial source it returns that base snapshot, without loading receipt
merchant or OCR content. With a bank source it uses bank descriptions/provider
categories, but still does not pass receipt text/line items to the category engine.
Receipt semantics contribute through an optional meal-candidate boolean, not a
unified evidence representation.

The deterministic operating-expense classifier reads merchant, description,
provider category and current customer purpose. The generic answer `food` does not
match its controlled restaurant vocabulary. A merchant-specific rule would mask
these missing interfaces rather than repair them.

The generic question projection changes from “What did you buy?” to “How will you
use what you bought?” when a purpose string exists. The text-box example is chosen
largely by whether the question contains “meal”; it therefore offers printer-paper
copy for this restaurant receipt.

## 4. Current evidence → question pipeline

| Stage | Current implementation / limitation |
|---|---|
| Intake | Private document validation/classification, durable jobs and per-file state |
| Receipt extraction | `documents/durable-processing.ts`, `receipt-text.ts`: OCR and canonical header fields; raw text persisted |
| Semantic document context | Optional `receipts/receipt-understanding.ts`/gateway; disabled in this staging configuration |
| Matching | Canonical amount/date/merchant and ownership checks; receipt-only record may converge with later bank activity |
| Evidence snapshot | `bookkeeping/evaluation-snapshot.ts`; bank evidence populated, receipt-only merchant/content gap |
| Nature/business use | Deterministic evaluator and evidence-aware routing; scoped account/customer facts; movement safety |
| Category | Controlled deterministic rules, existing allocations, provider vocabulary and limited customer-description patterns |
| Documentation | Receipt links/unavailability independent of working business allocation; meal-context evidence is separate |
| Tax | Versioned rule engine and required facts, not unrestricted model decisions |
| Questions | Review issues plus specialized deduction/meal facts; current eligibility, historical suppression and projection |
| Answer | Authenticated/version-checked command appends fact/decision/history and resolves issue |
| Reassessment | Answer-time completion plus bounded canonical workers; missing consumed-fact check caused this loop |
| Queue | Canonical eligible IDs, per-record precedence, chronological/stable session and same-record follow-up |

For a current recognized restaurant purchase, existing meal paths distinguish
business use from meal context. Depending on facts already supplied, they ask
business use, attendee/business relationship and business purpose; one answer may
supply multiple explicit facts. Recognizing restaurant food is not proof of a
business meal or deduction. Historical attendee/purpose suppression remains
separate from evidence sufficiency. The fix does not modify those requirements.

## 5. Affected evidence types and representative coverage

This is an architecture/code-path audit, not a claim that every listed merchant was
executed in a live customer certification.

| Type | Evidence currently usable | Principal risk |
|---|---|---|
| Restaurant/food | Provider food category, restaurant vocabulary, existing meal allocation, optional meal candidate | Receipt content unavailable to primary classifier; generic fallback repeats |
| Software | Explicit software/subscription descriptions and supported provider vocabulary | Receipt-only headers/content missing; unfamiliar wording unsupported |
| Office supplies | Explicit printer-paper/stationery/office-supply descriptions | Generic `paper` can remain ambiguous; stored OCR not consumed |
| Business license | License/permit wording | Evidence must reach snapshot; account name alone is not proof |
| Rent | Office/studio/coworking/rental wording | Residential/mixed premises still need material context |
| Insurance | Explicit business/liability/commercial policy wording | Insurer identity does not establish policy type/business coverage |
| Travel | Flight/travel descriptions and provider vocabulary | Business travel context remains separate |
| Lodging | Hotel/motel/lodging descriptions | Receipt hotel evidence alone does not prove business travel |
| Rideshare | Available provider/description context | No complete generalized rideshare-to-business-trip understanding |
| Fuel | Vehicle/fuel descriptions | Business driving/tax-method facts remain necessary; no automatic deduction |
| Professional services | Explicit accounting/legal/professional-service descriptions | Merchant name alone can be insufficient |

The loop can affect any receipt, statement or Plaid purchase that retains an
unrecognized generic purpose after answering. Receipt-only items are most exposed
to the snapshot gap. Matched receipts get bank evidence but still lose useful receipt
content. Statements have descriptions but no Plaid taxonomy. Plaid may mask the gap
with its category evidence. Existing reusable phone/internet percentages do not
constitute a general recurring merchant understanding system.

## 6. Proposed generalized evidence repair — NOT implemented

Create one bounded, provenance-aware purchase-context input for every canonical
record: bank descriptions/categories, extracted merchant, typed document context,
validated relevant text/line-item observations, prior answers, account-use facts,
existing categories and scoped reusable facts. Convergence must preserve receipt
context regardless of whether the receipt or bank transaction arrived first.

Keep document observations separate from customer assertions and tax authority.
Extracting “restaurant food” may resolve purchase nature; it must not imply business
use, attendees, business purpose or deductibility. Treat document content as
untrusted data, never instructions. Do not simply feed arbitrary OCR text into all
current regex rules and call it authoritative evidence.

Before asking, compute which material dimension is missing and which known facts
already resolve it. Persist consumed fact/dependency identities. If a supplied
answer cannot be interpreted, use a specific, bounded clarification or a truthful
system-review state; never regenerate the same generic request under a new decision
ID. Test contradictions, corrections, later receipts and all ingestion paths.

## 7. Current onboarding/catch-up architecture

Onboarding currently includes business description, eligibility, business start,
materials/inventory fit, catch-up scope/quote, historical mileage where applicable,
preferred ingestion method and completion. It therefore does collect catch-up
facts before normal application access.

Completed eligible onboarding grants bookkeeping access independently of Plaid and
optional Get Started acknowledgement. Documents and connected accounts enter the
same canonical records/decisions. This repair does not alter that recent fix.

Existing components include account-use facts, processing jobs, Home priority,
historical personal review, receipt upload/unavailability and conversational queues.
They are not a durable, coordinated initial-catch-up session with a processing
barrier and ordered sweeps. Questions can become available while evidence work is
still incomplete. Current Home priority normally favors missing receipts, then
older-purchase review, then questions; that is not the proposed personal-first
catch-up sequence.

## 8. Proposed onboarding → catch-up → ongoing — NOT implemented

Feasible by composing existing canonical primitives, not a second bookkeeping
engine:

1. Onboarding: identity/security/membership, supported business facts, explicit
   bookkeeping scope and preferred evidence path.
2. Catch-up session: versioned business/account/date scope; connect/import; show
   bounded processing progress before asking transaction questions.
3. Establish account use once. Business-only accounts support business defaults
   with personal/mixed exceptions; mixed accounts need affirmative identification
   of business portions rather than a false business default.
4. Personal/mixed sweep, then receipt upload/matching sweep. “That's all I have”
   must have a clear, bounded eligible-purchase scope and explicit evidence-assertion
   semantics; it is not consent to mark unseen/future records unavailable.
5. Reassess changed dependencies, then present only remaining material questions.
6. Ongoing imports reuse the same engine and show genuinely new exceptions.

Track processing completion, source coverage, bookkeeping decisions and documentation
separately. Missing receipts do not erase working expenses. New evidence can improve
books after catch-up. Show work shrinking without promising a fixed denominator
while jobs still discover records. Product decisions needed: sweep ordering,
completion criteria, scope changes and how interrupted sessions resume.

## 9. Exact Plaid history/date behavior

Repository and deployed SQL agree:

- New Link token requests `transactions.days_requested: 730`.
- No customer start/end dates are sent to Transactions Sync.
- Sync uses access token, stored cursor and `count: 500`; up to 100 pages per run,
  with up to three attempts when pagination is invalidated.
- Initial and later added/modified/removed events enter the same leased apply path.
- `apply_plaid_transaction_sync` creates canonical nonpending activity only when
  its date is on/after `businesses.catch_up_start_date` (or that date is null).
- Earlier provider versions remain stored with `excluded_before_catch_up`; they
  are not simply forced into the active question queue. Provider cursor continuity
  is preserved.

Plaid's initial history request is a number of days: default 90, maximum 730. Initial
recent data and the remaining history may arrive asynchronously. Ongoing cursor sync
returns changes, and stored history can grow beyond the initial two years.
[Plaid Transactions overview](https://plaid.com/docs/transactions/).

Sync is not a start/end-date query. `/transactions/get` supports date filtering of
available data, but that is a different API, not what WriteOffs uses. Customer scope
can be enforced locally; an initial day window can reduce requested history but
cannot guarantee an exact business-date boundary or institution coverage.
[Plaid Transactions API](https://plaid.com/docs/api/products/transactions/).

Available history depends on the financial institution and item; 730 is a request,
not a guarantee. Sandbox fixture history is not proof of real-institution depth.
[Plaid troubleshooting](https://plaid.com/docs/transactions/troubleshooting/).

## 10. Recommended bookkeeping-scope architecture — NOT implemented

Retain provider available-history/cursor state separately from explicit customer
bookkeeping scope. Apply the same scope policy to Plaid, statements and manual
records, with explicit exceptions for relationship evidence needed to explain
in-scope refunds/payments. Scope must not discard immutable provenance.

The current Plaid apply filter is a useful foundation. A scope change needs a
bounded, idempotent promotion/reprojection path over retained provider versions;
merely changing a date or awaiting the next cursor delta does not reliably import
unchanged older history. Do not relink or force a full history replay as a UI
workaround. Preserve source coverage gaps and paid coverage authority separately
from question eligibility. Verify statement/manual parity before broadening scope.

## 11. Check-in UX findings — NOT redesigned

Current code uses a small 3rem Betti identity, subordinate transaction context and
counter text “N answered · More waiting.” Generic placeholder selection does not
reflect available receipt facts. User-reported whitespace and weak merchant
hierarchy are consistent with this layout, but no new viewport visual certification
was performed for this investigation.

Next design: prominent merchant identity with a reliable logo/neutral fallback,
visible subordinate date/amount, a stronger canonical Betti presence, compact
question/answer grouping and contextual help grounded in known evidence. Do not
replace artwork. Distinguish answered facts from completed items; explain processing
versus remaining customer work. Preserve contextual navigation, keyboard focus,
mobile controls and success versus deferral semantics.

## 12. Change scope

Only the ordinary-purpose loop guard, canonical eligibility migration and regression
tests are product changes. This audit is an evidence document, not a new workflow
specification. No classifier vocabulary, meal policy, onboarding, Plaid history,
receipt ingestion/matching, customer facts, artwork or visual layout is changed.

## 13. Validation

- Focused regressions: 35 passed, including receipt-backed repeated reassessment,
  queue advancement, unknown facts, failed evidence reads and distinct travel facts.
- Full suite: 1,399 passed; 143 environment-gated tests skipped. Skipped integration
  tests are not claimed as passed.
- ESLint: no errors; 16 existing warnings.
- Optimized production build passed; TypeScript passed after regeneration of stale
  duplicate `.next` declarations found in the first attempt.
- Rollback-only migration validation: exactly one duplicate canonical event removed,
  no unrelated eligibility change, transaction projection updated, direct helper
  execution denied to ordinary authenticated role.
- Dependency audit: two existing moderate development-tool advisories (`vitest`,
  `@vitest/mocker`); no dependency changes or unrelated upgrade attempted.

Deployment/secret-scan/preservation results are recorded in the final task response.
No customer answer or classification is supplied by this repair.
