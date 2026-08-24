# Canonical Invoice Workflow

Invoices are optional business context around cash-basis income. Creating, sharing, correcting, or canceling an invoice does not create a bookkeeping record and does not change income or profit.

## Canonical identities

- `invoice_customers` stores the smallest reusable Business-owned customer identity: display name and optional email.
- `canonical_invoices` stores immutable creation identity, original facts, and a per-Business generated invoice number.
- `canonical_invoice_events` stores append-only current-leaf snapshots for created, corrected, shared, paid, and canceled history.
- `invoice_income_links` associates one invoice with one already-established canonical business-income record. Both invoice and income record are limited to one active launch link.

All monetary values use signed integer cents. Invoice amounts are positive amounts due. Currency and exact cents must match the linked income record.

## Cash-basis boundary

An unpaid invoice is never included in Home, Reports, tax-prep output, Transactions, or exports as economic activity. A paid invoice contributes no additional amount: the linked canonical bookkeeping record remains the sole reporting contributor. The invoice supplies customer, description, and optional job/location context to reads.

Payment linkage requires a current, Business-scoped record whose current decision is established business income. The link rejects amount, currency, date, tenant, current-record, and current-decision mismatches. Compound components such as customer-recorded check income remain eligible, so a later bank match does not duplicate income.

## Launch workflow

Customers create a minimal invoice, view or print/save a professional artifact, and mark it shared. When exactly one matching canonical income candidate exists, WriteOffs asks the factual association question. Ambiguous candidates remain awaiting payment. Paid invoices cannot be corrected or canceled because doing so would invalidate established income linkage.

Partial payments, installments, credits, overpayments, multiple invoices per payment, payment processing, customer portals, collections, recurring invoices, and accrual reporting are deliberately deferred.
