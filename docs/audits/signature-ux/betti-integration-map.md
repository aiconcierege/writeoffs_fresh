# Approved Betti integration boundary — preparation only

No Rive file or runtime is included in this change.

## Boundary

Keep `app/components/experience/BettiPresence.tsx` as the single page-facing boundary. Home and the persistent conversation stage already reserve the illustration's space. A future approved renderer replaces the boundary's static interior, not the page composition.

| Product intent | Existing static state | Future animation intent (must be verified in revised delivery) |
| --- | --- | --- |
| First use | welcome | idle/customer-facing |
| Ready question / needs you | question | attention toward work |
| Pending answer | existing persistent artwork | brief acknowledgment/nod |
| Actual background work | working | working/thinking |
| No more ready work / supported completion | caught-up | relaxed/success |

These are desired intents, not claims about the unapproved file. Map only states actually delivered; otherwise retain the approved static image.

## Rendering contract

- Preserve the current 37/63 desktop stage and its image frame. Desktop frame is 35rem high, 30rem on smaller desktops; compact tablet/mobile frame is 104 × 96 CSS px. Home keeps its own reserved responsive frame through the same boundary.
- Use contain fitting; preserve character proportions, transparent background and safe internal padding. Direction toward work is a presentation input, not a bookkeeping state.
- Lazy-load a future approved runtime off the command path. Never wait for animation loading/completion before rendering an action.
- Pending click may trigger acknowledgment; only successful canonical persistence may claim an answer saved. A new canonical ready action returns attention toward work.
- Respect reduced motion with the existing static asset. Pause offscreen and when the document is hidden. Runtime/load failure keeps the static fallback.
- Character is decorative when adjacent text communicates the same status: empty alt/aria-hidden. Keep status announcements in the current text region; animation never conveys unique information.
- No page-level Rive APIs. No action writes, timers, prioritization or question eligibility inside the character component.
