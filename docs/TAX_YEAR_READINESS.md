# Tax-Year Readiness and Annual Records v1

Tax-time readiness is a derived projection over current canonical records. It is not a ledger, a second task queue, a tax return, or a manually maintained close flag.

## Sources

The projection reads current bookkeeping records through the shared current-economic resolver, current decisions and allocations, current tax treatments, the existing customer-question queue, receipt/document evidence, mileage facts, contractor awareness, invoice-income integrity, durable processing state, and known Plaid connection state. Compound reconciliation, receipt convergence, manual-source correction, and ordinary direct transactions therefore retain their existing current-leaf behavior.

Receipt-understanding and bookkeeping-AI shadow jobs are excluded. Shadow evaluation cannot change customer readiness.

## Status policy

Customer-facing states are `Ready`, `Needs attention`, `Still processing`, and `Incomplete`. Integrity failures and unsupported tax years fail closed. Customer facts and documentation gaps are separated from system processing. Missing documentation does not change an established business expense to Personal or remove it from bookkeeping totals.

The approved production tax-rule catalog currently supports tax year 2025 only. Other years remain viewable as factual annual records, but estimated deductions are suppressed and readiness is `Incomplete` until an approved catalog exists for that year.

## Annual package

The launch package is a clear set of bounded downloads rather than a ZIP-generation subsystem: year-filtered canonical activity, mileage, contractor context, documentation counts, unresolved items, and the existing Schedule C category summary. Invoices provide context only; they never create cash-basis income.

## Known limitation

WriteOffs can report known disconnected or attention-required Plaid connections. It cannot prove that every relevant account, cash source, or external record was supplied, so v1 makes no global “all accounts complete” claim.
