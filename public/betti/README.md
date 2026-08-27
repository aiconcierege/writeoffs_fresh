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
