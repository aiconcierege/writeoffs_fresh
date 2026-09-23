import {afterEach,expect,it,vi} from 'vitest'
import {presentConversationTurn} from '../../app/components/guided/present-conversation-turn'
afterEach(()=>vi.unstubAllGlobals())
it.each([false,true])('brings the new merchant into view and focuses its question (reduced=%s)',reduced=>{
 const focus=vi.fn(),scrollBy=vi.fn()
 const heading={tabIndex:0,focus,getBoundingClientRect:()=>({bottom:260})}
 const merchant={getBoundingClientRect:()=>({top:-210})}
 const root={querySelector:(selector:string)=>selector==='h1'?heading:merchant}
 vi.stubGlobal('window',{innerHeight:800,scrollBy,matchMedia:()=>({matches:reduced})})
 presentConversationTurn(root as unknown as HTMLElement)
 expect(focus).toHaveBeenCalledWith({preventScroll:true})
 expect(heading.tabIndex).toBe(-1)
 expect(scrollBy).toHaveBeenCalledExactlyOnceWith({top:-306,behavior:reduced?'instant':'smooth'})
})
it('does not jump when merchant and question already fit the viewport',()=>{
 const scrollBy=vi.fn(),focus=vi.fn()
 vi.stubGlobal('window',{innerHeight:800,scrollBy})
 presentConversationTurn({querySelector:(s:string)=>s==='h1'?{focus,getBoundingClientRect:()=>({bottom:400})}:{getBoundingClientRect:()=>({top:120})}} as unknown as HTMLElement)
 expect(focus).toHaveBeenCalledOnce();expect(scrollBy).not.toHaveBeenCalled()
})
it('does not move focus during a pending turn without a question',()=>{
 const scrollBy=vi.fn();vi.stubGlobal('window',{scrollBy})
 presentConversationTurn({querySelector:()=>null} as unknown as HTMLElement)
 expect(scrollBy).not.toHaveBeenCalled()
})
