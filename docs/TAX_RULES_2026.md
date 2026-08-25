# WriteOffs 2026 federal tax-rule catalog

Status: approved production catalog for the bounded rules below

Implementation version: `tax-rules:2026:v1`

Research and review date: **2026-08-25**

Scope: U.S. federal Schedule C-oriented records only

## Scope and approval boundary

WriteOffs 2026 support is deliberately the same narrow production surface as 2025:
seven Tier A current-expense rules. The catalog does not add tax filing, tax-liability
calculation, a general deduction engine, or a conclusion about an individual return.
It preserves the bookkeeping amount and applies a downstream estimated deductible
amount only after the existing factual and exclusion gates pass.

The controlling source for the 2026 result is 26 U.S.C. § 162(a), as in effect on
the review date. The current final IRS small-business publication is used to
corroborate the established category interpretations and exclusions. The IRS had
posted a **draft** 2026 Schedule C, but not final 2026 Schedule C instructions or a
2026 revision of Publication 334. The draft was reviewed for category continuity
and is not relied on as production authority.

## Authoritative sources

| Source | Status on 2026-08-25 | Production use |
|---|---|---|
| [26 U.S.C. § 162](https://uscode.house.gov/view.xhtml?req=%28title%3A26%20section%3A162%20edition%3Aprelim%29) | Final controlling law; page reported laws in effect through July 21, 2026 | Ordinary and necessary current trade/business expense authority for all seven rules |
| [IRS Publication 334 (2025), current final revision](https://www.irs.gov/publications/p334) | Final current IRS guidance; 2026 revision not yet final | Category and exclusion corroboration; no 2026 numerical value imported |
| [IRS tangible-property final-regulation guidance](https://www.irs.gov/businesses/small-businesses-self-employed/tangible-property-final-regulations) | Final IRS guidance | Corroborates the operating-supply boundary and capitalization exclusions |
| [Draft IRS tax forms](https://www.irs.gov/draft-tax-forms) | Preliminary; IRS says not to rely on drafts | Reference-only check of draft 2026 Schedule C layout |

The code’s structured source manifest is `TAX_RULE_SOURCE_MANIFEST_2026` in
`app/lib/bookkeeping/tax-rule-catalog.ts`. It records the source, URL, scope,
research date, final/preliminary status, implementation interpretation, and approval
status for each production rule.

## Supported 2026 rules

All seven outcomes are full deduction of the already-established business allocation;
none supplies the business allocation or turns unresolved spending Personal.

| Rule | Existing required boundary |
|---|---|
| `tax.advertising@2` | Ordinary promotion; not a capital asset |
| `tax.office-expense@2` | Current-use office expense; not durable property or inventory |
| `tax.supplies@2` | Consumable operating supply; not durable property, resale inventory, or customer-job material |
| `tax.postage-shipping@2` | Standalone business delivery; not capital/inventory/reimbursement context |
| `tax.software-cloud@2` | Routine current service; not a capitalizable right or multi-year prepayment |
| `tax.payment-bank-fees@2` | Payment-processing or business-account service fee; not interest, principal, transfer, or penalty |
| `tax.business-license@2` | Ordinary current-business license/permit/registration; not startup, tax, fine, penalty, or capital right |

Each 2026 rule is separately versioned from its `@1` 2025 counterpart and covers
only dates in 2026. Catalog release `tax-rules:2026:v1` does not mutate
`tax-rules:2025:v1`.

## Comparison with 2025

The seven implemented outcomes and factual gates are unchanged. No numerical
deduction parameter exists in these rules. The changes are tax-year identity,
rule version, approval reference, and 2026 source provenance.

The draft 2026 Schedule C retains the relevant high-level expense groupings, but
form-level finality is not claimed until the IRS publishes final materials.

## Numerical rules reviewed but not activated

- **Mileage:** IRS Notice 2026-10 set 72.5 cents per business mile from January 1
  through June 30. [IRS Announcement 2026-20 / IR-2026-29](https://www.irs.gov/tax-professionals/standard-mileage-rates)
  revised the rate to 76 cents from July 1 through December 31. WriteOffs currently
  records exact mileage facts but does not select a vehicle deduction method, so
  neither rate is placed in the production deduction catalog.
- **Meals:** the candidate 50% treatment remains inactive. WriteOffs has not approved
  the necessary meal-purpose, attendee, exception, reimbursement, and substantiation
  gates, so no 2026 meal deduction is estimated.
- **Contractor awareness:** final [2026 Forms 1099-MISC/1099-NEC instructions](https://www.irs.gov/instructions/i1099mec),
  [IRS Publication 1099 (2026)](https://www.irs.gov/publications/p1099), and
  [26 U.S.C. § 6041](https://uscode.house.gov/view.xhtml?edition=prelim&num=0&req=granuleid%3AUSC-prelim-title26-section6041)
  establish the $2,000 base threshold for relevant 2026 payments. The bounded
  contractor attention rule therefore uses 200,000 cents for 2026. It remains only
  “Potential 1099 attention,” because entity, payment nature, payment method,
  exceptions, and other filing facts remain outside the dollar test.

## Deferred and unsupported rules

Home-office facts remain factual and unresolved; WriteOffs does not choose simplified
versus actual method. Equipment remains special treatment with no depreciation,
Section 179, bonus-depreciation, or MACRS calculation. Vehicle method selection,
meals, entertainment, travel, gifts, startup costs, inventory/COGS, QBI,
self-employment tax, estimated payments, state tax, and return preparation remain
unsupported. Unsupported amounts stay excluded from estimated deductions without
changing the underlying business expense.

## Readiness and membership behavior

Both membership scopes recognize 2026 as a supported catalog year. Business readiness
evaluates supported income/expense records. Expenses readiness continues to exclude
income completeness from its promise and evaluates supported expense/deduction records.
Either scope can still be Needs attention, Still processing, or Incomplete for real
record, evidence, source, contractor, or unsupported-treatment reasons. Tax year 2027
does not fall back to 2026.

## Change safety and professional review

If an official source changes, create a new catalog/rule version, retain the prior
version and provenance, and reevaluate only affected outputs through the existing
correction architecture. Never silently rewrite historical rule meaning. These are
deterministic product rules, not individualized CPA, EA, attorney, or IRS review.

## Testing performed

Coverage pins 2025 and 2026 rule identities, exact year boundaries, 2027 fail-closed
behavior, missing/conflicting evidence, capital/inventory exclusions, readiness,
membership scoping, contractor threshold provenance, current-leaf resolution, and
historical determinism. Repository validation results are reported with the milestone
commit.
