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
   immutable. The current decision is the decision with no successor. Its
   `review_status` lets a future Weekly Review select unresolved or notable items.

## Integrity and security

- Composite foreign keys carry `business_id` through every relationship, blocking
  cross-tenant links even for privileged application code that makes a mistake.
- RLS resolves every customer read/write through `businesses.owner_user_id`.
- Authenticated customers may record only decisions attributed to themselves.
  Future automated processing uses trusted server-side service code and records
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
- **CSV and statements:** parsers normalize activity into the same
  `financial_accounts` and `financial_transactions` contracts before bookkeeping.
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

The legacy `transactions` table remains readable and unchanged. No historical row
is backfilled into this model because doing so would invent decisions that users
did not make. Each current workflow will be cut over later behind focused adapters,
with compatibility reads retained until its data has an explicit migration policy.

This v1 foundation does not implement Weekly Review, reporting, provider sync,
receipt matching UI, tax filing, or official tax forms.

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

`BUSINESS_PURPOSE_NEEDED` is the first supported factual answer. Its customer
contract contains only a schema version and plain-language business purpose. One
authenticated database operation verifies the current issue leaf, current decision
leaf, trusted question context, and a fingerprint of canonical source/document
evidence. It then copies the established nature, treatment, allocations, internal
category mapping, and explanation into a new user-provenance decision, adds only
the trimmed factual purpose, and appends `answered` and `resolved` events. All
records commit together or all roll back. The other four review reasons reject
answers until their separately validated factual mappings are implemented.

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
is not new context. The schema reserves `evidence_attached`, but this slice does
not alter receipt matching or create document links; later integration must append
evidence history atomically with the real canonical link.

Future documentation reporting can combine immutable Receipt Lost history with
current document-link evidence to distinguish missing documentation, later-found
evidence, and weaker support. None of those states claims IRS compliance or changes
bookkeeping truth.
