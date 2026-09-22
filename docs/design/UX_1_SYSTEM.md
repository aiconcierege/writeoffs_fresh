# UX-1: WriteOffs authenticated design system

Status: implemented for staging review; Rick retains final visual approval.

## Boundaries

Home, Work with Betti, minimum onboarding, and the shared authenticated header are
this release. Transactions, Reports, Documents management, Mileage, Money, Invoices,
and Settings keep their existing workflows. Shared navigation changes apply across
those routes. No financial, scope, membership, question-eligibility, or tax policy changes.

The authoritative work/action index still chooses the next action. The existing
command response still advances guided work in place. Home consumes its existing
projection and canonical Reports totals. No new cache, polling, or queries are added.

## Visual language

`app/components/experience/experience.css` defines opt-in `.wo-experience` primitives.
Warm canvas #fbfaf7; paper #fffefa; ink #19342c; supporting text #52645b;
action blue #243186; green #17634e; border #d3ded5. Green identifies Betti/context;
blue identifies action, selected controls, and profit. Status must also use text.

Typography uses the existing Inter font, no extra font request:

| Role | Rule |
| --- | --- |
| Home display | responsive 2–3.7rem, 650 weight, compact leading |
| Page/question title | responsive 1.8–2.65rem, 600 weight |
| Entity/merchant | 1.45–2.05rem, 650 weight |
| Section | 1.1–1.4rem, 600–650 weight |
| Body | 1rem, 1.55–1.6 leading |
| Supporting/metadata | .8–.95rem, contrasted green-gray |
| Financial value | tabular figures, responsive, 600 weight |
| Controls | generally 1rem, at least 44px target |

Spacing scale .5/1/1.5/2/3rem; compact metadata may use smaller gaps. Large connected
surfaces use 1.3–1.75rem corners; controls .8rem. Avoid independent card piles.

## Reusable presentation

- `BettiPresence`: only shared character frame, direction, accessibility and sizing
  boundary. It wraps the existing approved `BettiIllustration` PNG contract.
  The question pose mirrors toward work on desktop. Images fit within their frames.
- `ConversationShell`: shared guide, work context, progress, notice, and content.
- `MerchantIdentity`: bundled reviewed marks only; neutral storefront otherwise.
- `SelectionCard`: account choices; action buttons remain immediate factual answers.
- MonthYearField: native accessible month/year selects, no day or calendar UI;
  canonical YYYY-MM values, bounded to allowed maximum month.
- Shared primary/secondary/text controls, errors, focus, reduced motion and surfaces.

Future approved Rive integration belongs behind BettiPresence. Page layouts must not
know state-machine strings. Idle/work-gaze/acknowledgment/working/success are intended
presentation concepts; UX-1 does not claim the unapproved Rive supports them and does
not load it. Retain current PNG rollback. Logo asset/component is unchanged.

## Compositions

Home: conversational hero with one projected primary action; working books with
period; balanced utility row; restrained recent activity. Mobile income/expenses sit
side by side, profit spans a separate row. No fake financial values in loading states.

Guided: one connected paper/green conversation, Betti left and work right on desktop;
compact guide above on mobile. Merchant context precedes the material question.
Choice-only questions use a compact two-column grid; text/amount controls keep a
single column. Batch items share one bounded surface with unmistakable selection.
Receipt Later and availability confirmation remain separate canonical commands.

Onboarding: short introduction, honest dynamic step progress, existing factual and
commercial prerequisites. Business start and scope use month/year selectors. Final
handoff leads with Betti and Go to WriteOffs; review/edit is a secondary disclosure.
Both ingestion preferences lead Home without connecting Plaid or entering mileage.

## Accessibility and performance

Native selects/radios/checkboxes; semantic headings; one main landmark; skip link;
Escape/outside-click menu dismissal; visible focus; reduced motion; fixed artwork
frames. No animation runtime or new dependencies. No changes to the mutation path.
Browser certification must inspect complete image loading and each actual settled
step, not merely an old screen while a POST is still pending.

## Deferred question-minimization finding

Observed State Farm sequence: broad economic-nature question followed by business-use
question despite insurance wording and business-only account evidence. Preserve for a
focused evidence/question-minimization investigation. UX-1 does not hard-code State
Farm, infer deductibility, suppress legitimate questions, or alter insurance policy.

## Final acceptance

Review screenshots at 390/430/768/1280. Automated functionality is necessary but does
not constitute Rick's approval of final visual direction. Detailed certification
results and any unexercised states must be disclosed separately.

## Authenticated utility pages — September 2026 refinement

Betti leads when WriteOffs needs something from the customer. Betti steps aside
when the customer already knows what they came to do.

Home and Check-in remain Betti-led. Transactions, routine Mileage, Invoices and
Reports use typography, spacing and restrained surfaces for brand continuity;
 they do not require character artwork. Preserve the right-side Menu and the
unaltered WriteOffs logo.

Utility pages share `AuthenticatedPage`, 48px fields, visible indigo focus, pale
green work surfaces and quiet dividers. `form-group` provides light semantic
fieldset grouping. `form-secondary-details` keeps optional information available
without giving it the weight of required input. Collapsing details never removes
inputs from form submission. Invoice history leads for returning customers;
creation remains directly accessible. Creating an invoice still does not record
income. Shared missing-records disclosures retain their account-specific dates
and existing coverage semantics.
