# Canonical Mileage

WriteOffs records mileage separately from bank transactions because driving is a Business-owned factual event, not cash movement. The legacy `mileage_trips` table has no tenant identity and remains inaccessible; it is never a canonical source.

`canonical_mileage_entries` preserves immutable facts as originally supplied. `canonical_mileage_events` records the current trip through append-only `recorded`, `corrected`, and `voided` leaves. Miles use integer thousandths (`miles_milli`) so storage, correction, export, and reporting do not depend on floating-point arithmetic.

Every entry belongs to one Business and one `business_vehicles` identity. RPCs derive authority from the authenticated Business owner, validate composite vehicle ownership, use request identities for retries, and require the expected current event before correction or removal. Customer roles can read their current/history rows but cannot write tables directly.

Vehicle bookkeeping now extends this ledger without changing it. Append-only vehicle
identity events record owned/leased status; separate per-vehicle, per-year events record
the customer's tracking method and total-mile facts. Expense associations connect a
preserved bookkeeping record to a vehicle and real-world cost kind. Versioned assessment
snapshots and live reports keep economic transactions, business allocation, tax method,
deduction calculation, and CPA-review state separate.

The production rate catalog uses exact date ranges. It supports 2025 at 70 cents per mile,
2026 through June 30 at 72.5 cents, and 2026 beginning July 1 at 76 cents. An unsupported
date fails closed. Standard mileage suppresses incompatible fuel, insurance, repair,
maintenance, registration, tire, and lease deductions while preserving the transactions;
business parking and tolls remain separately eligible. Actual costs use the vehicle-year
business-mile/total-mile ratio. Vehicle purchases, possible capital improvements, and
lease inclusion adjustments remain tax-preparer review items.

## Customer workflow

Weekly review includes mileage. With no period entries, ask whether the customer
drove for business; with entries, show them and ask whether another trip is missing.
Normal entry asks only miles, date, and business reason. The Business remembers a
normal vehicle and offers a different vehicle when needed; destination, job, and
project are not mandatory unless later authoritative substantiation requirements
establish that need.

The Mileage page asks whether the customer owns or leases the vehicle and offers two
plain choices: track business miles or track the business share of vehicle costs. For a
mixed-use vehicle using actual costs, the customer supplies total annual miles and
WriteOffs calculates the ratio. Evidence-specific vehicle questions reuse the continuous
question queue; they never ask the customer to choose a Schedule C category.

The model is compatible with future automatic trip detection: another trusted source may create immutable mileage evidence with explicit provenance in a later version, without changing current customer-authored history. GPS tracking is not part of this milestone.
