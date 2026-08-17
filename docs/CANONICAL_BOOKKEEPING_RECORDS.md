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
yet collect answers or alter bookkeeping decisions from review responses.
