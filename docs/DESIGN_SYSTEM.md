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
- Layout widths: 48rem focused forms, 72rem standard pages, 80rem data-heavy pages
- Page gutters: 16px mobile, 24px tablet, 32px desktop

## Typography

Inter remains the product typeface. Page titles use tight tracking (`-0.042em`), semibold weight, and responsive 32–48px sizing. Section titles use 20px. Body copy is 14–16px with generous 1.6–1.7 line height. Dollar amounts use tabular numerals and tighter tracking.

## Components

`PageContainer`, `PageHeader`, `SectionHeader`, `Surface`, `StatusBadge`, `EmptyState`, and `MoneyDisplay` provide the core composition layer. Global `.btn`, `.field`, `.notice`, `.record-row`, `.status-badge`, `.empty-state`, and `.skeleton` styles support existing workflows without forcing component rewrites.

Primary buttons are navy with subtle lift. Secondary actions use quiet outlines or text. Destructive actions are red text with a pale hover surface. Inputs are 48px high, 12px radius, visibly focused, and explicitly invalid when necessary. Routine success uses quiet inline feedback rather than banners.

## Responsive behavior

Mobile is primary. Forms stack, controls and actions are at least 44–48px high, financial values remain legible, and data rows become two-column or stacked summaries rather than squeezed tables. Desktop uses bounded widths and additional alignment—not denser content.

Motion is subtle and disabled under reduced-motion preferences. Focus remains visible. Status is always expressed in text, not color alone.

## Imagery

Authenticated pages rely on typography, whitespace, and meaningful iconography. No stock photography or filler illustration. The existing logo artwork is unchanged. Illustration is reserved for onboarding or an empty state only when it improves comprehension.
