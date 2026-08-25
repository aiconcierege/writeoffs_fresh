# WriteOffs Membership Architecture

Status: canonical product specification. Implemented by the additive Business-owned membership authority; operational details are in [STRIPE_MEMBERSHIP_OPERATIONS.md](./STRIPE_MEMBERSHIP_OPERATIONS.md).

This document defines what WriteOffs promises before Stripe is allowed to define billing behavior. It does not activate billing, gate routes, alter canonical records, or set final prices.

## A. Product philosophy

WriteOffs is purpose-built for U.S. Schedule C solopreneurs with relatively simple cash-basis business activity. Memberships differ by the job WriteOffs accepts responsibility for, not by artificial limits on ordinary bookkeeping work.

All memberships use one canonical source, bookkeeping, correction, convergence, question, tax-treatment, and reporting architecture. A membership changes available actions, ongoing automation, presentation, and completeness claims. It never changes historical financial truth.

Legitimate usage is generous. Do not differentiate plans by receipt, transaction, statement, OCR, AI-token, mileage, or ordinary storage quotas. Infrastructure may apply invisible security, concurrency, file-safety, retry, and abuse controls.

WriteOffs does not promise payroll accounting, inventory accounting, full accounts payable, a full accounts-receivable subledger, accrual accounting, entity accounting, partnership or S-corporation books, a general ledger, or tax filing. Avoid “complete bookkeeping,” “full bookkeeping,” and “complete books.”

## B. WriteOffs Expenses

Name: **WriteOffs Expenses**

Descriptor: **Expenses, deductions and documentation.**

Long description: **Keep your business expenses, deductions and supporting records organized.**

Expenses accepts responsibility for supported business spending, deductions, mileage, documentation, and related tax-time records. It does not accept responsibility for complete business income records.

Inbound observations may still be retained when connected accounts, statements, or CSVs contain them. The canonical engine needs those facts for refunds, transfers, card payments, duplicate prevention, reconciliation, and source integrity. Retention is not an income-completeness promise.

## C. WriteOffs Business

Name: **WriteOffs Business**

Descriptor: **Income, expenses and tax-ready business records.**

Long description: **Keep your cash-basis business income, expenses and supporting records organized for tax time.**

Business accepts responsibility for supported cash-basis Schedule C income and expenses, supporting records, invoices, and broader tax-time readiness. “Tax-ready” means organized based on the facts currently in WriteOffs. It is not tax filing, professional certification, or a guarantee that a return is complete or correct.

## D. Exact capability matrix

| Capability | Expenses | Business | Notes |
| --- | --- | --- | --- |
| Canonical expense organization | Included | Included | Same engine and current-record resolution. |
| Active income organization | Not promised | Included | Expenses retains necessary inflow observations without pursuing income completeness. |
| Plaid connections | Included, configurable limit | Included, configurable limit | Plaid remains Sandbox-only until separately approved. |
| Statement upload | Included | Included | No ordinary customer quota. |
| CSV import | Included | Included | First-class alternative to Plaid. |
| Receipt upload, extraction, matching, receipt-only expenses | Included | Included | Same low-friction workflow. |
| Manual money spent | Included | Included | Includes owner-paid business expenses. |
| Manual money received | Not an active customer workflow | Included | Historical entries remain readable after downgrade. |
| Mileage | Included | Included | No arbitrary mileage quota. |
| Deduction intelligence and reusable shared-use facts | Included | Included | No stripped-down tax engine. |
| Home-workspace factual profile | Included | Included | Eligibility and treatment remain fail-closed. |
| Equipment/special-treatment awareness | Included | Included | No asset-management promise. |
| Documentation tracking | Included | Included | Missing evidence does not automatically make an expense personal. |
| Contractor/W-9/1099 awareness | Included | Included | Expense documentation; never payroll, AP, or filing. |
| Invoice creation and management | Excluded | Included | Historical invoices are readable after downgrade/expiry. |
| Invoice payment linkage | Historical/read-only only | Included | Invoice issuance never creates cash-basis income. |
| Expense Schedule C categories | Included | Included | Same tax-treatment engine. |
| Expense tax package | Included | Included | Expenses package explicitly excludes an income-completeness claim. |
| Business tax package | Excluded | Included | Within supported WriteOffs scope only. |
| Estimated business profit | Excluded | Included | Do not compute or present as complete for Expenses. |
| Customer question queue | Included | Included | Scope controls which completeness questions are generated. |
| Security, account settings, export, correction history | Included | Included | Security is not a premium feature. |
| Historical export after membership | Included | Included | Delivered through expired read-only mode. |

## E. Explicit exclusions

Neither membership includes payroll, employee accounting, inventory, procurement, purchase orders, full AP, full AR, collections, recurring billing, payment processing, accrual accounting, trial balances, general-ledger management, complex entity books, tax-return filing, 1099 filing, or guaranteed tax outcomes.

Business invoices are a bounded billing artifact and cash-payment context, not a general AR system. Contractor awareness is bounded tax-time expense context, not vendor management or payroll.

## F. Connected-source entitlement

### Recommended counting unit

Count active **Plaid Items**, presented to customers as connected financial institutions or “connections.” Do not count each account returned by one Link connection.

One Chase login may expose checking, savings, and a credit card. Customers naturally understand that as one Chase connection; charging three entitlement units would be surprising and would make institution account topology—not customer intent—determine plan fit.

The current schema already supports this cleanly:

- `plaid_items` represents a provider connection/Item.
- `plaid_account_sources` maps one Item to one or more provider accounts.
- `financial_accounts` remains the provider-neutral account identity.

Count current Plaid Items whose consent is active and whose connection is not disconnected. A reconnect/update of the same Item does not consume another unit. A fully disconnected Item stops counting, while its historical observations remain.

CSV imports, statement accounts, and manual sources do not consume a Plaid-connection entitlement. They remain first-class alternatives and should not be disguised paid-tier penalties.

### Working limits

- Expenses: `3` active Plaid connections.
- Business: `8` active Plaid connections.

These are working launch hypotheses, not price logic. Store them in a versioned server-owned entitlement catalog so they can change after Plaid Production economics are known. Never scatter 3/8 literals through routes.

If Production Plaid economics ultimately price materially by linked account rather than Item, revisit commercial limits explicitly. Do not silently change the customer counting unit.

## G. Contractor decision

Contractor/W-9/1099 awareness belongs in **Expenses and Business**.

Contractor compensation is fundamentally spending and supporting tax-time documentation. A customer who hires subcontractors may need W-9 status, payment-method provenance, cumulative expense totals, and conservative information-reporting attention without asking WriteOffs to maintain complete income records.

Both plans retain the existing conservative vocabulary: Tracking, W-9 needed, Information incomplete, Potential 1099 attention, and No current action. Neither plan promises filing, definitive threshold-only conclusions, vendor management, AP, or payroll.

## H. Reporting and readiness

Use one reporting engine with a membership scope parameter. Do not fork queries or store competing totals.

### Expenses

Home and Reports emphasize current business expenses, expense categories, estimated supported deductions, mileage, documentation, contractor expense context, and expense-related attention.

Tax-time language is scoped:

- Expense records ready
- Expense records need attention
- Expense records still processing
- Expense records incomplete

The package includes expense transactions, Schedule C expense categories, mileage, contractor information, receipt/documentation status, deduction facts, and unresolved expense/tax-treatment items. It must plainly say: **Income is not tracked as part of this membership.**

Do not show complete business income, estimated business profit, full profit/loss, or full-business readiness. Observed inflows can remain visible as source history when needed for integrity, but must not become a completeness claim or recurring income-review burden.

### Business

Home and Reports may show supported business income, business expenses, estimated business profit, invoices, deduction context, and broader Schedule C readiness.

Tax-time readiness may evaluate supported income and expense completeness, documentation, mileage, contractor context, invoices/payment integrity, and unresolved tax treatments. It remains “ready for tax preparation,” not “tax return complete.”

### Questions

Both plans use the existing single live question queue. Expenses suppresses questions whose only purpose is achieving complete income records. Questions required for transfer, refund, card-payment, duplicate, or expense integrity remain legitimate. Business can generate the broader supported income questions.

## I. Home and product presentation

Expenses Home tells an expense-and-deduction story: expenses, documentation/deductions, mileage where useful, and current attention. It must not display a misleading incomplete-profit narrative.

Business Home may tell the existing income → expenses → estimated profit narrative, followed by deduction and tax context.

Plan-aware composition belongs in shared presentation selectors, not duplicated pages. The existing design system and navigation remain authoritative.

## J. Upgrade: Expenses to Business

An upgrade takes effect immediately after the future billing authority confirms it.

- Enable Business capabilities and broader reporting/readiness.
- Preserve all expenses and decisions unchanged.
- Enable manual money received and invoice workflows.
- Do not re-import sources or create duplicate canonical activity.
- Reevaluate current, non-superseded inbound source observations from the current supported tax year for Business income processing.
- Reuse existing source fingerprints, records, decisions, and convergence identities.
- Preserve unresolved treatment and ask factual questions where prior inflows require customer judgment.
- Do not silently reinterpret transfers, refunds, card payments, or ambiguous deposits as income.

At launch, automatic scope expansion should be bounded to the current tax year. Older years can be explicitly reprocessed later after product and cost policy is decided.

## K. Downgrade: Business to Expenses

A requested downgrade becomes effective at the end of the current paid billing period. Paid Business access continues until then.

At effectiveness:

- Stop new invoice creation/management and manual money received.
- Stop ongoing income-completeness automation and income-only questions.
- Switch Home, Reports, and readiness to Expenses scope.
- Preserve and allow reading/exporting historical income, invoices, payment links, contractor records, reports, source observations, tax history, and provenance.
- Keep invoice issuance from affecting income; preserve existing valid payment linkage.
- Continue retaining inbound source observations needed for reconciliation and canonical integrity without promising ongoing income completeness.
- Do not delete, rewrite, reverse, or relabel established financial history merely because the plan changed.

Historical Business data is read-only where the current Expenses plan does not offer the corresponding active workflow. Expense corrections and current expense workflows remain available while Expenses is active.

## L. Cancellation

Canonical policy:

- Memberships are month-to-month.
- Customers may cancel at any time.
- Cancellation stops renewal.
- No prorated or partial-month refunds.
- Paid features continue through the current paid period.
- Lifecycle becomes `canceling` until `access_through`.
- After the paid period, lifecycle becomes `expired_read_only`.

Cancellation is not destructive and does not alter canonical bookkeeping history.

## M. Failed payment and grace period

Recommend a configurable **7-calendar-day grace period** after a failed renewal. Future Stripe Billing should own retry scheduling and payment-event authority; WriteOffs owns product access projection.

During `payment_issue` grace:

- Keep the paid plan’s ordinary functionality available.
- Show one restrained, actionable billing notice.
- Allow payment-method correction through the future Customer Portal.
- Do not repeatedly nag or immediately disable background work after one failed attempt.

If Stripe confirms recovery, return to `active` without data changes. If the grace deadline passes without paid entitlement, transition to `expired_read_only`. Grace duration must be configuration, not route logic.

## N. Read-only historical mode

`expired_read_only` is a distinct product experience, not the active app covered in disabled buttons.

Retained access:

- Historical Transactions and source context
- Receipts/documents and downloads
- Mileage history and exports
- Invoice history and printable artifacts when applicable
- Contractor history and exports when applicable
- Historical reports and tax-time packages already supported/processed
- General data export
- Account/security controls needed for identity, data portability, and deletion requests

Disabled ongoing work:

- New Plaid connections or reconnect-driven ingestion
- New CSV/statement/receipt intake or processing
- New mileage or manual money
- New invoices or contractor activity
- New autonomous bookkeeping, OCR, AI, rematching, and newly generated ongoing questions

Read-only mode must have a clear historical-records landing page and a path to reactivate. Downloads must remain direct and understandable.

## O. Data portability

Former customers may export historical data, download their documents and invoice artifacts, and request account/data deletion subject to the separately approved retention and deletion policy. Do not require reactivation to retrieve customer records.

Security settings and authentication remain available. Read-only mode does not weaken tenant isolation or expose service credentials.

## P. Billing cadence

Launch with **monthly billing only**.

Monthly-only matches the stated cancel-anytime promise, avoids annual refund and period-change complexity, and lets pricing respond to measured Plaid/OCR/AI economics. Do not introduce annual prepayment merely because it is common SaaS practice.

Annual billing can be reconsidered after unit economics and retention are established, with explicit refund and downgrade policies first.

## Q. Pricing assumptions and independence

Working hypotheses:

- WriteOffs Expenses: approximately `$19/month`.
- WriteOffs Business: approximately `$29/month`.

These are not final and must not appear in entitlement logic. Final pricing follows Plaid Production economics, measured OCR/AI costs, Stripe fees, and positioning review.

Future Stripe Price IDs map server-side to an internal plan/cadence catalog. A browser never submits an authoritative price, plan, entitlement set, or Business identity.

## R. Membership state machine

Plan and lifecycle are separate:

```text
plan: expenses | business
lifecycle: active | payment_issue | canceling | expired_read_only
```

No launch trial is specified. A future trial must be an explicit lifecycle addition, not an overloaded Stripe status.

Allowed transitions:

```text
active --cancel request--> canceling --period end--> expired_read_only
active --renewal fails--> payment_issue --payment recovers--> active
payment_issue --grace expires--> expired_read_only
canceling --reactivate before period end--> active
expired_read_only --new paid membership--> active
expenses + active --confirmed upgrade--> business + active
business + active/canceling --scheduled downgrade--> business until period end,
                                                     then expenses + active
```

A future membership projection needs, at minimum: Business ID, plan, lifecycle, effective/access-through timestamps, scheduled next plan, authority/source, and current append-only event identity. Stripe customer/subscription identifiers belong in provider mapping, not the entitlement vocabulary.

## S. Central entitlement model

Use one server-owned, versioned capability catalog. Suggested capabilities:

```text
track_expenses
track_income
create_invoices
manage_current_invoices
record_manual_income
record_manual_expense
track_mileage
contractor_awareness
upload_receipts
upload_statements
import_csv
deduction_intelligence
expense_tax_package
business_tax_package
connected_plaid_item_limit
autonomous_expense_processing
autonomous_income_processing
export_historical_records
```

Resolve an `EntitlementSnapshot` from plan + lifecycle + catalog version. Routes and server services ask for capabilities, not `plan === 'business'`. Limits are typed values on the snapshot. UI consumes the same projection for presentation, but server authorization remains decisive.

`expired_read_only` grants read/history/export/security capabilities and denies mutation/ongoing-processing capabilities regardless of prior plan. Canonical read access and tenant ownership checks remain separate from commercial entitlement checks.

## T. Future route and API enforcement map

This is a future enforcement map; this milestone activates none of it.

| Surface | Required active entitlement | Read-only behavior |
| --- | --- | --- |
| `/invoices`, `/invoices/[id]` | `manage_current_invoices` for mutations; Business | Historical list/detail/print remain readable. |
| `/api/invoices/**` | `create_invoices` or `manage_current_invoices` by operation | Deny mutations; retain safe historical reads/prints. |
| `/money?kind=received` | `record_manual_income` | Historical received records remain readable elsewhere; no create form. |
| `/api/manual-money` received creation | `record_manual_income` | Deny creation. |
| `/money?kind=spent` and expense manual APIs | `record_manual_expense` | Deny new creation only when expired. |
| `/reports` income/profit composition | `track_income` | Historical Business reports remain accessible; Expenses gets scoped report. |
| `/reports/tax-time`, tax-time API/package | `business_tax_package` or `expense_tax_package` | Serve the plan-appropriate scope; preserve already generated historical exports. |
| Home income/profit projection | `track_income` | Expenses Home omits completeness/profit promise. |
| `/receipts`, receipt APIs | `upload_receipts` for intake/mutation | Historical receipt read/download only when expired. |
| `/import`, statement and CSV APIs | `upload_statements` / `import_csv` | Historical import status only when expired. |
| Plaid Link/exchange | available connection capacity | No new links in read-only; historical connection facts remain. |
| Plaid sync/webhook ingestion | active applicable autonomous capability | Stop ongoing ingestion after paid access ends; preserve webhook idempotency/audit. |
| `/mileage`, mileage mutation APIs | `track_mileage` | Historical list/export only when expired. |
| `/deductions`, fact mutation APIs | `deduction_intelligence` | Historical facts/readiness remain readable when expired. |
| `/contractors`, contractor mutation APIs | `contractor_awareness` | Historical contractor summary/export remains readable when expired. |
| Question generation/workers | matching autonomous scope capability | Do not generate ongoing questions when expired. |
| Settings/security | authenticated ownership, not premium capability | Remains available. |
| General exports | `export_historical_records` | Always available to authenticated owner. |

All mutation checks must occur server-side after authentication and Business resolution. Hiding a button is never enforcement. Internal workers must check the current entitlement before beginning new commercial processing, while still allowing bounded integrity cleanup for already accepted work according to the future transition policy.

## U. Existing-data migration recommendation

The current legacy `subscriptions` table is not a canonical membership model: it is not Business-owned, mixes Stripe identifiers with plan/status, and has no customer RLS. Do not extend it into the new authority. Preserve it for audit until a separately approved migration maps provider history.

Future rollout should:

1. Add new Business-owned append-only membership/provider tables and a current projection.
2. Create an explicit membership row for every existing Business; never infer a plan from feature usage.
3. Assign current internal/test and approved prelaunch Businesses a temporary `business + active` legacy grant with an auditable source and explicit conversion/review policy.
4. Keep Businesses with no valid grant or paid entitlement fail-closed from new paid processing, while preserving historical read/export access.
5. Map known Stripe test records manually/idempotently only after ownership is proven.
6. Do not fabricate Stripe subscriptions or destroy existing canonical records.

The obsolete informational `Essential/Premium/Premium Plus` onboarding recommendation and public `Starter/Pro/Pro+` pricing are not membership authority. They must be retired or replaced in the later product/pricing implementation.

## V. Canonical customer-facing copy

### Expenses

**WriteOffs Expenses**

**Expenses, deductions and documentation.**

Keep your business expenses, deductions and supporting records organized.

### Business

**WriteOffs Business**

**Income, expenses and tax-ready business records.**

Keep your cash-basis business income, expenses and supporting records organized for tax time.

### Product fit

WriteOffs is designed for U.S. Schedule C solopreneurs with relatively simple service, gig, creator, or independent-business finances. It is not designed for payroll, inventory, complex accrual accounting, partnership/S-corporation bookkeeping, or general-ledger management. Revenue alone does not determine fit; do not impose an arbitrary revenue cap.

## W. Decisions required before Stripe implementation

1. Confirm final monthly prices after Plaid Production, OCR/AI, and Stripe unit economics are known.
2. Confirm or revise the working 3/8 Plaid Item limits after the Plaid economics meeting.
3. Confirm the seven-day failed-payment grace period and whether Stripe Smart Retries may extend—but never shorten—it.
4. Decide the cutoff and communication plan for temporary prelaunch `business` legacy grants.
5. Decide whether an upgrade reprocesses only the current tax year, as recommended, or offers an explicit paid historical-year option later.
6. Approve the account deletion/retention policy that governs read-only historical data.
7. Define support procedures for payment disputes, chargebacks, and mistaken duplicate subscriptions.
8. Decide whether tax packages are generated on demand in read-only mode or only previously generated artifacts are retained; data portability favors safe on-demand regeneration without new OCR/AI.
9. Confirm whether canceling customers may switch the scheduled renewal plan before period end through the Customer Portal.
10. Approve final pricing-page copy and remove the stale Starter/Pro/Pro+ and Essential/Premium/Premium Plus language before checkout is exposed.

## Repository fit and conflicts found

The current canonical architecture supports a capability-based membership layer without another ledger. Receipts, statements, CSV, Plaid, manual money, invoices, mileage, contractor context, deduction facts, reporting, and readiness already converge on Business-owned canonical records and shared current-record resolution.

Conflicts/gaps to resolve in the future billing milestone:

- `app/api/checkout/route.ts` accepts a caller-supplied price and is not safe membership authority.
- `app/api/stripe/webhook/route.ts` verifies signatures but does not project subscription lifecycle.
- Legacy `subscriptions` lacks Business ownership and the required plan/lifecycle separation.
- Public pricing still advertises Starter/Pro/Pro+, annual savings, question quotas, and backfill limits that conflict with this specification.
- Historical onboarding recommendation constants use Essential/Premium/Premium Plus and arbitrary account thresholds; they are explicitly informational compatibility code.
- Current Home, Reports, and tax-time readiness assume the Business scope and will need scope-aware presentation selectors.
- Current `/money` defaults to received; future entitlement UX must avoid routing Expenses customers into a denied primary workflow.
- Existing APIs have authentication/tenant enforcement but no centralized commercial entitlement check.
- Workers have durable/idempotent processing but no membership snapshot check or accepted-before-expiry transition policy.
- There is no distinct expired read-only shell, reactivation path, billing settings surface, or data-deletion workflow.

These are inputs to the future Stripe milestone. They do not justify changing canonical bookkeeping or tax logic.
