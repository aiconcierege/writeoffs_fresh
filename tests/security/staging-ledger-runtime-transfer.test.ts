import {describe,it,expect,vi} from 'vitest'
import {configureStagingLedgerRuntime,runtimeSecretNames} from '../../scripts/backup/configure-staging-ledger-runtime.mjs'
const env=()=>({NODE_ENV:'test',GITHUB_REPOSITORY:'aiconcierege/writeoffs_fresh',GITHUB_REF:'refs/heads/v2-onboarding-staging',GITHUB_EVENT_NAME:'workflow_dispatch',WRITEOFFS_TEMP_VERCEL_TRANSFER_TOKEN:'synthetic-transfer',WRITEOFFS_DELETION_LEDGER_ACCESS_KEY_ID:'synthetic-id',WRITEOFFS_DELETION_LEDGER_SECRET_ACCESS_KEY:'synthetic-secret',WRITEOFFS_DELETION_LEDGER_KEY_BASE64:Buffer.alloc(32,1).toString('base64')} as NodeJS.ProcessEnv)
function fixture(options:{wrongProject?:boolean;existing?:boolean;recovery?:boolean;error?:boolean}={}){
 let rows: {key:string;type:string;target:string[]}[]=options.existing?[{key:runtimeSecretNames[0],type:'sensitive',target:['production']}]:options.recovery?[{key:'WRITEOFFS_DELETION_LEDGER_RECOVERY_ACCESS_KEY_ID',type:'sensitive',target:['production']}]:[]
 const request=vi.fn(async(url:RequestInfo|URL,init?:RequestInit)=>{
  expect(String(url)).toContain('prj_o56739F1pzd0TjFirEYoLMaa6oIJ')
  expect(String(url)).toContain('teamId=team_ojiYZAVSayMNkwJNRKLyKKRG')
  if(options.error)return new Response(JSON.stringify({secret:'must-not-surface'}),{status:403})
  if(init?.method==='POST'){rows=JSON.parse(String(init.body));return Response.json({envs:rows})}
  if(String(url).includes('/env?'))return Response.json({envs:rows})
  return Response.json({id:'prj_o56739F1pzd0TjFirEYoLMaa6oIJ',name:options.wrongProject?'real-production':'writeoffs-fresh-staging',accountId:'team_ojiYZAVSayMNkwJNRKLyKKRG'})
 })
 return {request}
}
describe('protected staging-only runtime transfer',()=>{
 it('transfers only approved existing secrets as sensitive variables with fixed source',async()=>{
  const {request}=fixture();const source=env();const result=await configureStagingLedgerRuntime({env:source,request})
  expect(result.result).toBe('PASS');expect(JSON.stringify(result)).not.toContain('synthetic-secret')
  const calls=request.mock.calls.filter(([,init])=>init?.method==='POST');expect(calls).toHaveLength(1)
  const rows=JSON.parse(String(calls[0][1]?.body));expect(rows.map((r:{key:string})=>r.key)).toEqual([...runtimeSecretNames,'WRITEOFFS_DELETION_LEDGER_SOURCE'])
  for(const row of rows.slice(0,3)){expect(row.type).toBe('sensitive');expect(row.target).toEqual(['production']);expect(row.value).toBe(source[row.key])}
 })
 it.each([{wrongProject:true},{existing:true},{recovery:true}])('rejects wrong binding or unsafe existing state %j',async options=>{const {request}=fixture(options);await expect(configureStagingLedgerRuntime({env:env(),request})).rejects.toThrow();expect(request.mock.calls.some(([,i])=>i?.method==='POST')).toBe(false)})
 it('does not expose provider error body',async()=>{const {request}=fixture({error:true});await expect(configureStagingLedgerRuntime({env:env(),request})).rejects.toThrow('RUNTIME_TRANSFER_HTTP_403')})
 it('rejects main and recovery credentials before network',async()=>{const {request}=fixture();await expect(configureStagingLedgerRuntime({env:{...env(),GITHUB_REF:'refs/heads/main'},request})).rejects.toThrow('RUNNER_REQUIRED');await expect(configureStagingLedgerRuntime({env:{...env(),WRITEOFFS_DELETION_LEDGER_RECOVERY_ACCESS_KEY_ID:'forbidden'},request})).rejects.toThrow('RECOVERY_FORBIDDEN');expect(request).not.toHaveBeenCalled()})
})
