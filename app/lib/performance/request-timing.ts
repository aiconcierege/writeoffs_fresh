import 'server-only'
import { AsyncLocalStorage } from 'node:async_hooks'

/** Request-local diagnostics only: never log URLs, queries, credentials or customer values. */
type Span = { name: string; start: number; duration: number }
const timing = new AsyncLocalStorage<{ start: number; spans: Span[]; memo:Map<string,Promise<unknown>>; reads:WeakMap<object,Map<string,Promise<unknown>>> }>()
export async function timed<T>(name: string, run: () => Promise<T>): Promise<T> {
  const state = timing.getStore(), start = performance.now()
  try { return await run() } finally {
    if (state) state.spans.push({ name, start: start - state.start, duration: performance.now() - start })
  }
}
export const timedSupabaseFetch: typeof fetch = (input, init) => {
  const state = timing.getStore()
  if (!state) return fetch(input, init)
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  // PostgREST resource identifiers are code-defined, never include filter/argument values.
  const path = url.pathname.split('/').filter(Boolean)
  const resource = path[0] === 'rest' ? path.slice(2).join('_') : 'auth'
  const name = `db_${resource.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 80)}`
  return timed(name, () => fetch(input, init))
}
export function timedRoute<Args extends unknown[]>(handler: (...args: Args) => Promise<Response>) {
  return (...args: Args): Promise<Response> => timing.run({ start: performance.now(), spans: [],memo:new Map(),reads:new WeakMap() }, async () => {
    const response = await handler(...args), state = timing.getStore()!
    const total = performance.now() - state.start
    // Header carries only aggregate durations. Detailed waterfall stays in staging diagnostics.
    const grouped = new Map<string, number>()
    for (const span of state.spans) grouped.set(span.name, (grouped.get(span.name) ?? 0) + span.duration)
    response.headers.set('Server-Timing', [`total;dur=${total.toFixed(1)}`, ...[...grouped].map(([name, duration]) => `${name};dur=${duration.toFixed(1)}`)].join(', '))
    if (process.env.WRITEOFFS_ENVIRONMENT === 'staging') response.headers.set('X-Betti-DB-Calls',String(state.spans.filter(s=>s.name.startsWith('db_')).length))
    if (process.env.WRITEOFFS_ENVIRONMENT === 'staging')
      console.info(JSON.stringify({ event: 'guided_request_timing', totalMs: Math.round(total), queryCount: state.spans.filter(s => s.name.startsWith('db_')).length, spans: state.spans }))
    return response
  })
}

/** Server-render diagnostics share the same request-local transport observations. */
export function timedRender<Args extends unknown[], Result>(name:string,render:(...args:Args)=>Promise<Result>){
 return (...args:Args):Promise<Result>=>timing.run({start:performance.now(),spans:[],memo:new Map(),reads:new WeakMap()},async()=>{
  try{return await render(...args)}finally{
   const state=timing.getStore()!
   if(process.env.WRITEOFFS_ENVIRONMENT==='staging')console.info(JSON.stringify({event:'guided_render_timing',name,totalMs:performance.now()-state.start,queryCount:state.spans.filter(s=>s.name.startsWith('db_')).length,spans:state.spans}))
  }
 })
}

/** Only for identity/entitlements stable during bookkeeping commands. Never cache
 * decisions, questions or projections across writes (or across requests). */
export function requestMemo<T>(key:string,run:()=>Promise<T>):Promise<T>{
 const state=timing.getStore();if(!state)return run()
 if(!state.memo.has(key))state.memo.set(key,run())
 return state.memo.get(key) as Promise<T>
}
export function requestRead<T>(owner:object,key:string,run:()=>Promise<T>):Promise<T>{
 const state=timing.getStore();if(!state)return run()
 let memo=state.reads.get(owner);if(!memo){memo=new Map();state.reads.set(owner,memo)}
 if(!memo.has(key))memo.set(key,run())
 return memo.get(key) as Promise<T>
}
