# Tax Rules v1 — approval proposal

Status: **seven Tier A rules approved and active for federal tax year 2025; all
other researched rules remain candidates**. Last verified: **2026-08-19**.
The initial research target is federal tax year **2025**, the latest completed tax
year for which the IRS has published the relevant filing-season instructions and
publications. The seven rules explicitly identified as active have product approval;
the remaining research is not legal approval, an active rule, or tax advice.

The executable production catalog contains only `tax.advertising`,
`tax.office-expense`, `tax.supplies`, `tax.postage-shipping`, `tax.software-cloud`,
`tax.payment-bank-fees`, and `tax.business-license`, each pinned to 2025 and version
1. Every Tier B, C, and D entry remains non-executable.

## ACTIVE 2025 TIER A

The seven approved rules execute only when business use, a plain-language business
purpose, the specific expense nature, and every rule-specific negative guardrail
are established with no conflicting evidence. They produce a full downstream tax-
preparation deduction for the exact canonical business allocation. Missing facts,
merchant-only evidence, Personal treatment, conflicting facts, and non-2025 dates
fail closed. Realtor context may strengthen factual evidence but never changes the
universal rule identity or evaluation path.

### Service/trade job materials and the v1 inventory boundary

WriteOffs v1 supports service and trade businesses that buy parts, materials, or
equipment for a specific customer job. Those purchases remain valid business
economic activity; they are not Personal and are not automatically “inventory.”
Their downstream tax/accounting treatment requires separate research and approval,
so they currently fail closed rather than entering `tax.supplies`.

The active Supplies rule is limited to genuine operating consumables. The factual
model records `supplyUseContext` as `operating_supply`, `specific_customer_job`, or
`held_for_future_sale`. The latter identifies merchandise or stock maintained for
future sale, whose ongoing inventory/COGS accounting remains outside v1. This is an
internal evidence distinction only; no customer question is added by this patch.
A later onboarding milestone must distinguish named-customer-job purchasing from
merchandise inventory without describing every contractor purchase as inventory.

Related documents:

- [Candidate catalog and safety matrix](TAX_RULES_V1_CATALOG.md)
- [Primary authority register](TAX_RULES_V1_AUTHORITIES.md)
- [Canonical bookkeeping architecture](CANONICAL_BOOKKEEPING_RECORDS.md)

## Approved architecture

### One product path

WriteOffs has one catalog, evaluator, question flow, reporting path, and customer
journey:

`source evidence → factual evidence → business-use determination → bookkeeping/P&L → tax-treatment evaluation → tax-preparation output`

Business profile is optional evidence in this path. Realtor context can strengthen
the interpretation of an MLS charge, lockbox, listing sign, photography, CRM, or
similar fact. It cannot choose another rule, catalog, workflow, or report. All rule
identities use `tax.*`; there are no General or Realtor rule namespaces.

### Bookkeeping is not tax treatment

Business and personal allocations describe economic use. A tax limitation is a
downstream adjustment and never changes the source amount, business allocation,
personal allocation, P&L expense, income, or bookkeeping profit.

- A $100 wholly business meal remains a $100 bookkeeping/P&L expense even if a
  later approved tax rule allows a smaller tax-preparation amount.
- A $100 mixed-use purchase with $70 business and $30 personal remains exactly
  $70 business and $30 personal. Any tax adjustment applies only downstream to
  the $70 business amount.
- A business-connected fine or entertainment expense can be economically business
  while having a proposed zero tax deduction. It must not be relabeled Personal.

### Ordinary and necessary is an evidence gate

Section 162 and the 2025 IRS guidance require a trade-or-business connection and
an ordinary and necessary expense. “Business” alone is not a universal deduction
rule. Before an ordinary operating candidate can be evaluated, WriteOffs needs:

1. a resolved economic nature;
2. explicit or otherwise approved support for business use (Personal is never
   inferred automatically);
3. a sufficiently specific business purpose or factual nature;
4. the economic date, amount, and business allocation;
5. absence of a known capital, inventory, reimbursement, personal, or special-rule
   conflict; and
6. the applicable tax year and active reviewed rule version.

For Supplies specifically, WriteOffs must also know the item is an operating
consumable. Specific-customer-job materials and goods held for future sale are
separate facts and do not receive an automatic Supplies conclusion.

Merchant recognition can support `merchantServiceType`; it cannot establish the
business purpose, absence of personal use, or deductible amount by itself.

## Candidate automation policy

- **Tier A — safe automatic candidate:** all material facts can be present in the
  canonical record, no election or annual/taxpayer calculation is needed, and a
  reviewed rule could reach a straightforward outcome. Tier A is not permission
  to activate.
- **Tier B — factual question required:** one or more plain factual answers are
  material before a conclusion. WriteOffs asks facts, never a Schedule C line or
  deduction percentage.
- **Tier C — special/annual calculation:** trip-, recipient-, asset-, vehicle-,
  election-, carryover-, basis-, or taxpayer-level calculation is required. A
  transaction may be flagged and prepared, but an ordinary transaction rule must
  not claim a deductible amount.
- **Tier D — manual/unsupported for v1:** the facts or legal/product boundary make
  automated treatment inappropriate. Preserve the economics and evidence; leave
  tax preparation unresolved unless a reviewed zero-deduction rule is later
  explicitly approved.

The matrix proposes 32 universal candidates: 7 Tier A, 15 Tier B, 7 Tier C, and
3 Tier D. These counts describe review priority, not executable coverage.

## Evidence, conflicts, and substantiation

Required facts are qualification inputs. Supporting records are substantiation;
they are related but not interchangeable. A receipt does not prove business purpose,
and a lost receipt does not rewrite bookkeeping or automatically disallow a tax
treatment. Travel, gifts, meals, and listed-property facts require heightened
records under section 274 and Publication 463.

When required facts are missing, the rule returns unresolved and may request the
minimum factual answer. When facts materially conflict, no rule wins by confidence
score: preserve both evidence streams, ask the simplest resolving question, or
remain unresolved. Multiple applicable rules also fail closed.

For an eventual conclusion, retain: source amount/date/description; current and
historical business-use decisions; exact allocations; purpose and relevant factual
answers; evidence/document history; rule key/version/year; authority identifiers;
qualification snapshot; calculation/adjustment; explanation; and correction chain.

## Question-contract findings

Existing contracts are sufficient for transaction nature, Business/Personal/Both,
exact mixed-use personal dollars, plain-language business purpose, Not sure, Do this
later, conflicts, and append-only corrections. They are enough for many Tier A
candidates once an approved factual interpretation exists.

Candidate contracts needing product/legal approval before relevant rules can run:

| Fact needed | Candidate plain-language question | Used by |
|---|---|---|
| Durable property | “Is this something you expect to use for more than one year?” | equipment, repairs |
| Placed in service | “When did you start using it for your business?” | depreciation, Section 179 |
| Legal/professional matter | “What was the professional help for?” | legal/professional |
| Insurance coverage | “What did this policy cover?” | insurance |
| Rent/equity | “Was this payment only for the right to use the property?” | rent/lease |
| Repair character | “Did this restore what you already had, or add/improve it?” | repairs/improvements |
| Trip context | “Was this trip overnight and away from your usual work area?” | travel |
| Trip details | “Where did you go, when, and what was the business purpose?” | travel |
| Meal context | “Who was present, and what was the business purpose?” | meals |
| Entertainment separation | “Were food and drinks purchased or listed separately?” | meals/entertainment |
| Gift recipient | “Who was this gift for, and what was the business reason?” | gifts |
| Education relationship | “Was this for your current work, or to qualify for a new kind of work?” | education |
| Government payment | “What tax, license, fee, fine, or penalty was this?” | taxes/licenses/fines |
| Reimbursement | “Were you reimbursed, or do you expect to be reimbursed?” | travel, meals, client costs |
| Business start | “When did this business begin operating?” | startup costs |

Vehicle method elections, home-office qualification/calculation, depreciation,
Section 179, recipient-year gift aggregation, and startup amortization are too
complex for a single transaction question. They remain Tier C even if some facts
are collected.

## Major-rule recommendations

- **Meals — Tier B:** for 2025, propose the ordinary qualified-meal rule only after
  taxpayer presence, business purpose/relationship, non-lavish character,
  entertainment separation, and reimbursement/exception facts are known. The
  common 50% limitation is downstream from the full bookkeeping business expense.
  Exceptions must be separate reviewed rules, never an inferred override.
- **Travel — Tier C:** a hotel or airline charge cannot decide travel treatment.
  Group expenses by trip and retain tax home, away-from-home status, destination,
  dates, business purpose, business/personal days, meal separation, reimbursement,
  and section 274 records. Defer the deductible calculation.
- **Entertainment — Tier D:** ordinary entertainment is a candidate zero tax
  outcome, while the economic business expense remains. Separately purchased or
  separately stated food may enter the meal rule. Statutory exceptions require a
  later reviewed contract.
- **Gifts — Tier C:** retain recipient, relationship, purpose, description, date,
  cost, incidental cost, and direct/indirect recipient. The 2025 $25 limit is per
  recipient per taxpayer-year, so no isolated transaction rule should calculate it.
- **Vehicle — Tier C:** preserve vehicle, placed-in-service, ownership/lease,
  contemporaneous trip purpose and mileage, total annual miles, commuting, business
  use, and method history. The optional 2025 standard rate is 70 cents per business
  mile, but method eligibility/elections and actual expenses require a vehicle-year
  engine. No gas/repair merchant shortcut is acceptable.
- **Home office — Tier C:** collect qualification, area, time period, method, and
  direct/indirect expense facts. The 2025 simplified method uses $5 per allowable
  square foot, generally capped at 300 square feet, but qualification, multiple
  uses, income limits, actual method, depreciation, and carryovers require an
  annual calculator.
- **Equipment, depreciation, and Section 179 — Tier C:** preserve basis, asset,
  dates, placed-in-service, business use, class, prior use, and disposition. The
  2025 de minimis safe harbor and Section 179 amounts are elections/annual rules,
  not a price-based universal expense rule. No candidate says “equipment is fully
  deductible.”
- **Startup costs — Tier C:** determine whether the cost fits section 195 and when
  the active business began. The 2025 framework includes a limited immediate amount,
  aggregate phaseout, election, and 180-month amortization; therefore a pre-revenue
  date alone proves nothing.
- **Education — Tier B:** ask whether education maintains or improves skills in the
  current business or is required to continue it, and whether it meets minimum
  requirements or qualifies the customer for a new trade/business. Merchant identity
  is never enough.

Clear nondeductible-but-business examples include ordinary business entertainment,
a governmental fine arising from business conduct, the disallowed portion of a
qualified business meal or gift, and a lobbying/political amount paid for a business
objective. Their economic business amounts remain in bookkeeping/P&L; only the
tax-preparation amount is zero or limited.

## Representative non-executable rule shape

This example is deliberately incomplete and **candidate**, so it cannot execute:

```ts
{
  key: 'tax.postage-shipping',
  version: 1,
  lifecycle: 'candidate',
  taxYears: { from: 2025, through: 2025 },
  taxCategoryKey: 'office-expense',
  automationLevel: 'safe_automatic',
  requiredFacts: ['transactionNature', 'businessPurpose', 'businessUseTreatment'],
  conditions: [
    { fact: 'transactionNature', operator: 'equals', value: 'expense' },
    { fact: 'businessUseTreatment', operator: 'equals', value: 'business' }
  ],
  outcome: { type: 'full_deduction' },
  explanationTemplate: 'WriteOffs identified shipping used for your business.',
  authorityReferences: [/* reviewed 2025 Schedule C instructions reference */],
  approval: null
}
```

Active rules record an official URL, concise support statement, verification date,
approval reference, tax year, and immutable rule version. Annual/special candidates
remain inactive and do not produce a transaction-level deductible amount.

## Explanation standard

Customer explanations should distinguish four ideas without tax jargon:

1. **What happened:** “This was a $100 business meal.”
2. **Why WriteOffs believes it:** “You said it was dinner with a prospective client.”
3. **Bookkeeping:** “The full $100 remains a business expense in your books.”
4. **Tax preparation:** “Federal rules may limit the amount used in tax preparation.”

If unresolved: “We have kept the expense in your books, but need one fact before
we can prepare its tax treatment.” Normal UI should not expose rule IDs, confidence,
Code citations, or internal adjustment machinery. CPA/support output may expose the
full amount, personal portion, proposed category, deductible amount, adjustment,
rule version/year, factual basis, answers, documentation status, unresolved facts,
corrections, and authority references.

## Fail-closed standard

No deduction may be produced when there is no active approved rule, the tax year is
unsupported, facts are missing or conflict, multiple incompatible rules apply, an
annual/taxpayer calculation is unavailable, business use is unresolved, the rule is
retired, authority/approval metadata is invalid, or evidence is below the rule's
approved threshold. The bookkeeping record and P&L remain intact.

## Product/legal approval gates

Before any additional v1 rule becomes active, Rick and qualified tax/legal review must approve:

1. the 2025 universal taxonomy and exact Schedule C mappings;
2. any change to the seven approved Tier A evidence thresholds or outcomes;
3. each Tier B question contract and whether unanswered items remain unresolved;
4. the standard meal rule, exceptions, reimbursement handling, and rounding;
5. the boundary between transaction travel and trip-level processing;
6. explicit zero-deduction rules for entertainment, government fines/penalties,
   political spending, and charitable payments without labeling them Personal;
7. which professional dues are eligible and how lobbying notices are represented;
8. which tangible-property safe harbors/elections, if any, WriteOffs will support;
9. that gifts, vehicles, home office, depreciation/Section 179, and startup costs
   remain special until separately approved calculators exist;
10. the authority-reference schema extension and verification/review workflow;
11. customer explanation language and incomplete-estimate disclosure; and
12. a per-rule activation PR containing an external authority, review reference,
    tests, and explicit effective year.

Estimated Deductions remains unavailable unless independently persisted trusted
treatments cover the relevant activity. Estimated Taxable Income remains unsupported.
