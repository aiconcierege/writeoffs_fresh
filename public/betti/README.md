# Approved Betti production assets

This directory contains the approved Betti the Bookkeeper artwork. It must not
contain generated substitutes, generic turtle icons, or modifications to the
immutable WriteOffs logo.

The application uses these approved transparent PNG illustrations:

- `betti-working.png`
- `betti-question.png`
- `betti-caught-up.png`
- `betti-welcome.png`

Keep Betti separate from the WriteOffs logo. Do not redraw, recolor, or
construct new poses in application code. Canonical Betti is a natural green
turtle with a brown shell, brown eyes, thick black glasses, subtle feminine
features, and polished coral leather sneakers. She wears no clothing and no
logo or standalone W mark. All four production files are transparent PNGs;
approved atmospheric shading within an illustration is part of the artwork.

The historical ` betti-working.webp` mockup may remain as a design reference,
but it is not a production asset and must never be rendered by the application.

The application renders these files only through
`app/components/BettiIllustration.tsx`.

## Composition rule

Betti must never be unintentionally cropped by a layout or section boundary.
Every full-body state must keep her head and glasses, shell, hands, legs, and
shoes readable. Betti may intentionally break a section or surface boundary
when that improves the composition or connects adjacent sections. Prefer
controlled overflow and deliberate layering over clipping, and do not use
`overflow: hidden` on a Betti composition when it cuts off the character. Do
not shrink a full-body Betti solely to force her inside a rectangular
container.

An intentional close-up, headshot, or partial-character crop is allowed only
when the design explicitly calls for it. Responsive layout must not create an
accidental crop.
