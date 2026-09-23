/** Focus the new question without losing its financial context above the heading.
 * Scroll only when context is outside the viewport; never move an already visible
 * turn. Reduced motion receives an immediate, nonanimated positioning change. */
export function presentConversationTurn(root: HTMLElement) {
 const heading=root.querySelector<HTMLElement>('h1')
 if(!heading)return
 heading.tabIndex=-1
 heading.focus({preventScroll:true})
 const context=root.querySelector<HTMLElement>('#guided-transaction')??heading
 const top=context.getBoundingClientRect().top
 const bottom=heading.getBoundingClientRect().bottom
 const margin=96 // Includes the authenticated header and comfortable reading space.
 if(top>=margin&&bottom<=window.innerHeight-24)return
 window.scrollBy({top:top-margin,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})
}
