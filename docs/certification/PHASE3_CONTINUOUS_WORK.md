# Phase 3 continuous guided-work correction

## Controlled statement comparison

Comparison uses the same 24-row May statement on an isolated synthetic business,
authorized historical coverage, and one customer-authored Business-only account
fact. The after snapshot precedes any transaction answers or sweep assertions.
Rick's accounts are not certification fixtures.

| Metric | Before | After economic reassessment |
|---|---:|---:|
| Canonical statement transactions | 24 | 24 |
| Organized working treatment | 6 | 10 |
| Available customer actions | 18 | 14 |
| Working income | $0.00 | $2,100.00 |
| Working expenses | $1,088.58 | $1,088.58 |
| Working profit | -$1,088.58 | $1,011.42 |

The 14 available actions are one grouped personal-exception review, eleven
remaining individual questions, and two special evidence workflows. This is a
snapshot of available actions, **not a promise of fourteen total clicks**. Mixed-use
and receipt stages follow the group review, Verizon's percentage becomes askable
when its prerequisites are handled, and a supported answer can reveal a necessary
follow-up. Deferrals are not answers or completed bookkeeping.

### Eliminated or narrowed questions

- ACH CREDIT — CLIENT PAYMENT, +$2,100: established customer payment; included once.
- TRANSFER FROM SAVINGS 1111, +$500: established non-P&L transfer.
- TRANSFER TO SAVINGS 1111, -$300: established non-P&L transfer.
- ACH PAYMENT — BUSINESS CREDIT CARD 3333, -$1,284.37: established non-P&L payment.
- LOAN PAYMENT — EQUIPMENT FINANCE CO, -$450: loan evidence request replaces a
  generic activity question; no principal/interest amount or deduction invented.
- REFUND — OFFICE DEPOT, +$32.10: refund relationship workflow replaces a generic
  money-source question; no ordinary revenue or automatic reversal invented.

### Remaining facts

| Activity | Remaining fact and why evidence does not establish it |
|---|---|
| Seven eligible purchases | Grouped personal/mixed exceptions; account default remains authoritative unless the customer supplies exceptions. |
| Stripe payout, +$735.44 | What the payout represents; the processor name alone does not distinguish customer proceeds from other movements or prove gross/net accounting. |
| ATM withdrawal, -$200 | Use of the withdrawn cash; a withdrawal does not establish a purchase. |
| Zelle from Robert Hall, +$425 | Payment purpose; a person's name and transfer rail do not establish revenue. |
| ACH deposit — Blue Mesa Consulting, +$1,250 | Source/purpose; a counterparty's business name does not establish this deposit's economic nature. |
| Zelle from Emily Carter, +$300 | Payment purpose; same ambiguity as other named-person deposits. |
| Zelle to Mark Reynolds, -$175 | What was paid for; could be business, personal or a movement outside P&L. |
| Cash deposit, +$600 | Cash source; revenue, owner money and other sources remain possible. |
| State Farm Insurance, -$118.75 | What policy/risk this covers and the relevant business treatment; insurer identity does not establish coverage or allocation. |
| Interest paid, +$0.52 | Supported interest/tax treatment; this repair does not invent a new interest policy or assume ordinary customer revenue. |
| Zelle from Jane Morris — INV 1041, +$850 | Relationship to a real customer invoice/payment; a memo reference alone is not a verified invoice relationship. |
| Desert Print Shop check, -$218.40 | What goods/service the check purchased; payee name alone does not establish the supported category. |
| Equipment-finance loan, -$450 | Loan documentation establishing principal/interest and supported business treatment. |
| Office Depot refund, +$32.10 | Return/reimbursement context and original purchase/allocation relationship. |
| Verizon, -$146.28 (after group prerequisites) | Business-use percentage; Business-only account use does not establish 100% business phone usage. |
| Missing receipts (later scoped stage) | Which receipts the customer can supply, or whether to defer. Documentation remains separate from working expense inclusion. |

Some existing generic prompts remain broader than the specific facts above
(insurance, interest and printing in particular). This repair does not claim that
all existing question wording or tax-policy coverage is now ideal, nor does it
invent treatment to make the queue empty.

### Reconciled categories before further customer answers

Rent $900.00 + licenses $75.00 + office expenses $64.19 + software $37.39 +
bank fees $12.00 = **$1,088.58**. Uncategorized business expenses: **$0.00**.
This does not imply the remaining unresolved transactions are expenses.

## Safety and implementation

- Complete financial narratives, direction, account type, source provenance,
  provider compatibility and customer authority are reconciled in the shared
  evaluator. No merchant-specific classification or broad substring rule.
- Financial-origin evidence is observed; automated conclusions remain inferred,
  versioned decisions with rule/evidence trace. No authoritative AI introduced.
- Receipt Later is a scoped canonical deferral. Availability confirmation is a
  different command; it only affects the displayed versioned purchases.
- Five-action stop removed. Progress still separates handled from deferred work.
- Canonical question pose is mirrored only in the side-by-side composition;
  mobile retains its original orientation. No asset generated or replaced.
- Transactions omits the redundant generic secondary line.
- Staging backfill schedules bounded versioned canonical worker jobs. No manual
  customer answers, source transaction changes or fabricated allocations.

## Additional defects found during certification

1. Historical unique question-context index rejected legitimate evidence-only
   refreshes. Kept the lookup index, RPC locking, current-version idempotency and
   append-only successor constraints; removed only historical context uniqueness.
   Rollback tests cover same-context refresh, identical retry and closed deferrals.
2. Global upgrade scan repeatedly evaluated commercial scope per record and timed
   out. Materialized eligible records and canonical scope once per business;
   a 12-record enqueue batch then completed in 987 ms.
3. SQL and worker generators used different identities for the same incoming-money
   fact. Deferring one exposed another legacy issue. Canonical generation and
   eligibility now share one fact identity; closed/ deferred authority survives
   equivalent legacy issues. History is retained. Rollback tests cover generator
   convergence, expiry restoring exactly one question, and no resolved reopening.
4. PostgreSQL retained an obsolete function dependency in a view after the eligibility
   function rename. Rebound the affected views to canonical eligibility while
   preserving security options; direct authenticated reads and foreign-tenant
   exclusion now pass. No old bypass permissions were restored.
5. Background guided refreshes could overlap and leave a recovered read error
   visible. Reads are now single-flight, obsolete polls abort around answers,
   and a successful poll clears only its own refresh error.

## Validation status

Automated tests: 1,580 passed; 143 environment-dependent tests skipped.
TypeScript and optimized local build pass. Lint: no errors, 16 existing warnings.
Dependency audit: two moderate development-tool advisories (Vitest/mocker), no
high/critical findings. Source secret scan: no findings.
Live staging security checks pass: tenant/RPC isolation, MFA, exact replay,
changed-retry rejection, stale-snapshot rejection and read-only rendering.
Live checks also preserve out-of-scope historical evidence: no active ledger rows,
no ordinary questions, no Catch-up, and zero working P&L for that synthetic case.

## Real staging journey coverage

All destructive actions used explicitly marked isolated synthetic customers.
The original statement stayed at 24 canonical transactions throughout. The
confirmation journey used actual UI answers for the return relationship and an
80% synthetic phone-use fact; unknown facts were explicitly deferred rather than
invented. Deferring every remaining unknown fact is **not** certification that all
24 books are complete.

| Check | Observed | Result |
|---|---|---|
| Business-only personal/mixed sweep | One saved account fact; grouped reviews completed through UI.  PASS |
| Receipt Later | Six displayed purchases deferred; no unavailable receipts, changed decisions or changed business treatment.  PASS |
| All receipts supplied | Visible group only; canonical unavailable evidence; expenses retained. Newly eligible phone purchase received its own scoped group.  PASS |
| Fifth-action continuation | Next material question appeared directly; no intermission; handled/deferred progress stayed distinct.  PASS |
| Client payment | $2,100 working income, once; no source question.  PASS |
| Transfers | Both statement directions excluded from P&L, no generic questions.  PASS |
| Ambiguous incoming money | Named Zelle, generic ACH, cash and processor payouts still required facts.  PASS |
| Ambiguous transfer-like language | Automated negative cases remain unresolved; words alone do not establish treatment.  PASS |
| Credit-card payment | Non-P&L, no duplicate expense or receipt request.  PASS |
| Refund | UI-confirmed $32.10 Office Depot return reduced the $64.19 purchase expense to $32.09; both financial records retained.  PASS |
| Loan | Evidence request; no full-payment deduction or fabricated split; deferral retained.  PASS |
| Phone | Percentage question only; supported answer triggered normal reassessment, then receipt opportunity.  PASS |
| Processing | Actual pending job showed assessment waiting; no fake question.  PASS |
| Loop protection | No handled/deferred fact returned through equivalent money-source issues.  PASS |
| Cross-surface truth | Projection, Home and Check-in counts agree; working categories reconcile with Reports and Home.  PASS |
| Scope | Separate retained-May/no-Catch-up synthetic case has zero active ledger/questions/P&L.  PASS |
| Transaction secondary line | Generic “Financial activity” removed; meaningful context retained.  PASS |

Earlier runs exposed and fixed the issues listed above. A transient staging
DB connection/statement-timeout incident interrupted certification; runs were
paused, diagnostics stayed read-only/rolled back, and the journey resumed after
connections recovered. No timeout, service configuration or customer data was
changed to force success. The exact refund command then completed in 300 ms in a
rollback-only diagnostic under the existing eight-second limit.

## Screenshots

Real staging captures; no generated mockups or edited screenshots. Each named
state has `390`, `430`, `768` and `1280` PNG variants in:
`/private/tmp/writeoffs-phase3-corrections-complete/browser/`.

- `personal-exceptions-{width}.png`
- `receipts-with-later-{width}.png`
- `individual-merchant-question-{width}.png`
- `processing-transition-{width}.png`
- `uninterrupted-after-fifth-{width}.png`
- `genuine-completion-{width}.png`
- `transactions-cleanup-{width}.png`

Reviewed for pose orientation, merchant/question hierarchy, desktop composition,
mobile first-viewport usability and overflow. The receipt Later action is directly
below upload; the confirmation remains a separate screen. Completion explicitly
preserves deferred work and does not claim Catch-up is finished.

## Database and source changes

Five staging migrations: bounded canonical reassessment scheduling; question
history index repair; scheduler scope-query bounding; shared money-source question
identity; eligibility-view dependency rebinding. Applied objects and version
history were verified on `sgrqrrxrlglhjuetdtps` only. Rollback tests preserve history,
idempotency, closed facts and service-only entry points. No destructive data
cleanup, manual customer classification or source-identity changes.

Implementation is in the shared economic evidence/evaluator/snapshot/worker,
guided conversation shell/styles/session, and Transactions secondary-line
projection. Focused tests cover economic evidence and ambiguity, work projection,
receipt deferral and worker dispatch. Staging certification scripts and rollback
SQL exercise actual API/DB boundaries. `docs/WORKFLOW_SPECIFICATION.md` and the
Phase 3 architecture document record the changed continuous-session contract.

Main and real Production remain untouched. Rick’s accounts were not used for
answers, uploads, resets or manual repairs. Existing records may receive only
normal canonical versioned reassessment. No mileage, Reports redesign or new phase
was started.


Final read-only verification after the synthetic UI journey: **PASS**.
24 ledger transactions; **0 active customer actions**, **12 deferred**;
Home/Reports income **$2,100.00**, expenses **$1,173.50**, profit **$926.50**.
No browser JavaScript errors or HTTP 5xx responses in the final verification.
Results: `/private/tmp/writeoffs-phase3-corrections-complete/final-verification.json`.
The twelve deferred facts remain unresolved; this is a genuine end-of-visit state,
not a claim that every transaction or the entire Catch-up period is complete.
