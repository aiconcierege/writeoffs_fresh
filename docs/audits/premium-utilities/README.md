# Premium utility correction — September 22, 2026

Scope: Transactions, Mileage and Invoices. Home, Check-in and Reports compositions, logo and right-side navigation are preserved. This is a visual review delivery, not clean-room product certification or final UX acceptance.

## Presentation

- Utility-only `premium-utility` styles: white surfaces, modest depth, blue active states, stronger field borders and selective green accents. Shared page primitive gains an optional eyebrow; existing callers keep their appearance.
- Transactions: composed intro, integrated search submit, Filters disclosure, one bright activity surface, stronger amounts and quieter status metadata. Explicit Select/Done selecting mode hides checkboxes until needed; leaving clears selection. Existing bulk operations, query parameters and details remain unchanged.
- Mileage first use: meaningful Betti setup introduction, white vehicle form and simple personal-use choice; no empty trip/export section or orphan cancellation. Returning layout retains trip entry left, vehicle decisions right and history below.
- Invoices: activity first for returning customers; white composer with Bill to, For, prominent Amount, When and optional details. Income recognition and payment behavior are unchanged.

## Annual mileage defect and authoritative basis

The stored total is **final annual all-purpose mileage**, not year-to-date mileage or an odometer reading. Existing reporting aggregates business trips for the calendar year and divides annual business miles by this denominator for mixed-use actual costs. A September answer cannot establish the final year's denominator. Missing facts already leave the tax calculation unresolved; they do not prevent recording trips or costs.

IRS [Publication 463](https://www.irs.gov/publications/p463), Car Expenses / Business and Personal Use, describes allocation of mixed-use operating expenses by business miles divided by total miles. Its recordkeeping guidance includes total miles for the year. [Topic 510](https://www.irs.gov/taxtopics/tc510) describes actual expenses attributable to business use, including lease payments. The [IRS vehicle-expense FAQ](https://www.irs.gov/faqs/small-business-self-employed-other-business/income-expenses/income-expenses-5) distinguishes standard mileage and actual expenses for leased vehicles. Sources reviewed September 22, 2026; Publication 463's current edition is 2025.

**Product timing decision:** defer the final annual-total question until that calendar year has ended throughout the U.S. This is our implementation of knowable facts, not an IRS-prescribed UI deadline.

Corrections:

- Vehicle assessment continues, but the worker does not open current/future annual-total questions.
- Existing premature annual questions are filtered from the customer-question projection; their history remains intact.
- Both answer endpoints reject current/future final totals.
- Mileage explains that yearly mileage will be finished after year-end. Completed prior actual-cost years have a factual follow-up and correction path.
- No rates, deduction formulas, lease safeguards, tax-method choices, transaction classifications, existing facts or schema changed. No estimated annual total or fabricated business percentage is introduced.

Focused coverage includes current/future years, year boundary, completed prior years, standard versus actual costs, leased actual-cost UI, API write rejection, and worker assessment preservation. Existing financial and mileage suites remain the calculation authority.

## Validation

Final staging evidence and checks are recorded below after deployment. Browser certification uses existing explicitly synthetic staging customers, real authentication/MFA, and live application routes. It does not use Rick's customer or Production.
