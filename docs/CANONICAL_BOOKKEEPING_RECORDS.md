# Canonical Bookkeeping Record Foundation v1

## Purpose

WriteOffs separates evidence of financial activity from the bookkeeping decisions
made about that activity. Imported evidence is never rewritten to reflect a later
classification, correction, or user choice.

This foundation is additive. Existing `transactions`, receipts, APIs, and screens
continue to operate as compatibility workflows until they are migrated in small,
separately validated batches.

## Record model

1. **Source financial evidence** — `financial_transactions` stores immutable facts
   imported from a provider or CSV: account, date, description, and signed amount.
   Provider-specific adapters end at this boundary.
2. **Canonical bookkeeping record** — `bookkeeping_records` gives one stable,
   provider-neutral identity to an item WriteOffs will treat. A record may point to
   a financial transaction through `bookkeeping_financial_sources`, or may begin as
   a receipt/manual item before financial activity is available. Its origin
   identity and originally observed amount are immutable. The financial-source
   association is one-to-one while active. A mistaken receipt/manual match can be
   revoked with its history retained; origin financial evidence cannot be revoked.
3. **Bookkeeping treatment** — `bookkeeping_decisions` is an append-only sequence.
   Each version separately records the activity's economic nature (`expense`,
   `business_income`, `transfer`, `credit_card_payment`, `refund`,
   `owner_contribution`, `loan_proceeds`, or `other_non_income`) and its use
   treatment (unresolved, business, personal, mixed-use, or excluded). Keeping
   those concepts separate avoids treating every deposit as income or every
   payment as an expense. Decisions also record review state, provenance,
   confidence, explanation, and business purpose.
4. **Allocations** — `bookkeeping_allocations` belongs to one decision. Resolved
   decisions allocate the complete signed record amount among business, personal,
   or excluded portions. Business allocations may carry an internal tax category.
   The database validates exact reconciliation at transaction commit.
5. **Documentation** — `bookkeeping_document_links` associates an existing receipt
   with a canonical record. A mistaken association is revoked, not deleted, so the
   history remains reconstructable. Receipt ownership must match Business
   ownership.
6. **Decision history and review state** — a correction inserts a decision that
   supersedes the prior decision. The prior decision and allocations remain
   immutable. The current decision is the decision with no successor.
   `review_status` remains a coarse bookkeeping invariant; the durable customer
   question queue is derived from current `bookkeeping_review_events` leaves.

## Integrity and security

- Composite foreign keys carry `business_id` through every relationship, blocking
  cross-tenant links even for privileged application code that makes a mistake.
- RLS resolves every customer read/write through `businesses.owner_user_id`.
- Authenticated customers may record only decisions attributed to themselves.
  Automated processing uses trusted server-side service code and records
  `automation`, `system`, or `import` provenance.
- Canonical records, decisions, and allocations reject updates and deletes.
- A database insert trigger requires the first decision to be a root and every
  correction to supersede the current leaf. Together with unique root and
  successor indexes and the self-reference constraint, this prevents direct SQL
  inserts from creating branches, cycles, disconnected histories, or multiple
  current decisions.
- Financial-origin records must copy the source transaction's signed amount,
  currency, and date. Database triggers verify this without changing the source.
- A receipt/manual amount is authoritative only until financial evidence is
  attached. Once matched, the immutable financial transaction's signed amount is
  authoritative for every resolved decision. Currency must match as well.
- Adding or revoking matched financial evidence cannot leave the current decision
  out of balance. When a posted amount differs, the supplied
  `match_bookkeeping_source_with_correction` operation attaches the source and
  appends its balanced superseding decision in one database transaction; either
  both changes commit or neither does.
- Documentation links can only be revoked; their identity and original provenance
  cannot be rewritten.

## Converging ingestion paths

- **Plaid or another future provider:** the adapter creates/deduplicates an
  immutable `financial_transaction`, then idempotently creates its canonical
  bookkeeping record. No provider fields enter the bookkeeping tables.
- **CSV and statements:** the authenticated CSV adapter parses exact signed cents,
  normalizes source facts, and writes the same `financial_accounts` and
  `financial_transactions` contracts before bookkeeping. The current CSV screen
  has no account selector, so v1 resolves one stable manual-import account per
  Business and currency. Its provider namespace is `csv`; it contains no provider
  credential or Teller/Plaid dependency.
- **Receipts:** a receipt can support an existing canonical record. If no financial
  activity exists yet, a receipt-origin record may remain unresolved and later gain
  an immutable financial-source association without fabricating or rewriting a bank
  transaction. Once linked, the electronic posted amount controls new treatment.
- **Manual expenses:** a manual-origin record uses a caller-owned idempotency key
  and the same decision/allocation rules.

The application service in `app/lib/bookkeeping` validates commands before they
reach a repository. Its `ensureRecord` port must use the database uniqueness
constraints as an atomic insert-or-return operation, so concurrent ingestion is
idempotent. The migration supplies `ensure_bookkeeping_record` and
`append_bookkeeping_decision` transaction functions, an atomic source-match and
correction function, and an atomic receipt-link insert-or-return function for
repository adapters. Every repository command receives the complete actor
(Business, user when applicable, and provenance), so its database call does not
depend on hidden service state. RLS still applies because the functions use caller
privileges. The service deliberately has no Plaid, CSV, OCR, Supabase, UI, or tax
form dependency.

## Transition strategy

The legacy `transactions` table remains readable. No historical row is bulk
backfilled into this model because doing so would invent decisions that users did
not make. New CSV activity now enters immutable canonical financial evidence first.
For each valid import batch, one authenticated transaction resolves the stable CSV
account, inserts or reuses each immutable financial transaction, creates its
canonical financial-origin record and fixed unresolved system decision, and
inserts or reuses the legacy display row. A database failure rolls back the whole
valid batch; retries and overlapping files converge instead of leaving only one
representation committed.

CSV transaction identity is scoped by the Business-owned financial account and a
versioned SHA-256 fingerprint of the normalized date, exact signed cents, currency,
and full mapped source description. The separate legacy SHA-1 key is retained only
to converge with rows created by the old importer. With the current three-column
CSV contract, two byte-equivalent source rows are indistinguishable and converge;
a future account-aware importer or bank-supplied transaction ID can provide a
stronger identity without changing the canonical bookkeeping model.

The legacy compatibility row is not canonical source evidence and may continue to
be mutated by old Review/reporting workflows. Its pack/category fields are not
copied into canonical decisions. Every imported canonical decision begins
unresolved with system provenance and no nature, treatment conclusion, category,
business-use percentage, or allocation. OCR-created transactions, the old Review
surface, and legacy reports remain compatibility workflows until each has an
explicit cutover and historical-data policy.

The current foundation does not implement provider synchronization, tax-return
preparation, official tax forms, or a canonical tax-treatment layer.

## Canonical Weekly Review foundation

`bookkeeping_review_events` is a separate append-only history of specific material
questions. An unresolved bookkeeping decision alone is agent-processing backlog;
it does not enter customer Weekly Review until trusted processing opens one of the
five approved typed issues. Current Weekly Review items are derived only from the
leaf event of each issue, never from legacy transaction flags or category state.

An issue begins with `opened`, may be `skipped` without being resolved, can be
`resolved`, and can be `reopened` only with a new material-context fingerprint.
The stable issue identity and predecessor chain prevent rewriting or branching
history. Reprocessing the same issue key is idempotent even after resolution.
Authenticated users may only skip their own Business's issue; narrow trusted
operations open, resolve, and materially reopen issues. This foundation does not
alter bookkeeping decisions from unsupported review responses.

`BUSINESS_PURPOSE_NEEDED` accepts a factual answer whose customer
contract contains only a schema version and plain-language business purpose. One
authenticated database operation verifies the current issue leaf, current decision
leaf, trusted question context, and a fingerprint of canonical source/document
evidence. It then copies the established nature, treatment, allocations, internal
category mapping, and explanation into a new user-provenance decision, adds only
the trimmed factual purpose, and appends `answered` and `resolved` events. All
records commit together or all roll back. The remaining reason-specific factual
contracts are described below; none accepts customer-supplied bookkeeping outcomes.

Evidence fingerprints cover the canonical record and authoritative amount and
currency, the active financial-source association, and document-link history
including revocation state. Evidence-link mutations and answers take the same
record-level transaction lock, preventing a stale answer from racing a source or
document association change. This answer path does not write legacy transactions,
receipt links, categories, UI state, or documentation-risk state.

`BUSINESS_USE_UNCLEAR` accepts only the factual choices Business, Personal, or
Both. With a known bookkeeping nature, Business or Personal creates a complete
user decision using the full authoritative signed amount. Without a known nature,
the answer remains preserved while a typed `TRANSACTION_TYPE_UNCLEAR` issue is
opened atomically. Both never creates partial mixed-use allocations: it closes the
business-use issue and atomically opens `MIXED_USE_CLARIFICATION`.

The mixed-use customer contract accepts only a positive business amount in whole
cents. WriteOffs applies the authoritative transaction sign and derives the
personal remainder by exact subtraction. A zero, negative, fractional, full, or
over-total amount is rejected. Once nature is known, the resulting user decision
contains exact signed business and personal allocations; otherwise the amount is
preserved and a typed transaction-nature issue is opened. Neither contract exposes
percentages, allocation kinds, categories, treatment, confidence, or approval.

`TRANSACTION_TYPE_UNCLEAR` asks only what happened. Its semantic activities map
server-side to expense, business income, transfer, credit-card payment, refund,
owner contribution, or loan proceeds; the customer never submits those canonical
nature values. “Other” requires factual details and deliberately remains
unresolved rather than becoming a catch-all `other_non_income` decision.

The transaction-type answer verifies earlier Business, Personal, Both, and
business-dollar answers from immutable answered-event history. A purchase reuses
those facts to complete exact signed allocations or opens only the next missing
typed issue. Transfers, card payments, owner funding, and loan proceeds are
non-counted excluded activity. An unmatched refund remains unresolved for trusted
agent processing, and earned money that conflicts with prior Personal or Both
answers opens `CONFLICTING_EVIDENCE`. The answer, user decision, resolution, and
any follow-up are one stale-safe database transaction.

`CONFLICTING_EVIDENCE` is narrower than ordinary uncertainty. Trusted processing
may open it only with at least two distinct, evidence-backed factual
interpretations. Each immutable option has a stable ID, plain-language meaning,
same-Business evidence/history references, and one versioned server-controlled
outcome. Options and references are normalized before their separate conflict
fingerprint is stored. Low confidence, incomplete evidence, generic confirmation,
and category selection are not valid conflict questions.

The customer submits only the selected option ID. An optional `none_of_these`
choice exists only when trusted context explicitly enables it and then requires a
short factual explanation; it returns the record to agent processing without
turning that text into bookkeeping. Supported trusted outcomes can copy the
current decision, copy a verified prior decision into a new decision, apply a
strictly validated candidate, remain unresolved, or open exactly one of the other
four typed questions. There is no generic mutation executor.

Answering locks the primary and referenced records in deterministic ID order,
then rechecks the review leaf, decision leaf, primary evidence fingerprint,
immutable context, referenced history and related-record evidence, and the
conflict-specific fingerprint. The selected outcome is revalidated against the
authoritative amount and canonical constraints. A new user-provenance decision,
answer event, resolution, and optional typed follow-up commit atomically. Prior
answers and losing interpretations remain immutable history.

## Canonical documentation risk

Documentation risk is separate from bookkeeping decisions and Weekly Review.
`bookkeeping_documentation_events` preserves a Business-scoped append-only chain
for a specific missing-supporting-documentation request. An otherwise supportable
expense keeps its established nature, treatment, allocations, category, business
purpose, and review status when its receipt is unavailable.

The first customer assertion is exactly `receipt_lost`; it accepts no note, risk
score, category, treatment, approval, or evidence identity. One authenticated
database transaction verifies the current request leaf and canonical evidence
fingerprint, appends the user assertion, and appends a system resolution. The
resolved issue leaves the outstanding documentation queue and ordinary processing
returns that resolved leaf instead of recreating the request.

Reopening is trusted-only and requires both materially new context and a changed
canonical evidence fingerprint. A receipt that remains missing after Receipt Lost
is not new context. Receipt matching now appends `evidence_attached` history
atomically with the real canonical document link when a recognized documentation
requirement is affected.

Future documentation reporting can combine immutable Receipt Lost history with
current document-link evidence to distinguish missing documentation, later-found
evidence, and weaker support. None of those states claims IRS compliance or changes
bookkeeping truth.

Receipt attachment uses one authenticated database transaction to create or reuse
the canonical document link and append any relevant documentation observation. A
trusted `receipt_for_record` requirement is satisfied by a real, active receipt
link; the same issue receives `evidence_attached` and `resolved`. If Receipt Lost
was recorded earlier, that assertion remains in the same immutable chain before
the later evidence events. Unknown requirements are never automatically satisfied.

Document-link revocation uses the same record lock. Losing the only satisfying
link reopens an evidence-resolved request, but a prior Receipt Lost assertion keeps
the request resolved and prevents renewed prompting. Active links and immutable
events together support factual documentation-condition reporting without altering
bookkeeping or claiming substantiation or tax compliance.

## Customer question experience

The customer question flow is a presentation and orchestration layer over current
canonical review-event leaves. It does not maintain batches, question rows, mutable
review flags, or a second bookkeeping state. The Home count projects only current,
actionable typed issues into plain-language factual questions. A question deferred
with `Do this later` stays immediately active in that continuous queue and therefore
remains in the Home count; the current browser session alone remembers not to show
it again during that session.

Purchase-specific business-use, purpose, and mixed-use questions are projected only
after trusted canonical processing has established that the activity is an expense.
Unknown or non-expense activity stays in agent processing instead of being presented
to the customer with a misleading purchase prompt.

Button and text answers call the existing authenticated canonical answer paths.
Business and Personal reuse the business-use answer function; purpose text uses the
business-purpose function; trusted conflict options use the conflict function. The
customer mixed-use interaction records either all-business use or a positive
personal dollar amount. PostgreSQL applies the authoritative transaction sign and
derives the business remainder exactly. None of these contracts accepts a category,
treatment, allocation kind, confidence, provenance, or Business identity.

`Not sure` is factual history, so its narrow database operation appends a
user-provenance decision without inventing missing facts, then records and resolves
the presented issue. Trusted processing may later reopen a materially necessary
question with new context. `Do this later` is different: it appends only a deferred
`skipped` event with no time-based suppression, creates no decision or answer
evidence, and remains unresolved and actionable.
Consequently “all caught up” describes the current session, not a weekly batch or a
claim that every deferred matter is complete.

## Canonical financial summaries

Canonical reporting uses one signed-cents convention: positive amounts are cash
inflows and negative amounts are cash outflows. Aggregation never applies an
absolute value to canonical activity. A positive expense allocation is therefore
an expense credit or reversal that reduces net business expenses; customer-facing
expense presentation negates the final signed expense total.

The first reusable summary includes only current decision leaves. Business income
is the signed total of business allocations on resolved `business_income`
decisions. Business expenses are the business-allocated portion of resolved
`expense` decisions, including only the business portion of mixed-use activity.
Business profit is business income minus the customer-facing net expense amount.
Transfers, credit-card payments, owner contributions, loan proceeds, personal and
excluded allocations, unresolved activity, and unmatched refunds do not enter
these totals.

Financial-source amount, currency, and transaction date control whenever an active
immutable financial transaction is attached. Otherwise the canonical record facts
apply. The summary accepts explicit inclusive period boundaries, keeps currencies
separate, returns unresolved/completeness metadata, and retains contributor IDs
from allocation through decision, record, and financial source for internal
traceability. Documentation risk does not change bookkeeping arithmetic.

Estimated deductions and taxable-income concepts are intentionally absent. They
require a separately approved, versioned canonical tax-treatment layer and must
never be inferred by treating all business expenses as deductible.
