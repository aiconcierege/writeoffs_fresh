import {it,expect,vi,afterEach} from 'vitest'
import {timedRoute,timedSupabaseFetch,requestMemo,requestRead} from '../../app/lib/performance/request-timing'
afterEach(()=>vi.unstubAllGlobals())
it('keeps concurrent request metrics isolated and excludes filters, credentials and bodies',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('{}')))
 const run=timedRoute(async(name:string)=>{await timedSupabaseFetch(`https://private.invalid/rest/v1/${name}?customer=secret`,{headers:{authorization:'private-token'},body:'private-fact',method:'POST'});return Response.json({ok:true})})
 const[a,b]=await Promise.all([run('bookkeeping_records'),run('businesses')])
 expect(a.headers.get('server-timing')).toContain('db_bookkeeping_records')
 expect(a.headers.get('server-timing')).not.toContain('db_businesses')
 expect(b.headers.get('server-timing')).not.toContain('db_bookkeeping_records')
 for(const r of [a,b])expect(r.headers.get('server-timing')).not.toMatch(/secret|private|customer|token|fact/)
})
it('does not alter network requests outside a measured route',async()=>{
 const fetcher=vi.fn(async()=>new Response('{}'));vi.stubGlobal('fetch',fetcher)
 await timedSupabaseFetch('https://private.invalid/rest/v1/businesses')
 expect(fetcher).toHaveBeenCalledOnce()
})

it('shares only request-local identity reads, never another request or client',async()=>{
 const clientA={},clientB={},read=vi.fn(async()=>({value:Math.random()}))
 const handler=timedRoute(async()=>{
  const[a,b,c]=await Promise.all([requestRead(clientA,'identity',read),requestRead(clientA,'identity',read),requestRead(clientB,'identity',read)])
  expect(a).toBe(b);expect(a).not.toBe(c)
  const[x,y]=await Promise.all([requestMemo('db',read),requestMemo('db',read)]);expect(x).toBe(y)
  return Response.json({ok:true})
 })
 await handler();expect(read).toHaveBeenCalledTimes(3)
 await handler();expect(read).toHaveBeenCalledTimes(6)
})
