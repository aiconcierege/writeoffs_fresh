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

### Release and checks

- Application commits: `9874a8b`, `b39088f` (the latter renews the request key after a successful completed-year save so a later correction can be submitted).
- Dedicated staging deployment: `dpl_A7PsnXeEABT7pdPHkUtVEUTb7oLJ`, project `prj_o56739F1pzd0TjFirEYoLMaa6oIJ`. Public alias verified Ready: https://writeoffs-fresh-staging.vercel.app. Vercel's `production` target here is only this dedicated staging project's approved primary slot.
- Full Vitest suite: **1,905 passed, 143 skipped**, 273 passing files. Skips are existing environment-dependent suites, not claimed as executed live database tests.
- Focused mileage/vehicle suite: **32 passed, 4 environment-dependent skipped**.
- TypeScript: pass. Optimized webpack builds: local pass; final Vercel build pass.
- Lint: no errors, 16 existing warnings. Gitleaks tracked-source scan: no leaks. `git diff --check`: pass.
- Existing unrelated Plaid audit/security files and unapproved Betti review assets were excluded. No migrations or provider configuration changes.

### Public browser verification

[Gallery](GALLERY.md) contains real dedicated staging screenshots at **390, 430, 1280 and 1440** pixels.

- All six authenticated pages were reviewed for coherence; the three locked compositions retain their existing structure.
- First-use Mileage and Invoices: no clipping or horizontal overflow. Vehicle radio controls work with the keyboard. Invoice optional details remain accessible.
- Transactions: normal mode has no checkboxes; keyboard Select reveals them; selected actions appear; Done selecting clears them. Dedicated checks at all four widths are in `screenshots/selection-behavior.json`. Search and date/filter controls retain existing GET behavior.
- Returning invoices: activity first, keyboard composer opening, existing unpaid invoice remains outside income. This run reused the previously created synthetic invoice; it does not claim another invoice was created. See `screenshots/invoice-behavior.json`.
- Real staging mileage: the synthetic vehicle was set to leased / actual costs through the existing UI. No current-year annual-total input appears; trip entry stays available. `screenshots/mileage-behavior.json` records the result, with separate captures of the opened vehicle decisions.
- Keyboard filters, native radio behavior, visible focus, reduced motion and 200% text scaling checked. No horizontal overflow at enlarged text. See both `accessibility.json` files. This is a focused browser/accessibility review, not an independent assistive-technology certification.
- Harness-only corrections: replaced an overly exact select locator, waited for the post-save refresh before opening the vehicle disclosure, and used instant scroll-to-top for full-page selection screenshots. No product delay or animation was added.

Preserved: transaction bookkeeping and history, invoice cash-receipt recognition, receipt matching, Plaid, tenant/MFA boundaries, mileage precision/rates/lease safeguards, Reports arithmetic and the persistent Check-in model. The only decision timing change is the expressly authorized final-annual-mileage deferral.

Rick's visual acceptance and the subsequent new-customer clean-room certification remain separate next steps.

### Populated trip verification

A 12.5-mile synthetic trip was saved through the real staging UI. The recorded trip and its purpose appeared in history and CSV export. All four populated-state captures passed overflow checks; see `screenshots/trip-behavior.json`. Final six-route capture: 24 renders, zero browser errors/overflow; separate first-use capture: 8 renders, zero browser errors/overflow.
