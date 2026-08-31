# WriteOffs Design System

## Source and principles

The public landing page is the visual source of truth. WriteOffs uses warm ivory canvases, ink-green typography, navy primary actions, and mint as a restrained signal. Product pages should feel calm and capable: typography and whitespace establish hierarchy before borders or cards.

Avoid generic dashboard grids, decorative charts, dense accounting tables, and a bordered rectangle around every section. Surfaces communicate a cohesive action, exception, or record—not mere existence.

## Tokens

- Canvas: `#fbfaf7`; public hero ivory: `#fff8ee`
- Ink: `#17211d`; secondary ink: `#59665f`
- Brand navy: `#243186`; hover: `#1d2870`
- Brand green: `#178368`; mint accent: `#00d0a6`
- Soft border: `#dce3de`
- Radii: 12px controls, 16px subtle groups, 20px primary surfaces
- Shadows: low-opacity green-black depth; never heavy gray dashboard shadows
- Layout widths: 48rem focused forms, 64rem standard pages, 80rem data-heavy pages
- Page gutters: 16px mobile, 24px tablet, 32px desktop

## Typography

Inter remains the product typeface. Page titles use tight tracking (`-0.042em`), semibold weight, and responsive 32–48px sizing. Section titles use 20px. Customer-required body copy, instructions, metadata, status, and form help use approximately 16px or larger with generous line height; smaller type is reserved for supplementary decorative labels. Dollar amounts use tabular numerals and tighter tracking.

## Components

`PageContainer`, `PageHeader`, `SectionHeader`, `Surface`, `StatusBadge`, `EmptyState`, and `MoneyDisplay` provide the core composition layer. Global `.btn`, `.field`, `.notice`, `.record-row`, `.status-badge`, `.empty-state`, and `.skeleton` styles support existing workflows without forcing component rewrites.

Primary buttons are navy with subtle lift. Secondary actions use quiet outlines or text. Destructive actions are red text with a pale hover surface. Inputs are 48px high, 12px radius, visibly focused, and explicitly invalid when necessary. Routine success uses quiet inline feedback rather than banners.

## Responsive behavior

Mobile is primary. Forms stack, controls and actions are at least 44–48px high, financial values remain legible, and data rows become two-column or stacked summaries rather than squeezed tables. Desktop uses bounded widths and additional alignment—not denser content.

Motion is subtle and disabled under reduced-motion preferences. Focus remains visible. Status is always expressed in text, not color alone.

## Imagery

Authenticated pages rely on typography, whitespace, and meaningful iconography. No stock photography or filler illustration. The existing logo artwork is unchanged. Betti appears selectively when she clarifies what the customer is doing, what WriteOffs is handling, or what fact is needed; she is not repeated as decoration.

The established authenticated Home composition is substantially aligned and is the
reference surface for later authenticated work. Preserve its result-oriented hero,
operating status, conversational Betti state, weekly review, documentation,
membership-scoped financial relationship, and restrained record access. Refinement
must not turn Home into a generic accounting dashboard or wall of cards.

## Betti character contract

WriteOffs is the brand. Betti is the recognizable bookkeeper/personality inside
WriteOffs and never replaces, modifies, or combines with the immutable WriteOffs
logo. **Ask Betti** is the canonical name for a restrained future assistance
capability limited to WriteOffs, the customer's authorized records/workflows, and
help understanding or completing WriteOffs tasks. Layouts must not foreclose it, but
it is not a general-purpose chatbot or a new brand.

Canonical Betti is a natural green turtle with a brown shell, warm brown eyes,
thick black glasses, subtle feminine features, polished coral leather sneakers,
and no clothing, bow, jewelry, logos, or W marks. Props may change by state.
Occasional seasonal accessories may be considered later without changing the
canonical character.

Full-body Betti must remain readable from glasses and shell through legs and shoes.
Do not accidentally clip her with a card or section boundary, and do not shrink her
solely to force her into a rectangle. Controlled overflow and deliberate boundary-
breaking are preferred. Partial crops are allowed only for an explicitly designed
headshot or close-up composition.
