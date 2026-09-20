import {appendFile,mkdir} from 'node:fs/promises'

/** Observe paintable identities, not just the action returned by an API. Records
 * contain synthetic action identifiers and UI notices, never auth/request bodies. */
export async function recordVisibleBettiActions(context,path){
 await mkdir(path.slice(0,path.lastIndexOf('/')),{recursive:true})
 await context.exposeBinding('__recordVisibleBetti',async(_source,event)=>{
  await appendFile(path,JSON.stringify(event)+'\n')
 })
 await context.addInitScript(()=>{
  const doc=crypto.randomUUID(),emit=event=>void window.__recordVisibleBetti({doc,at:performance.now(),wallTime:Date.now(),...event})
  let previous='',scheduled=false
  const inspect=()=>{
   scheduled=false
   const root=document.querySelector('[data-guided-action]')
   if(!root||!root.getClientRects().length)return
   const version=root.getAttribute('data-guided-version')
   let id=root.getAttribute('data-guided-id')
   // Read-only compatibility for BEFORE deployment, which lacks data-guided-id.
   if(version&&!id){const key=Object.keys(root).find(k=>k.startsWith('__reactFiber$'))
    for(let f=root[key];f&&!id;f=f.return)for(const candidate of [f,f.alternate]){
     for(let h=candidate?.memoizedState;h;h=h.next){const a=h.memoizedState?.nextAction;if(a?.version===version){id=a.id;break}}
    }
   }
   const heading=document.querySelector('.betti-active-conversation h1')?.textContent
   const identity=JSON.stringify([id,version,root.getAttribute('data-guided-action'),heading])
   if(identity===previous)return
   previous=identity
   emit({kind:'visible',id,version,state:root.getAttribute('data-guided-action'),presentation:root.getAttribute('data-guided-presentation'),
    notice:document.querySelector('.betti-saved')?.textContent?.trim(),heading,questionVisible:Boolean(version&&heading),
    navigationCount:performance.getEntriesByType('navigation').length,scrollY})
  }
  new MutationObserver(()=>{if(!scheduled){scheduled=true;requestAnimationFrame(inspect)}}).observe(document,{subtree:true,childList:true,attributes:true,characterData:true})
  document.addEventListener('click',event=>{const button=event.target.closest?.('.betti-work button');if(button)emit({kind:'click',label:button.textContent.trim()})},true)
  document.addEventListener('change',event=>{if(event.target.type==='file')emit({kind:'upload',files:event.target.files.length})},true)
  window.addEventListener('focus',()=>emit({kind:'focus'}))
  window.addEventListener('pagehide',()=>emit({kind:'pagehide'}))
  const fetchOriginal=window.fetch
  window.fetch=async(...args)=>{
   const url=new URL(typeof args[0]==='string'?args[0]:args[0].url??args[0],location.href)
   const method=args[1]?.method??(args[0] instanceof Request?args[0].method:'GET')
   const relevant=url.origin===location.origin&&url.pathname.startsWith('/api/bookkeeping/')
   if(relevant)emit({kind:'request',path:url.pathname,method,presented:url.searchParams.get('presented')})
   let response
   try{response=await fetchOriginal(...args)}catch(error){if(relevant)emit({kind:'request-failed',path:url.pathname,method,error:error.name});throw error}
   if(relevant){emit({kind:'response',path:url.pathname,method,status:response.status})
    void response.clone().json().then(data=>{const work=data.work??data;emit({kind:'projection',id:work.nextAction?.id,version:work.nextAction?.version,presentation:work.presentation?.status,index:work.index})}).catch(()=>{})
   }
   return response
  }
 })
}
