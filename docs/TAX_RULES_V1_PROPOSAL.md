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

There is one canonical rule catalog and one evaluator. Rules have stable `tax.*`
keys and an immutable positive version. Their lifecycle is `candidate`, `approved`, `active`, or
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

Business profile is optional factual context supplied to that same evaluator. A
Realtor profile may strengthen evidence about a merchant, item, or likely purpose,
but it neither selects a different catalog nor satisfies business-use or other
material facts by itself. “General” means that no more-specific profile context is
available; it is not a rule namespace, engine, or customer path.

The single path is: source evidence → factual evidence → business-use
determination → bookkeeping/P&L treatment → canonical tax-treatment evaluation →
tax-preparation output.

## 5. Universal candidate inventory

“Key” is a proposed catalog identity, not an existing active canonical key. Legacy
categories/rulesets and the old keyword-based `Ask WriteOffs` endpoint are discovery
inputs only; they are mutable, merchant-driven, and not authoritative.

| Candidate / proposed key | Evidence currently possible | Missing material facts | Likely class | Special calculation | Approved now? |
|---|---|---|---|---|---|
| Advertising / `tax.advertising` | Purpose, service type, receipt, date, business use | Confirm promotional business purpose when ambiguous | Safe automatic or Ask first | No obvious transaction-level calculation | No |
| Commissions and fees / `tax.commissions-fees` | Purpose, merchant/service type, amount | Relationship to business revenue/service | Ask first | Possibly annual/report grouping | No |
| Dues and memberships / `tax.dues-fees` | Organization/service type, purpose, amount | Organization type and business relationship | Ask first | Some memberships may need special review | No |
| Contract labor / `tax.contract-labor` | Payee description, purpose, amount | Worker/service relationship and information-reporting facts | Ask first | Reporting obligations outside this engine | No |
| Insurance / `tax.insurance` | Provider/service type, purpose | Policy type, personal coverage, vehicle/health context | Ask first | Some types require special handling | No |
| Legal/professional / `tax.professional-services` | Provider type, purpose, receipt | Business matter versus personal/capital matter | Ask first | Capital matters may be special | No |
| Office expense / `tax.office-expense` | Item/service type, purpose, business use | Asset indicator for durable property | Safe automatic or Ask first | Assets are special | No |
| Rent/lease / `tax.rent-lease` | Payee, purpose, recurring evidence | Property/equipment type, related-party and personal-use facts | Ask first | Some leases require special treatment | No |
| Repairs/maintenance / `tax.repairs-maintenance` | Service type, purpose, asset context | Repair versus improvement | Ask first | Improvements/capitalization are special | No |
| Supplies / `tax.supplies` | Item type, receipt, purpose | Asset/inventory indicator where ambiguous | Safe automatic or Ask first | Inventory/assets are special | No |
| Taxes/licenses / `tax.taxes-licenses` | Agency/payee, purpose, date | Tax/license type and penalties | Ask first | Some amounts may be nondeductible/special | No |
| Utilities / `tax.utilities` | Provider type, recurring evidence | Business location/use and personal portion | Ask first | Allocation may precede tax rule | No |
| Software/subscriptions / `tax.software-subscriptions` | Service type, purpose, recurring evidence | Personal portion; acquisition/capital indicator | Safe automatic or Ask first | Some acquisitions may be special | No |
| Education/training / `tax.education-training` | Provider/course, purpose | Relationship to current business and qualification change | Ask first | No simple universal outcome | No |
| Travel / `tax.travel` | Merchant type, dates, purpose | Away-from-home, duration, primary purpose, personal portion | Ask first | Trip-level aggregation may be needed | No |
| Meals / `tax.meals` | Restaurant/service type, date, amount | Business context, attendee/purpose, exceptions | Ask first | Limitation/exception handling | No |
| Gifts / `tax.gifts` | Item, date, amount, purpose | Recipient identity and annual recipient total | Ask first | Annual per-recipient calculation | No |
| Vehicle/car / `tax.vehicle` | Vehicle intake and expense/mileage facts | Election, ownership/lease, commuting, complete use facts | Special treatment | Yes | No |
| Home office / `tax.home-office` | Some onboarding area/use answers | Qualification, method election, household/carryover facts | Special treatment | Yes | No |
| Equipment/assets / `tax.equipment-assets` | Item, amount, date, purpose | Asset class, placed-in-service, disposition, election facts | Special treatment | Yes | No |
| Depreciation / `tax.depreciation` | Asset facts when eventually collected | Basis, class life, method, prior depreciation | Special treatment | Yes | No |
| Section 179 / `tax.section-179` | None sufficient today | Eligibility, election, annual/business-income limits, carryover | Special treatment | Yes | No |
| Interest / `tax.interest` | Payee, amount, account context | Debt purpose, allocation, capitalization rules | Ask first or special | Sometimes | No |
| Bank/processing fees / `tax.processing-fees` | Financial account/source and service type | Business-account connection and fee nature | Potential safe automatic | Usually no, subject to review | No |
| Other ordinary expense / `tax.other-expense` | Purpose and business use | Specific nature/category and special-treatment indicators | Ask first | Depends | No |

The repository’s `knowledge/irs/canon.json` contains dated snippets for general,
advertising, meals, travel, vehicle, gifts, and home office. Those snippets and the
legacy Schedule C mappings are **not approvals**; citations and current tax-year
revisions must be independently reviewed before any corresponding rule is active.
The legacy `/api/writeoffs/check` keyword endpoint is therefore fail-closed; it may
not return merchant-driven tax conclusions while the production catalog is empty.

## 6. Realtor context evidence for universal candidates

Realtor context can improve factual interpretation, but never turns a merchant into
a deduction. The rows below map Realtor-flavored evidence to the same universal
candidate identities above. They are not separate rules, a separate catalog, or a
separate evaluation path. Each candidate still requires business use and purpose
support.

| Context example / shared candidate | Contextual evidence | Missing material facts | Likely class | Approved now? |
|---|---|---|---|---|
| MLS access / `tax.software-subscriptions` or `tax.dues-fees` | Service identity, recurring charge, Realtor context | Actual service and business purpose if ambiguous | Potential safe automatic | No |
| Association/board dues / `tax.dues-fees` | Organization/service type and Realtor context | Organization type and business connection | Ask first | No |
| Lockboxes / `tax.supplies` or `tax.equipment-assets` | Item/service identity and listing purpose | Durable-asset and personal-use facts | Ask first | No |
| Listing photography/video / `tax.advertising` or `tax.professional-services` | Vendor type and listing purpose | Actual service if ambiguous | Potential safe automatic | No |
| Signs/flyers/materials / `tax.advertising` or `tax.supplies` | Item and listing/marketing purpose | Asset or personal use when ambiguous | Ask first | No |
| Digital advertising/leads / `tax.advertising` | Service type and campaign purpose | Business account/use | Potential safe automatic | No |
| CRM/software / `tax.software-subscriptions` | Service type and Realtor workflow purpose | Personal portion or durable acquisition | Safe automatic or Ask first | No |
| Transaction coordinator / `tax.contract-labor` or `tax.professional-services` | Provider/service and transaction purpose | Worker/service relationship | Ask first | No |
| Staging services / `tax.professional-services` or `tax.other-expense` | Vendor and listing purpose | Reimbursement, ownership, capital-property facts | Ask first/special | No |
| Open-house supplies / `tax.supplies` | Item and event/listing purpose | Personal use, gift, or meal character | Ask first | No |
| Continuing education / `tax.education-training` | Course/provider and Realtor context | Current-business relationship and qualification effect | Ask first | No |
| Licensing expense / `tax.taxes-licenses` | Agency/payee, license type, and Realtor context | Initial versus continuing context; penalties | Ask first | No |
| Mileage/vehicle / `tax.vehicle` | Realtor purpose plus future trip/vehicle facts | Complete trip, commuting, election, and vehicle facts | Special treatment | No |
| Client/business meals / `tax.meals` | Realtor context, date, and merchant | Attendees, business discussion, exception facts | Ask first/special | No |
| Business gifts / `tax.gifts` | Realtor context, item, and date | Recipient and annual aggregation | Ask first/special | No |
| Home office / `tax.home-office` | Realtor context and onboarding facts | Full qualification, method, carryover facts | Special treatment | No |

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
- When business-profile context is sufficiently reliable and material to strengthen
  evidence for a shared rule, without replacing required transaction facts.

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
5. Explicitly promote individual versions to `active`; never activate the entire
   catalog or a group of candidates by default.
6. Add Ask-first contracts only where shadow evidence proves they are material.
7. Build special calculators as separate milestones with annual-level tests.

Until those approvals occur, production remains unresolved and Estimated Deductions
remains unavailable except for independently persisted, previously trusted canonical
treatments.
