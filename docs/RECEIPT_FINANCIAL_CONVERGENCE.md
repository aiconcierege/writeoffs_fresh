# Receipt-first financial convergence

WriteOffs preserves receipts, financial transactions, bookkeeping records, and their histories as separate immutable source facts. When a customer-Kept receipt-only record later has one uniquely exact financial match, an append-only convergence event makes the financial-origin record the current economic identity. The receipt-only record becomes a historical alias; it is not deleted or rewritten.

## Exact v1 matcher

Automatic convergence is deliberately narrow. Both records must belong to the same Business and have only their initial unresolved system decisions, with no allocations, questions, corrections, tax treatment, incompatible document links, or other active convergence. The receipt must have a current user-authored Keep event tied to its current extraction and active document link. The financial transaction must be posted, current, non-pending, non-removed, and have one active financial source.

The receipt total must be positive; the financial amount must be the exact inverse signed-cent outflow. Currency and canonical date must be identical. Both normalized merchants must be nonempty and exactly equal. The candidate relationship must be one-to-one in both directions.

Refunds, credits, zero amounts, split or partial payments, installments, tips or amount differences, FX differences, date differences, fuzzy merchants, and ambiguous candidates fail closed.

## Current identity and history

`current_bookkeeping_record_convergences` resolves an absorbed receipt record to its financial survivor. Shared reporting, Transactions, the unresolved review queue, and processing evidence use that current identity. Receipt/document evidence is read across the survivor and absorbed alias, while both original decisions and source histories remain queryable on their original record IDs.

Convergence creates no bookkeeping classification, allocation, question, tax treatment, or documentation claim. It requests a provider-neutral deterministic reevaluation for the survivor with the convergence event in the material fingerprint. A processing job originally aimed at the absorbed alias resolves to the survivor.

Customer Keep remains customer-authored evidence. It does not certify deductibility, IRS substantiation, audit readiness, or documentation sufficiency.

## Reversal

Reversal is append-only and owner-scoped. A simple reversal is allowed only while both participants remain at their initial unresolved state and have no allocations or open review/documentation dependencies. Otherwise guarded correction semantics are required. A successful reversal restores both current identities, requests reevaluation for both, and permits a later exact reconvergence as a new convergence generation.

## Ingestion boundary

A deferred trigger at the canonical initial-decision boundary attempts convergence after the complete financial ingestion transaction is available. This is provider-neutral: CSV, Plaid, and future sources use the same matcher. Plaid provider activity additionally must have a current posted added/modified provider version. No historical backfill is performed by the migration.
