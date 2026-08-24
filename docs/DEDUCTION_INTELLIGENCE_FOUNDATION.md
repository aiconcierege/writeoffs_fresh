# Deduction Intelligence Foundation

This milestone adds bounded, reusable customer facts for deductions that cannot be supported by transaction categorization alone. It is not a general tax-advice engine.

## Canonical boundaries

- Facts are Business-scoped, typed, append-only, and customer-authored. Corrections supersede prior leaves without rewriting history.
- A fact has an explicit scope: the Business, a recurring merchant/service, or one bookkeeping record.
- Decisions and tax treatments may record the exact fact leaf they used. Replacing that leaf queues affected bookkeeping records and invalidates dependent tax treatment.
- Discovery creates an item in the existing factual-question queue. It never creates a deduction.
- Existing source transactions, decisions, allocations, receipt convergence, compound reconciliation, and reporting identity remain authoritative.

## Launch vocabulary

The bounded fact vocabulary covers phone and internet business-use percentages, four home-workspace facts, equipment business-use percentage and placed-in-service date, and recurring phone/internet context. Values are structurally validated; percentages and square feet are integers, yes/no answers are booleans, and dates cannot be future dates.

Phone and internet percentages can be reused only for the same normalized recurring provider scope. A direct answer may update the record attached to that question. Background reuse cannot overwrite an unrelated customer-authored decision. A later correction reevaluates only decisions that declare a dependency on the superseded fact.

## Home workspace and equipment

A home-based Business description may open a short factual sequence about regular use, exclusive use, workspace size, and home size. These facts do not by themselves guarantee or create a deduction.

A bounded equipment signal currently identifies large outflows with explicit equipment vocabulary. It marks the record for special-treatment review and may ask for business-use facts when age-eligible. It does not choose depreciation, capitalization, Section 179, or any other tax method, and it creates no tax treatment.

## Reporting

Canonical income and expense reporting continues to use current decisions and allocations. Special-treatment records retain their bookkeeping amount while tax-deduction estimates remain unavailable until supported tax treatment exists. Reports and exports identify the unresolved special-treatment condition without claiming deductibility.

## Deferred

This foundation deliberately omits tax filing, depreciation calculations or UI, property accounting, generic recommendation rules, arbitrary user-defined facts, and unsupported automatic deductions.
