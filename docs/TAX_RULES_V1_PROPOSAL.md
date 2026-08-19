# Tax Rules v1 — candidate proposal

Status: **architecture and candidate inventory only**. Nothing in this document is
an approved tax conclusion. The production catalog is intentionally empty. Every
candidate below requires product and qualified tax/legal review before activation.

## 1. Architectural principles

Bookkeeping answers what happened economically. Tax treatment answers how that
already-recorded activity is handled for tax preparation. Source facts, business
use, personal use, bookkeeping expense, income, and profit are upstream facts.
Tax grouping and limitations are downstream conclusions and may never rewrite
those facts.

Rules operate on the current canonical decision and exact business allocation.
They use versioned factual evidence, fail closed, preserve their explanation and
authority identifiers, and append a new treatment rather than changing history.
Merchant recognition is evidence about a service or item; it is never itself a
deduction rule. Documentation risk is separate from both bookkeeping and tax
treatment.

## 2. Rule lifecycle and versioning

Rules have stable `general.*`, `realtor.*`, or `shared.*` keys and an immutable
positive version. Their lifecycle is `candidate`, `approved`, `active`, or
`retired`. Only `active` rules can execute. An active production rule must have an
approval reference and external authority metadata. A tax-year range selects a
version prospectively; historical treatments retain their exact rule key, version,
tax year, factual basis, outcome, adjustment method, explanation, and authority
identifiers. Re-evaluation is never automatic.

The evaluator returns unresolved when there is no active rule, the year is not
supported, facts are missing, or more than one rule applies. Candidate, merely
approved, and retired rules do not execute. The test catalog is marked
`test_fixture` and the production entry point rejects it.

## 3. Automation levels and outcomes

- **Safe automatic**: an approved rule can conclude from complete canonical facts.
- **Ask first**: one or more material factual answers are required.
- **Special treatment**: an election, annual limit, depreciation, carryover, or
  other calculation prevents a simple transaction-level deduction.

The framework represents full, fixed-fraction, nondeductible, and special outcomes.
Fixed fractions are infrastructure, not an activated meals or other real rule.
Special outcomes do not claim a deductible amount. Missing facts remain unresolved.

A separate adjustment table is not needed for an exact transaction-level full,
fixed-fraction, or zero outcome: the append-only allocation-scoped tax treatment
already stores the downstream deductible amount and adjustment method without
touching bookkeeping. Annual elections, cross-transaction limits, depreciation,
and carryovers are intentionally represented as `special_treatment`; they will need
a separately approved annual-calculation model rather than being forced into a
transaction allocation.

## 4. Existing factual-question coverage

| Fact | Current coverage | Gap |
|---|---|---|
| Transaction nature | Existing factual transaction-type contract | None for current semantic types |
| Business/personal use | Existing explicit Business, Personal, Both contract | Personal remains customer-only |
| Personal amount | Existing exact-dollar mixed-use follow-up | None for transaction allocation |
| Business purpose | Existing plain-language purpose contract | Structured purpose interpretation remains trusted processing |
| Merchant/service type | Extraction and source descriptions can provide evidence | No approved factual-normalization catalog |
| Receipt present | Canonical document links/history | Documentation does not establish deductibility |
| Date/tax year | Canonical immutable source date | Missing dates remain unresolved |
| Asset/equipment indicator | Not an approved customer contract | Candidate question; likely special treatment |
| Travel-away-from-home facts | Missing | Candidate factual contract; do not infer from merchant |
| Meal business context | Missing | Candidate factual contract |
| Gift recipient/year facts | Missing | Candidate factual contract and annual aggregation |
| Home-office qualification | Some onboarding facts exist | Not yet canonical tax evidence; needs separate approval |
| Vehicle-use/election facts | Vehicle intake foundation only | Future Vehicle milestone; special treatment |
| Reimbursement status | Missing | Candidate factual contract where materially required |

Do not create all missing questions at once. A question should be added only when
an approved rule proves the fact is material and the answer can change an outcome.

## 5. General candidate inventory

“Key” is a proposed namespace, not an existing active canonical key. Legacy
categories/rulesets and the old keyword-based `Ask WriteOffs` endpoint are discovery
inputs only; they are mutable, merchant-driven, and not authoritative.

| Candidate / proposed key | Evidence currently possible | Missing material facts | Likely class | Special calculation | Approved now? |
|---|---|---|---|---|---|
| Advertising / `general.advertising` | Purpose, service type, receipt, date, business use | Confirm promotional business purpose when ambiguous | Safe automatic or Ask first | No obvious transaction-level calculation | No |
| Commissions and fees / `general.commissions-fees` | Purpose, merchant/service type, amount | Relationship to business revenue/service | Ask first | Possibly annual/report grouping | No |
| Contract labor / `general.contract-labor` | Payee description, purpose, amount | Worker/service relationship and information-reporting facts | Ask first | Reporting obligations outside this engine | No |
| Insurance / `general.insurance` | Provider/service type, purpose | Policy type, personal coverage, vehicle/health context | Ask first | Some types require special handling | No |
| Legal/professional / `general.professional-services` | Provider type, purpose, receipt | Business matter versus personal/capital matter | Ask first | Capital matters may be special | No |
| Office expense / `general.office-expense` | Item/service type, purpose, business use | Asset indicator for durable property | Safe automatic or Ask first | Assets are special | No |
| Rent/lease / `general.rent-lease` | Payee, purpose, recurring evidence | Property/equipment type, related-party and personal-use facts | Ask first | Some leases require special treatment | No |
| Repairs/maintenance / `general.repairs-maintenance` | Service type, purpose, asset context | Repair versus improvement | Ask first | Improvements/capitalization are special | No |
| Supplies / `general.supplies` | Item type, receipt, purpose | Asset/inventory indicator where ambiguous | Safe automatic or Ask first | Inventory/assets are special | No |
| Taxes/licenses / `general.taxes-licenses` | Agency/payee, purpose, date | Tax/license type and penalties | Ask first | Some amounts may be nondeductible/special | No |
| Utilities / `general.utilities` | Provider type, recurring evidence | Business location/use and personal portion | Ask first | Allocation may precede tax rule | No |
| Software/subscriptions / `general.software-subscriptions` | Service type, purpose, recurring evidence | Personal portion; acquisition/capital indicator | Safe automatic or Ask first | Some acquisitions may be special | No |
| Education/training / `general.education-training` | Provider/course, purpose | Relationship to current business and qualification change | Ask first | No simple universal outcome | No |
| Travel / `general.travel` | Merchant type, dates, purpose | Away-from-home, duration, primary purpose, personal portion | Ask first | Trip-level aggregation may be needed | No |
| Meals / `general.meals` | Restaurant/service type, date, amount | Business context, attendee/purpose, exceptions | Ask first | Limitation/exception handling | No |
| Gifts / `general.gifts` | Item, date, amount, purpose | Recipient identity and annual recipient total | Ask first | Annual per-recipient calculation | No |
| Vehicle/car / `general.vehicle` | Vehicle intake and expense/mileage facts | Election, ownership/lease, commuting, complete use facts | Special treatment | Yes | No |
| Home office / `general.home-office` | Some onboarding area/use answers | Qualification, method election, household/carryover facts | Special treatment | Yes | No |
| Equipment/assets / `general.equipment-assets` | Item, amount, date, purpose | Asset class, placed-in-service, disposition, election facts | Special treatment | Yes | No |
| Depreciation / `general.depreciation` | Asset facts when eventually collected | Basis, class life, method, prior depreciation | Special treatment | Yes | No |
| Section 179 / `general.section-179` | None sufficient today | Eligibility, election, annual/business-income limits, carryover | Special treatment | Yes | No |
| Interest / `general.interest` | Payee, amount, account context | Debt purpose, allocation, capitalization rules | Ask first or special | Sometimes | No |
| Bank/processing fees / `general.processing-fees` | Financial account/source and service type | Business-account connection and fee nature | Potential safe automatic | Usually no, subject to review | No |
| Other ordinary expense / `general.other-expense` | Purpose and business use | Specific nature/category and special-treatment indicators | Ask first | Depends | No |

The repository’s `knowledge/irs/canon.json` contains dated snippets for general,
advertising, meals, travel, vehicle, gifts, and home office. Those snippets and the
legacy Schedule C mappings are **not approvals**; citations and current tax-year
revisions must be independently reviewed before any corresponding rule is active.
The legacy `/api/writeoffs/check` keyword endpoint is therefore fail-closed; it may
not return merchant-driven tax conclusions while the production catalog is empty.

## 6. Realtor candidate inventory

Realtor context can improve factual interpretation, but never turns a merchant into
a deduction. Each candidate still requires business use and purpose support.

| Candidate / proposed key | Contextual evidence | Missing material facts | Likely class | Approved now? |
|---|---|---|---|---|
| MLS access / `realtor.mls-access` | Service identity, recurring charge, Realtor profile | Business use/purpose if account is ambiguous | Potential safe automatic | No |
| Association/board dues / `realtor.association-dues` | Organization/service type | Organization type, business connection | Ask first | No |
| Lockboxes / `realtor.lockboxes` | Item/service identity, listing purpose | Personal/asset use where applicable | Potential safe automatic | No |
| Listing photography/video / `realtor.listing-media` | Vendor type, listing purpose | Which business/listing if ambiguous | Potential safe automatic | No |
| Signs/flyers/materials / `realtor.listing-materials` | Item and listing/marketing purpose | Asset or personal use when ambiguous | Potential safe automatic | No |
| Digital advertising/leads / `realtor.lead-generation` | Service type, campaign purpose | Business account/use | Potential safe automatic | No |
| CRM/software / `realtor.software` | Service type and Realtor workflow purpose | Personal portion or durable acquisition | Safe automatic or Ask first | No |
| Transaction coordinator / `realtor.transaction-coordinator` | Provider/service and transaction purpose | Worker/service relationship | Ask first | No |
| Staging services / `realtor.staging-services` | Vendor and listing purpose | Reimbursement, ownership, capital property | Ask first/special | No |
| Open-house supplies / `realtor.open-house-supplies` | Item, event/listing purpose | Personal use, gift/meal character | Ask first | No |
| Continuing education / `realtor.education` | Course/provider and Realtor profile | Current-business relationship and qualification effect | Ask first | No |
| Licensing expense / `realtor.licensing` | Agency/payee and license type | Initial versus continuing context; penalties | Ask first | No |
| Mileage/vehicle / `realtor.vehicle` | Realtor purpose plus future trip/vehicle facts | Complete trip, commuting, election and vehicle facts | Special treatment | No |
| Client/business meals / `realtor.meals` | Realtor context, date, merchant | Attendees, business discussion, exception facts | Ask first/special | No |
| Business gifts / `realtor.gifts` | Realtor context, item, date | Recipient and annual aggregation | Ask first/special | No |
| Home office / `realtor.home-office` | Realtor profile and onboarding facts | Full qualification, method, carryover facts | Special treatment | No |

## 7. Explanation and authority model

An eventual customer explanation should combine the factual basis and reviewed
template, for example: “WriteOffs treated this as an office expense because you
identified it as supplies used for your business.” It should not mention confidence,
internal rule IDs, or claim that AI decided the result. Support/audit views may use
rule key, version, tax year, approval reference, and compact authority references.
Do not store copied publications or instructions.

## 8. Special-treatment boundary

Vehicle methods, depreciation, Section 179, home office, gifts, and any other
annual limit, election, basis, carryover, or cross-transaction calculation must
produce `special_treatment` until a separately approved calculator exists. A
special result has no transaction-level deductible amount and cannot make Estimated
Deductions appear complete.

## 9. Unresolved decisions requiring review

Product decisions:

- Which internal category taxonomy is stable enough to become canonical Tax Rules v1?
- Which minimal factual questions are acceptable for each Ask-first rule?
- Whether and how incomplete tax estimates should be shown outside internal reports.
- Whether General and Realtor share rules with profile-specific factual interpretation
  or require separately approved outcomes.

Tax/legal review decisions:

- Current authoritative source and tax-year revision for every candidate.
- Exact qualification, exception, limitation, rounding, annual aggregation, election,
  carryover, and substantiation requirements.
- Which candidates truly qualify for safe automation.
- Whether any transaction-level conclusion requires practitioner review.

## 10. Proposed phased rollout

1. Review and approve the canonical category taxonomy and authority-source format.
2. Select a very small set of fact-complete, non-special candidates for legal review.
3. Approve exact factual contracts and rule versions for one tax year.
4. Add reviewed rules as `approved`, test shadow evaluation, and inspect explanations.
5. Explicitly promote individual versions to `active`; never activate an entire
   candidate namespace by default.
6. Add Ask-first contracts only where shadow evidence proves they are material.
7. Build special calculators as separate milestones with annual-level tests.

Until those approvals occur, production remains unresolved and Estimated Deductions
remains unavailable except for independently persisted, previously trusted canonical
treatments.
