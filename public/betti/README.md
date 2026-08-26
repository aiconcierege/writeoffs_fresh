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
construct new poses in application code. Working and Question are transparent
cutouts; Caught Up and Welcome include an approved translucent atmospheric glow.

The application renders these files only through
`app/components/BettiIllustration.tsx`.
