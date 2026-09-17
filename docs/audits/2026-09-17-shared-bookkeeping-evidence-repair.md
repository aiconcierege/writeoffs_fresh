# Shared bookkeeping evidence repair

Scope: staging, following `4f673725c7b450a6318bc897711c487dfa763063`.
No catch-up redesign, merchant-logo work, authoritative transaction AI, new tax policy,
or manual certification-customer repair.

## Root causes

1. The evaluation snapshot loaded document links, but not their extraction contents.
   Receipt-only records returned before acquiring financial merchant/description evidence.
   Successful Google Vision OCR therefore did not imply successful purchase recognition.
2. Meal routing depended on provider/merchant strings or a separate semantic meal candidate.
   The semantic reader was unconfigured; ordinary OCR restaurant/food evidence was unused.
3. The question read model separately reconstructed identity from financial transactions,
   losing receipt-only merchant context and documents attached to absorbed source records.
4. A purchase-description answer and a business-purpose answer share a legacy storage field.
   A saved answer such as “food” must not establish a business-meal purpose.
5. Unanswered issues refreshed only when the database's structural evidence fingerprint
   changed, not when the assessment context/decision changed. New receipt content could
   therefore leave an outstanding question bound to stale context.

## Shared input and consumers

`shared-evidence.ts` defines a versioned envelope with a stable nested-content fingerprint.
Each observation retains source kind/ID, provider, basis (`observed`, `inferred`, or
`customer_supplied`), and confidence where known. Missing extraction confidence is `null`,
not an invented probability. Extraction quality is separate from classifier rule scores.

The snapshot carries financial merchant/description, provider category, amount/date/direction,
account-use fact, linked receipt extractions, typed answer history, current decision and
allocations, and applicable existing merchant-scoped deduction facts. Category candidates
are derived and persisted by the existing assessment service; they are not recursively
included in their own input hash. Existing allocations/categories retain precedence.

The receipt loader batches 50 IDs per query, scopes every query to the business, selects the
latest immutable extraction, and follows active document links including converged records.
It does not retrieve files, call a model, or mutate data. Unlinked receipts cannot influence
another transaction. A receipt-only record does not acquire a statement account's use fact.

Only usable, amount-aligned, dated receipt evidence contributes purchase descriptors.
Suspect/incomplete/conflicting evidence remains uncertain. Bounded visible OCR content excludes
payment-number and instruction-like lines. Raw OCR text is not serialized into the customer
question response. Receipt links/identity remain distinct from financial source identity.

Existing economic-context, operating-category, phone/internet and vehicle consumers now use
these descriptors. Recognition does not create business purpose, allocation percentages,
meal attendees, travel facts, vehicle-method facts, or supported deductions. Customer
corrections and split amounts remain authoritative. Withdrawal of unsupported inferred
business use takes precedence over unrelated category enrichment.

The question projection uses the same receipt loader/recognition helpers. Worker reconciliation
retires generic purchase/business-use issues when supported facts already resolve them,
without claiming a customer answered. Meal attendee/purpose and travel questions remain
separate. Historical suppression remains in the canonical askability layer.

## Question-state protection

- Existing saved-purpose loop guard remains in place.
- Meal question identity is record + material fact, not a new assessment ID on each run.
- Unanswered question refresh appends a `reopened` event within the same issue's history.
  It requires changed context, evidence or decision; history remains immutable.
- Already answered/resolved issues and customer deferrals are not refreshed by the worker.
- A prior generic “food” answer is not accepted as a meal business purpose.
- Customer-authoritative business context is accepted by the normal meal-answer command,
  with ownership, current event/decision, and evidence checks retained.

## Generalization results

All use receipt content, not added merchant-name tables. The snapshot/worker integration tests
also exercise the actual loader and processing orchestration, not just prompt assertions.

| Evidence class | Supported candidate | Remaining material work |
| --- | --- | --- |
| Restaurant + food items | Meals | Business use where unknown; existing meal context/substantiation rules |
| Software subscription | Software | Business use where unknown |
| Office supplies | Office expense | Business use where unknown |
| Business license | Taxes/licenses | Business use where unknown |
| Office rent | Rent | Business use where unknown |
| Commercial liability insurance | Insurance | Business use where unknown |
| Airfare | Travel | Business use/travel facts under existing rules |
| Hotel/lodging | Travel | Business use/travel facts under existing rules |
| Rideshare fare | Travel candidate | Business/travel context; no inferred deduction |
| Gasoline | Vehicle operating expense | Vehicle/business allocation and existing method safeguards |
| Accounting services | Legal/professional | Business use where unknown |

Business-only account evidence suppresses redundant business/personal questions for ordinary
supported purchases. It does not establish vehicle/telecom percentages or turn money movement
into purchases. Ambiguous and conflicting descriptions still need clarification.

McDonald's is an integration tracer only. Its restaurant/food OCR supports meal identity;
a saved “food” answer does not support business purpose. The existing customer business-use
answer remains authoritative. The worker requests only missing meal facts and does not recreate
the generic purchase question. No new deduction or receipt match is asserted by recognition.

A GET-only preview against the actual staging McDonald's record confirmed:
Google Vision evidence usable; Meals candidate; existing business treatment retained;
no supported business-meal purpose; receipt-only; account use null. The persisted category
was still null. The preview did not apply its result or run reassessment.

## Semantic reader investigation

Fresh read of the pinned staging environment on September 17:

- `RECEIPT_UNDERSTANDING_ENABLED`: absent.
- `RECEIPT_UNDERSTANDING_MODEL`: absent.
- `RECEIPT_UNDERSTANDING_PROVIDER`: absent (code default is `openai`).
- `OPENAI_API_KEY`: absent.
- Existing document expensive-processing flag is configured separately.

Expected service: OpenAI Responses API, explicit vision/PDF-capable model, strict structured
receipt schema. Gateway activation requires enabled=true, supported provider, nonempty model
and API key. The disabled drain returns without claiming semantic jobs, explaining zero attempts.
No existing approved credential/model is available here; activation is stopped, not substituted
with a new provider or paid service. Production's hosted configuration was not inspected and
cannot be claimed configured or unconfigured. The repository defaults disable it in any
environment missing those settings.

The reader has a 45-second request timeout, a 10-page PDF cap, bounded queue batches,
validated structured proposals, document-hash verification, audited failures and retry handling.
It is not authoritative tax/bookkeeping AI. Its schema currently supports receipt fields and
an evidence-backed meal signal, not general trusted multi-category line-item allocations.

Cost depends on selected model, image dimensions/detail, PDF pages, and output tokens; no
honest per-document price can be quoted without choosing and measuring a model. Enabling it
adds remote-provider latency and billable image/text input and output tokens. See
[OpenAI image-token accounting](https://developers.openai.com/api/docs/guides/images-vision)
and [pricing](https://developers.openai.com/api/docs/pricing).

Documents are sent privately to that provider, not made public; the request uses `store:false`.
That is not a zero-retention guarantee. OpenAI documents no API training by default and normal
abuse-monitoring retention, with separate approved retention controls. See
[API data controls](https://developers.openai.com/api/docs/guides/your-data).
A credential, selected supported model, spending approval/budget and acceptable provider data
handling are required before activation. No hosted environment values were changed here.

Fallback: existing OCR processing continues. Reliable deterministic evidence narrows questions;
unknown evidence stays unknown. No semantic attempt, confidence, interpretation, or tax fact is
fabricated when the reader is unavailable. This repair adds no model-call cost.

## Migration and rollout

`20260922000200_shared_receipt_evidence.sql` adds an RLS-preserving latest-extraction view,
a future-extraction trigger for canonical idempotent worker jobs, and repairs meal-context
and unanswered-question refresh boundaries. No existing customer rows are backfilled or
manually reassessed. Existing items use the shared input on their next canonical processing
event; deploying code alone is not a claim that every historical record was reprocessed.

Rollback-only SQL certification creates two transaction-local synthetic tenants, tests latest
extraction selection, tenant isolation, extraction job creation, meal answer/purpose follow-up,
stable question identity, retry and deferral behavior, then rolls everything back. It does not
use Rick's tenant. No storage object or permanent certification customer is created.

## Validation and boundaries

- Full suite: 1,431 passed; 143 environment-dependent tests skipped (42 files).
- New shared-evidence tests: 30 class/provenance/ambiguity/fingerprint checks, plus real snapshot
  and real worker integration tests. Existing loop regressions also pass.
- Dedicated staging rollback SQL: passed, including real answer commands and RLS.
- TypeScript: passed. ESLint: no errors, 16 existing warnings.
- Optimized local webpack build: passed. Local Turbopack cannot bind its compiler port in this
  environment; hosted staging's normal build is verified separately at deployment.
- Dependency audit: two moderate existing Vitest-tooling advisories; no high/critical findings.
  No dependencies upgraded in this repair.
- Gitleaks source scan: no leaks. `git diff --check`: clean.

No broad clean-room certification, customer answers, statement re-upload, Plaid connection,
manual classifications, document ingestion changes, catch-up orchestration, Check-in visual
redesign, or logo/Betti changes were performed. The only client change moves a pure dollar-input
parser out of the server evidence module to preserve Next's server/client boundary.
