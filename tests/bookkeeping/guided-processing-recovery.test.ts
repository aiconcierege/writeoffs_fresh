import * as React from 'react'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
import {GuidedWork} from '../../app/components/guided/GuidedWork'
import {homeWorkFixture} from '../fixtures/home-command'
const hooks=vi.hoisted(()=>({effects:[] as Array<()=>void|(()=>void)>,setters:[] as Array<ReturnType<typeof vi.fn>>}))
vi.mock('../../app/documents/DocumentIntake',()=>({DocumentIntake:()=>null}))
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}))
vi.mock('react',async importOriginal=>({
 ...await importOriginal<typeof import('react')>(),
 useEffect:(effect:()=>void|(()=>void))=>hooks.effects.push(effect),
 useRef:(value:unknown)=>({current:value}),
 useCallback:(callback:unknown)=>callback,
 useState:(value:unknown)=>{const setter=vi.fn();hooks.setters.push(setter);return[typeof value==='function'?value():value,setter]},
}))
let cleanup:Array<()=>void>=[]
beforeEach(()=>{
 vi.useFakeTimers();hooks.effects=[];hooks.setters=[]
 vi.stubGlobal('React',React);vi.stubGlobal('document',{visibilityState:'visible'})
 vi.stubGlobal('window',{addEventListener:vi.fn(),removeEventListener:vi.fn()})
 vi.stubGlobal('sessionStorage',{getItem:()=>null,setItem:vi.fn()})
})
afterEach(()=>{cleanup.forEach(fn=>fn());cleanup=[];vi.useRealTimers();vi.unstubAllGlobals()})
function start(initialWork=homeWorkFixture('processing')){
 const ready=homeWorkFixture('concurrent'),fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>ready})
 vi.stubGlobal('fetch',fetcher)
 const view=GuidedWork({initialWork,recordId:'entry-record'})
 cleanup=hooks.effects.flatMap(effect=>{const dispose=effect();return typeof dispose==='function'?[dispose]:[]})
 return{ready,fetcher,view}
}
it('automatically reads ready work after a short processing gap without a command or navigation',async()=>{
 const{ready,fetcher}=start();await vi.advanceTimersByTimeAsync(500)
 expect(fetcher).toHaveBeenCalledOnce();expect(hooks.setters[0]).toHaveBeenCalledWith(ready)
 expect(fetcher.mock.calls[0][0]).toBe('/api/bookkeeping/work?view=guided&record=entry-record')
 expect(fetcher.mock.calls[0][1].method).toBeUndefined()
})
it('bounds automatic processing reads without limiting completed customer actions',async()=>{
 const{fetcher}=start();await vi.advanceTimersByTimeAsync(240000)
 expect(fetcher).toHaveBeenCalledTimes(12)
})
it('stops background reads when the customer leaves',async()=>{
 const{fetcher}=start();cleanup.forEach(fn=>fn());cleanup=[]
 await vi.advanceTimersByTimeAsync(60000);expect(fetcher).not.toHaveBeenCalled()
})

it('does not spend projection reads while the customer is considering ready work',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher)
 GuidedWork({initialWork:homeWorkFixture('concurrent')})
 cleanup=hooks.effects.flatMap(effect=>{const dispose=effect();return typeof dispose==='function'?[dispose]:[]})
 await vi.advanceTimersByTimeAsync(240000);expect(fetcher).not.toHaveBeenCalled()
})


it('does not preempt a ready action while workers run, but refreshes when the customer returns',async()=>{
 const ready=homeWorkFixture('concurrent')
 const{fetcher,view}=start({...homeWorkFixture('processing'),nextAction:ready.nextAction})
 expect(view.props['data-guided-action']).toBe(ready.nextAction?.type)
 await vi.advanceTimersByTimeAsync(240000)
 expect(fetcher).not.toHaveBeenCalled()
 const focus=vi.mocked(window.addEventListener).mock.calls.find(([event])=>event==='focus')?.[1] as ()=>Promise<void>
 await focus()
 expect(fetcher).toHaveBeenCalledOnce()
})

it('includes the exact displayed identity in a focus refresh instead of requesting a new recommendation',async()=>{
 const ready=homeWorkFixture('concurrent');const{fetcher}=start(ready)
 const focus=vi.mocked(window.addEventListener).mock.calls.find(([event])=>event==='focus')?.[1] as ()=>Promise<void>
 await focus()
 const url=new URL(fetcher.mock.calls[0][0],'https://example.test')
 expect(url.searchParams.get('presented')).toBe(ready.nextAction?.id)
 expect(url.searchParams.get('presentedVersion')).toBe(ready.nextAction?.version)
})

it('discards an in-flight focus read when an ordinary answer starts',async()=>{
 const{fetcher,view}=start(homeWorkFixture('concurrent'))
 let finish!:(value:unknown)=>void
 fetcher.mockReturnValueOnce(new Promise(resolve=>{finish=resolve}))
 const focus=vi.mocked(window.addEventListener).mock.calls.find(([event])=>event==='focus')?.[1] as ()=>Promise<void>
 const reading=focus()
 const findPending=(node:unknown):((busy:boolean)=>void)|undefined=>{
  if(!node||typeof node!=='object')return
  if(Array.isArray(node)){for(const child of node){const found=findPending(child);if(found)return found}return}
  const props=(node as {props?:{onGuidedPending?:(busy:boolean)=>void;children?:unknown}}).props
  return props?.onGuidedPending??findPending(props?.children)
 }
 const pending=findPending(view);expect(pending).toBeTypeOf('function');pending!(true)
 finish({ok:true,json:async()=>homeWorkFixture('organized')});await reading
 expect(hooks.setters[0]).not.toHaveBeenCalled()
})
