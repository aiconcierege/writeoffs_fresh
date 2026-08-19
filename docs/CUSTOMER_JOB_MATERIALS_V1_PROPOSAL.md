# Customer-job materials v1 — research and approval proposal

Status: **research and product specification only**. No tax rule, inventory system,
COGS workflow, customer question, schema, report calculation, or production behavior
is authorized or implemented by this document. Federal tax year researched: **2025**.
Primary authorities last verified: **2026-08-19**.

## 1. Executive recommendation

WriteOffs can continue to serve eligible cash-basis Schedule C service and trade
businesses that buy units, fixtures, parts, and materials for customer jobs without
becoming SKU or warehouse software. Federal law does not impose traditional
section 471(a) inventory accounting on every qualifying small business. Section
471(c) instead permits an eligible taxpayer to use one of two inventory methods:

1. treat inventory as section 471(c) non-incidental materials and supplies (NIMS),
   recovering cost no earlier than the later of payment/incurrence and provision of
   the item to the customer; or
2. follow the inventory method in an applicable financial statement or, without
   one, the taxpayer's genuine non-tax books and records prepared under its regular
   accounting procedures, subject to payment/incurrence and other Code limits.

That flexibility is an accounting-method choice, not a rule that “small businesses
do not have inventory.” WriteOffs must know which permissible method the taxpayer
uses before producing tax timing. It must also preserve that method consistently.

Recommended v1 product policy:

- preserve acquisition, business use, amount, and customer-job purpose immediately;
- call these costs **Customer job materials & parts** in customer bookkeeping;
- capture when the item was installed, delivered, or otherwise provided to the
  customer when tax timing may cross a year end;
- make no purchase-date tax deduction by default;
- use a hybrid classification: factual identification may be ordinary during the
  year, but tax timing is Tier C until an approved taxpayer-level inventory method
  and any required method-change handling are established;
- keep modest truck/shop stock eligible for WriteOffs when the business can maintain
  the minimal records required by its approved method; and
- continue excluding businesses whose operating model requires substantial ongoing
  merchandise inventory management that WriteOffs cannot faithfully record.

The distinction between `specific_customer_job` and `held_for_future_sale` is highly
useful product evidence, identification, and risk triage. It is not by itself the
legal timing rule. Under the NIMS method, both generally remain unrecovered until
provided to a customer and paid/incurred. Under a valid non-AFS books-and-records
method, the taxpayer's actual, consistently maintained non-tax book procedure can
produce a different timing result.

## 2. Fixed architecture boundaries

The canonical path remains one product path:

`source evidence → factual evidence → business use → bookkeeping/P&L → tax treatment → tax-preparation output`

Bookkeeping records what happened economically. Tax treatment applies the
taxpayer's approved method downstream. An unresolved tax year or Schedule C
placement must never relabel a valid business purchase as Personal.

The current three facts retain their meaning:

- `operating_supply`: an ordinary supply consumed in operating the business;
- `specific_customer_job`: a unit, part, fixture, or material acquired for use in
  or delivery through a known customer job; and
- `held_for_future_sale`: merchandise or stock acquired for later sale without a
  currently identified customer job.

The active 2025 `tax.supplies` rule remains limited to `operating_supply`. The other
two facts remain valid Business economics but receive no automatic tax conclusion.

## 3. Authoritative federal sources

The recommendations rely only on the following primary government sources. Short
summaries here do not replace the underlying authority or professional review.

| Authority | 2025 relevance | Point supported |
|---|---|---|
| [26 U.S.C. §471(c)](https://uscode.house.gov/view.xhtml?req=%28title%3A26+section%3A471+edition%3Aprelim%29) | Statute applicable to qualifying small businesses | Exemption from §471(a); NIMS and AFS/non-AFS book-method alternatives |
| [26 U.S.C. §448(c)](https://uscode.house.gov/view.xhtml?req=%28title%3A26+section%3A448+edition%3Aprelim%29) | Gross-receipts test and aggregation rules | Three-prior-year average, short-year/new-business rules, controlled-group aggregation |
| [Treasury Decision 9942 / final §1.471-1 regulations](https://www.irs.gov/pub/irs-drop/td-9942.pdf) | Final rules effective for years beginning on/after January 5, 2021 | NIMS timing, “provided to customer,” non-AFS books method, examples, consistency and method changes |
| [2025 Instructions for Schedule C](https://www.irs.gov/instructions/i1040sc) | Filing-season instructions | $31 million threshold, two §471(c) alternatives, Part III and Line 22 presentation, Form 3115 warning |
| [Revenue Procedure 2024-40](https://www.irs.gov/pub/irs-drop/rp-24-40.pdf) | 2025 inflation adjustment | $31 million §448(c) threshold for tax years beginning in 2025 |
| [Revenue Procedure 2025-23](https://www.irs.gov/pub/irs-drop/rp-25-23.pdf) | Current method-change procedures reviewed | Automatic-change procedures including §471(c) methods; implementation requires current-procedure review |
| [Publication 334 (2025)](https://www.irs.gov/publications/p334) | Schedule C small-business guide | Goods/COGS framework and application when a service business also sells or charges for materials |
| [Publication 538](https://www.irs.gov/publications/p538) | Accounting-method overview; currently available revision is older | Inventory definitions, consistency, and method-change principles; its stale dollar threshold is not used for 2025 |
| [IRS tangible-property final-regulations guide](https://www.irs.gov/businesses/small-businesses-self-employed/tangible-property-final-regulations) | Distinguishes ordinary materials from capital property | Non-incidental use/consumption timing and capitalization boundaries |
| [Publication 583 (12/2024)](https://www.irs.gov/publications/p583) | Recordkeeping guidance | Source documents, electronic books, inventory records, and auditability |
| [IRS automated-records guidance](https://www.irs.gov/businesses/automated-records) | Electronic books and records | Machine-sensible accounting data are retained §6001 records |

Publication 538's currently accessible revision describes an older inflation-adjusted
threshold. For 2025, this proposal uses the $31 million amount in Revenue Procedure
2024-40 and the 2025 Schedule C instructions.

## 4. The 2025 small-business inventory exception

For a tax year beginning in 2025, a taxpayer is a section 471(c) small business
taxpayer only if:

- average annual gross receipts for the three preceding tax years do not exceed
  **$31 million**;
- the taxpayer is not a tax shelter prohibited from using the cash method under
  section 448(a)(3)/448(d)(3); and
- the gross-receipts test is computed under section 448(c), including predecessor,
  short-year, and aggregation rules.

The three-year average uses the period the business existed if shorter than three
years; short tax years are annualized. Section 471(c)(3) applies the test to a sole
proprietor's trades or businesses as though each were a corporation or partnership.
Entities treated as a single employer under sections 52(a)/(b) or 414(m)/(o) are
aggregated. A Schedule C sole proprietor can qualify, but “sole proprietor” alone
does not establish qualification. WriteOffs cannot determine eligibility from one
bank account or one Schedule C in isolation where related entities, predecessor
activity, tax-shelter status, or prior receipts matter.

Qualification removes the mandatory section 471(a) inventory method and generally
supports the cash-method exception; it does not erase the goods, make all purchases
currently deductible, or waive other Code restrictions. The taxpayer must use a
permitted inventory method that clearly reflects income.

## 5. The two permitted section 471(c) paths

### 5.1 Non-incidental materials and supplies

Under final regulation §1.471-1(b)(4), inventory treated as section 471(c) NIMS is
recovered through cost of goods sold in the later of:

- the tax year in which the taxpayer actually uses or consumes the inventory—defined
  for these inventory items as the year the taxpayer **provides the item to the
  customer**; or
- the tax year in which the taxpayer pays or incurs the cost under its overall
  accounting method.

The taxpayer must identify costs by specific identification or another reasonable
method. These items are not eligible for the tangible-property de minimis safe harbor
merely because they are called materials and supplies.

For a cash-method taxpayer that already paid, acquisition alone is not enough under
this method. Installation, delivery, transfer, or another event that provides the
item to the customer is the controlling use/consumption event. The exact contractual
moment may require facts; “job completed” is useful evidence but is not a universal
statutory phrase.

### 5.2 Non-AFS books-and-records method

A qualifying taxpayer without an applicable financial statement may instead recover
inventory costs according to the method used in books and records that:

- properly reflect the taxpayer's business activities for non-federal-tax purposes;
- are prepared under the taxpayer's accounting procedures; and
- are actually used consistently.

The final regulations deliberately allow substantial simplicity. One example permits
a cash-method reseller whose regular books do not allocate paid costs between ending
inventory and cost of goods sold to deduct paid inventory costs in that year. But the
permission is factual, not cosmetic: another example rejects immediate expensing
where physical counts and inventory representations used in ordinary business show
that the books actually track ending inventory. A further example requires a point-
of-sale cost ledger reconciled to physical counts to determine ending inventory.

The method cannot recover a cost before it is paid/incurred under the taxpayer's
overall method and cannot make a nondeductible or otherwise unrecoverable amount
deductible. Other Code rules still apply. Inconsistent treatment may fail clear
reflection of income.

WriteOffs could form part of a taxpayer's electronic books and records if it is the
real, sufficiently detailed, retained, reproducible system used for non-tax business
accounting and reconciles to source documents. Merely naming WriteOffs the “books”
or configuring it solely to obtain a tax result is not enough. Before product
activation, a qualified reviewer must approve the exact book procedure, required
records, eligibility evidence, and method-adoption/change path.

## 6. Cash method and immediate-expense conclusion

Cash method answers when a paid cost can be taken into account; it does not by
itself decide whether an item is recoverable inventory cost in that year.

- Under section 471(c) NIMS, paid December inventory provided in January is generally
  recovered in January's tax year—the later event.
- Under a valid non-AFS books method that consistently expenses paid inventory costs
  and does not maintain contradictory cost inventory records, purchase-year recovery
  may be permissible, as shown by the final regulation's reseller example.
- If actual non-tax records capitalize or track ending inventory costs, WriteOffs
  cannot ignore those records and assert purchase-date expensing.
- A taxpayer changing to or within either method may require Commissioner consent,
  Form 3115, and a section 481(a) adjustment.

Therefore a universal WriteOffs rule that deducts every paid customer-job purchase
on its purchase date is **not defensible**. Purchase-date treatment could become an
approved taxpayer-method result only after eligibility and method facts are resolved.

## 7. Specific customer job versus future stock

Federal authority does not make “known customer” the statutory switch between
deductible expense and inventory. A unit bought for Smith and an identical unit held
for a later customer can both be inventory items. Under NIMS, each is recovered when
paid/incurred and provided to its customer, whichever is later.

The factual distinction still has product value:

- it supports specific identification and the intended customer/business purpose;
- it makes the eventual provided/installed date easier to capture;
- it distinguishes project purchasing from a retailer/reseller operating model;
- it reduces—but does not eliminate—year-end unused-material ambiguity; and
- it supports a practical eligibility boundary without mislabeling every trade
  purchase as unsupported inventory.

Examples such as an AC unit installed in a house, plumbing fixtures delivered through
a remodel, electrical components incorporated into an installation, lumber used on
a named project, paint applied on a job, landscaping materials installed, and repair
parts transferred to a vehicle all fit the same factual pattern. Their exact legal
classification and timing still depend on the taxpayer's approved method and facts.

## 8. Year-end timing examples

The following table separates the two permitted methods. It assumes a calendar-year,
cash-method, eligible small business taxpayer; payment on December 28; no conflicting
capitalization rule; and an item that is inventory in the taxpayer's hands.

| Facts | Section 471(c) NIMS | Approved non-AFS books method |
|---|---|---|
| Installed/provided Dec. 30, 2025 | 2025: both payment and provision occurred | Follows the actual consistent books, no earlier than payment |
| Installed/provided Jan. 5, 2026 | 2026: provision is later | Follows the actual consistent books; may differ from NIMS |
| Bought for a named January job, still unused Dec. 31 | 2026 or later when provided | Follows the actual consistent books; named job alone does not decide timing |
| No customer identified at Dec. 31 | Later year when provided | Follows actual books; larger stock increases recordkeeping/product risk |
| Left unused in truck/shop at Dec. 31 | Later year when provided | Follows actual books and any inventory records actually maintained |

The non-AFS column cannot be converted into a generic date formula. Its point is
conformity to a genuine accounting procedure. If WriteOffs eventually supports it,
the product must pin the taxpayer's approved method and retain the evidence that the
method is consistently used.

## 9. Incidental working stock in a truck or shop

A box of fittings, connectors, screws, or similar working stock does not, by itself,
force a business into traditional SKU/quantity-on-hand inventory accounting. An
eligible taxpayer can use section 471(c), including NIMS or an approved non-AFS books
method. Under NIMS, however, modest stock is not automatically deducted on purchase;
its cost is generally recovered when provided to customers and paid/incurred.

Practical v1 support is possible when the business can use a reasonable cost-
identification convention and can record enough usage/provision information for its
approved method without item-level warehouse operations. Possible later policy
could support batched job-use records or a documented reasonable allocation method.
That policy requires CPA/tax approval; this proposal does not select it.

The boundary becomes unsafe when the business maintains substantial merchandise for
future sale and relies on purchasing, inventory levels, physical counts, cost layers,
shrinkage, or item margins that WriteOffs cannot faithfully reproduce. The boundary
is about the actual operating/recordkeeping model, not the mere existence of spare
parts.

## 10. Durable property for the customer versus for the business

Price and durability do not answer who owns or uses the item after the job:

- a $3,500 AC unit bought to be transferred and installed in Smith's house is a
  customer-job item in the contractor's hands; and
- a $3,500 diagnostic machine retained and used by the contractor for five years is
  business-owned durable property that may require capitalization/depreciation.

WriteOffs eventually needs the factual distinction: **Will your business keep and
use this item after the job, or will it be installed/delivered for the customer?**
Useful-life/placed-in-service facts matter for business-retained equipment. A dollar
threshold must not substitute for ownership and intended-use evidence.

## 11. Bookkeeping and P&L recommendation

Customer-friendly economic category: **Customer job materials & parts**. “Direct job
cost” may be useful internally, but “COGS” and “inventory” should not be required
customer vocabulary.

The cost is a valid Business economic amount and must not become Personal while tax
treatment is unresolved. A P&L that shows customer-job costs separately from overhead
is useful and makes the example transparent:

- Business income: $150,000
- Customer job materials & parts: $42,000
- Other business expenses: $38,000
- Business profit: $70,000

There is an important timing caveat. Immediate purchase-date display is defensible as
a cash-spend management view, and may match a taxpayer's approved non-AFS books method.
It is not always an economically matched accrual-style P&L and does not necessarily
match NIMS tax timing. If a material unit remains unused at period end, treating it as
the period's completed-job cost can distort profit.

Recommended future refinement is to retain both acquisition and use/provision dates,
then label reports clearly:

- a cash activity view can show paid business purchases;
- an economic job-cost/P&L view should recognize customer-job cost according to the
  approved bookkeeping policy; and
- tax preparation follows the separately approved section 471(c) method.

Rick must approve the desired management-P&L timing with accounting review before
implementation. No current report calculation changes in this milestone.

## 12. Schedule C presentation

Customer P&L labels need not equal tax form lines. Publication 334 says its COGS
chapter applies when a service business also sells or charges for materials normally
used in the business. Schedule C Part III provides purchases, labor, materials and
supplies, other costs, ending inventory, and cost of goods sold; COGS flows to line 4.

Under a traditional inventory or NIMS method, customer-job goods are generally
recovered through COGS/Part III rather than being forced into Line 22 operating
supplies. Under a permissible non-AFS section 471(c) books method, the exact return
presentation must follow that approved method and current filing instructions. The
small-business exception changes how inventory is accounted for; it does not create
authority to place every job purchase on Schedule C Line 22.

WriteOffs should retain a stable customer category and map it downstream only after
the taxpayer method is established. Schedule C placement remains unresolved in the
canonical tax layer until that point.

## 13. Billing, reimbursement, markup, and customer agency

Separately stating materials, embedding them in one job price, or adding a markup
does not by itself change section 471(c) cost timing. It is useful evidence that the
business sells or charges for materials and that the item was provided to a customer.
The contractor generally records the full amount it receives as business gross
receipts and separately recovers its material cost under its method; netting an exact
reimbursement against cost should not be assumed.

A genuine purchase made as the customer's agent could have a different result, but
“reimbursement” on an invoice does not establish agency. Agency requires legal and
contract facts beyond the proposed v1 flow and should fail closed for separate review.

Minimum product distinction: ask whether the item was installed/delivered as part of
the job. Separate-billing and markup questions are not recommended unless later
review shows they change a supported calculation or help resolve agency.

## 14. Sales-tax boundary

Sales or use tax paid to acquire a job item is generally part of its acquisition cost
under the taxpayer's inventory-cost method. Sales tax collected from customers can
raise separate gross-receipts/liability and state-law questions. Transaction privilege
tax can differ by jurisdiction and legal incidence.

WriteOffs should preserve taxes paid on source documents and amounts collected, but
this proposal does not decide state sales-tax compliance. Any amount identified as
collected tax or agency payment must not be silently netted or classified without a
separate reviewed policy.

## 15. Minimum factual experience

“Was this purchased for a specific customer job?” is useful, but not sufficient by
itself to establish tax timing. The minimum eventual factual set is:

1. **Use context:** operating supply, known customer job, held for later sale, or
   Not sure.
2. **Ownership/use after the job:** installed/delivered for the customer versus kept
   and used by the business.
3. **Provided date when year-relevant:** when it was installed, delivered, or
   otherwise provided to the customer.
4. **Taxpayer method eligibility and identity:** handled at business/tax-year level,
   not asked transaction by transaction.

Optional customer/job reference improves evidence and specific identification, but a
customer name should not be mandatory if purpose and provision can be established.
Separate billing, markup, and exact reimbursement should not be asked routinely.

Candidate plain-language questions for later product approval:

- “Was this purchased for a specific customer job?” — Yes / No / Not sure.
- If No: “Was it a supply used to run your business, or something kept to sell to a
  future customer?”
- “Will your business keep using this item after the job, or will it be installed or
  delivered for the customer?”
- Where timing matters: “When was it installed or delivered for the customer?”

These are proposals only. No customer question is implemented or approved here.

## 16. Product eligibility boundary and onboarding proposal

The desired boundary is legally and operationally workable if it is described as a
product capability boundary, not a claim that job-specific goods are never inventory.

Recommended plain-language onboarding copy:

> WriteOffs supports service businesses and trades that buy parts or materials for
> customer jobs, including a modest amount of common truck or shop stock. It is not
> yet designed for businesses that primarily keep substantial merchandise or products
> in stock to sell later.

Candidate factual eligibility question:

> Does your business primarily keep substantial merchandise or products in stock to
> sell to future customers?

Answers should include Yes / No / Not sure and provide a supported handoff—not label
every Yes response as legally ineligible for section 471(c). A sophisticated small
reseller might qualify legally but remain outside WriteOffs v1 because its actual
inventory records exceed product capabilities.

HVAC, plumbing, electrical, handyman, landscaping, painting, appliance installation,
automotive repair, and similar service businesses remain viable v1 customers when
their records and selected method fit these capabilities.

## 17. Accounting-method and change implications

Treatment of inventory under section 471(c) is a method of accounting. Final
regulation §1.471-1(b)(8) states that changing the inventory method—including changing
the method used in non-AFS books when it affects federal tax—is a method change under
sections 446 and 481 requiring Commissioner consent. Current administrative guidance
provides automatic-change procedures for certain eligible changes, commonly involving
Form 3115 and potentially a section 481(a) adjustment.

WriteOffs must not silently select or change a taxpayer's method. Before activation,
the product needs a reviewed method policy that covers:

- qualifying-small-business evidence;
- NIMS versus non-AFS books method;
- effective tax year and consistency;
- existing inventory/cost records used for non-tax purposes;
- prior-return treatment and opening unrecovered costs;
- Form 3115/section 481(a) escalation; and
- loss of small-business eligibility in a later year.

The exact procedural revenue procedure must be reverified for the year of change.

## 18. New business versus existing WriteOffs customer

A brand-new business with no established inventory method has greater prospective
flexibility, but it still must adopt a permissible, consistent method and retain the
facts that support it. WriteOffs should not claim that mere signup is the election.

An existing business switching to WriteOffs may already have a method evidenced by
prior returns, tax workpapers, ledgers, physical counts, point-of-sale records, or
representations to lenders. WriteOffs cannot overwrite those facts during import.
Until the prior method and any required change are resolved:

- preserve customer-job economic records and documents;
- keep federal timing and Schedule C grouping unresolved;
- exclude the amount from supported Estimated Deductions where completeness rules
  require; and
- route the method question to a qualified tax professional rather than fabricate
  historical catch-up.

## 19. Proposed canonical representation (not implemented)

Use the existing source transaction/document, Business allocation, and append-only
decision history. Add concepts only when approved and necessary:

| Concept | Recommendation |
|---|---|
| Economic nature | Reuse `specific_customer_job`; do not call it Personal or operating supply |
| Ownership destination | Needed: transferred/installed for customer vs retained by business |
| Customer/job reference | Optional evidence; avoid requiring invoice-item matching |
| Acquisition/payment date | Existing immutable source fact where available |
| Provided/installed/delivered date | Needed for NIMS timing, especially across year end |
| Unused at year end | Derivable from absence of provision plus explicit pending state; retain uncertainty |
| Taxpayer inventory method | Business- and tax-year-scoped reviewed setting, not a transaction answer |
| Method provenance | Prior-return/professional/system source, effective year, approval, version |
| Cost identity | Exact cents and reasonable identification method; no mandatory SKU/quantity model |
| Tax conclusion | Append-only, rule/year/method pinned; separate from bookkeeping allocation |

Do not require payment method, item SKU, quantity on hand, warehouse, customer invoice
matching, or a traditional inventory ledger unless a future approved method genuinely
needs them.

## 20. Automation recommendation and fail-closed contract

Recommended classification: **hybrid Tier B/Tier C**.

- Tier B factual identification can distinguish operating supply, customer-job item,
  future-sale stock, and business-retained equipment.
- Tax timing is Tier C until the business-level section 471(c) method, eligibility,
  consistency, and method-change status are established.
- Once an approved NIMS method exists, a later rule could deterministically use exact
  payment/incurrence and provided-to-customer dates.
- A reviewed non-AFS books method needs its own business-level policy and audit trail;
  it cannot be inferred transaction by transaction.

Fail closed whenever eligibility, method, ownership destination, use/provision date,
prior method, or conflicting records are material and unresolved. Fail-closed means:

- retain the full source amount and Business allocation;
- retain customer-job purpose and evidence;
- keep the item visible as Customer job materials & parts;
- do not mark it Personal, operating supplies, or future-sale inventory without facts;
- do not create COGS, a deduction amount, or Schedule C placement;
- do not include it through `tax.supplies` or another Tier A shortcut; and
- preserve it for later factual completion or qualified review.

## 21. Product/legal decisions required before implementation

Rick/product and qualified tax/accounting counsel must explicitly approve:

1. the v1 supported method: NIMS, a specified non-AFS books method, or both;
2. the exact eligibility evidence for the $31 million/tax-shelter/aggregation tests;
3. the management-P&L timing policy for acquired but unused customer-job items;
4. whether “Customer job materials & parts” is the approved customer label;
5. the minimum method-level onboarding/catch-up questions and professional handoff;
6. the proposed factual questions and when the provided date is required;
7. a reasonable cost-identification method for modest commingled truck/shop stock;
8. the point where inventory complexity makes a business operationally outside v1;
9. Schedule C mapping under each supported method;
10. treatment of exact reimbursements and possible customer-agency arrangements;
11. sales/use/transaction-privilege-tax data boundaries;
12. Form 3115 and section 481(a) workflow for existing businesses;
13. handling when a taxpayer loses small-business eligibility; and
14. authoritative tax-year rule metadata and reviewer sign-off before activation.

## 22. Explicit implementation recommendation

Do not activate a customer-job-material tax rule yet. The next authorized
implementation should begin only after the decisions above, and should be narrower
than an inventory product:

1. add the approved factual distinction and provision date to the canonical evidence
   model/question flow;
2. add a business/tax-year accounting-method state with professional provenance;
3. preserve customer-job costs in bookkeeping without changing Personal allocation;
4. implement the chosen method's tax timing as a new versioned, fail-closed rule;
5. map the resulting tax amount to Schedule C preparation separately from the
   customer P&L category; and
6. add year-end, retry, correction, tenant-isolation, and method-change guard tests.

No step should add SKU, quantity-on-hand, warehouse, or invoice-line matching unless
later evidence proves it necessary. No production behavior changes in this research
milestone.
