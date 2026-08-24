# Canonical Mileage

WriteOffs records mileage separately from bank transactions because driving is a Business-owned factual event, not cash movement. The legacy `mileage_trips` table has no tenant identity and remains inaccessible; it is never a canonical source.

`canonical_mileage_entries` preserves immutable facts as originally supplied. `canonical_mileage_events` records the current trip through append-only `recorded`, `corrected`, and `voided` leaves. Miles use integer thousandths (`miles_milli`) so storage, correction, export, and reporting do not depend on floating-point arithmetic.

Every entry belongs to one Business and one `business_vehicles` identity. RPCs derive authority from the authenticated Business owner, validate composite vehicle ownership, use request identities for retries, and require the expected current event before correction or removal. Customer roles can read their current/history rows but cannot write tables directly.

Current reporting includes exact business-mile totals. It deliberately reports no mileage deduction amount and does not choose between standard-mileage and actual-expense methods. Those tax conclusions remain fail-closed until the canonical tax-treatment layer has the necessary vehicle-year facts and an approved rule.

The model is compatible with future automatic trip detection: another trusted source may create immutable mileage evidence with explicit provenance in a later version, without changing current customer-authored history. GPS tracking is not part of this milestone.
