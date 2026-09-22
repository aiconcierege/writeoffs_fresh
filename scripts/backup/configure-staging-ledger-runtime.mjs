import {pathToFileURL} from 'node:url'
export const runtimeSecretNames=['WRITEOFFS_DELETION_LEDGER_ACCESS_KEY_ID','WRITEOFFS_DELETION_LEDGER_SECRET_ACCESS_KEY','WRITEOFFS_DELETION_LEDGER_KEY_BASE64']
const project='prj_o56739F1pzd0TjFirEYoLMaa6oIJ',team='team_ojiYZAVSayMNkwJNRKLyKKRG'
export async function configureStagingLedgerRuntime({env,request=fetch}){
 if(env.GITHUB_REPOSITORY!=='aiconcierege/writeoffs_fresh'||env.GITHUB_REF!=='refs/heads/v2-onboarding-staging'||env.GITHUB_EVENT_NAME!=='workflow_dispatch')throw Error('RUNTIME_TRANSFER_RUNNER_REQUIRED')
 if(!env.WRITEOFFS_TEMP_VERCEL_TRANSFER_TOKEN||runtimeSecretNames.some(name=>!env[name]))throw Error('RUNTIME_TRANSFER_SOURCE_MISSING')
 if(Object.keys(env).some(name=>name.startsWith('WRITEOFFS_DELETION_LEDGER_RECOVERY_')&&env[name]))throw Error('RUNTIME_TRANSFER_RECOVERY_FORBIDDEN')
 const key=Buffer.from(env.WRITEOFFS_DELETION_LEDGER_KEY_BASE64,'base64')
 try{if(key.length!==32||key.toString('base64')!==env.WRITEOFFS_DELETION_LEDGER_KEY_BASE64)throw Error('RUNTIME_TRANSFER_KEY_INVALID')}finally{key.fill(0)}
 const api=async(path,method='GET',body)=>{
  let r;try{r=await request(`https://api.vercel.com${path}?teamId=${team}`,{method,headers:{Authorization:`Bearer ${env.WRITEOFFS_TEMP_VERCEL_TRANSFER_TOKEN}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)})}catch{throw Error('RUNTIME_TRANSFER_NETWORK_FAILED')}
  if(!r.ok)throw Error(`RUNTIME_TRANSFER_HTTP_${r.status}`)
  try{return await r.json()}catch{throw Error('RUNTIME_TRANSFER_RESPONSE_INVALID')}
 }
 const binding=await api(`/v9/projects/${project}`)
 if(binding.id!==project||binding.name!=='writeoffs-fresh-staging'||binding.accountId!==team)throw Error('RUNTIME_TRANSFER_TARGET_MISMATCH')
 const inventory=async()=>{const data=await api(`/v9/projects/${project}/env`);if(!Array.isArray(data.envs))throw Error('RUNTIME_TRANSFER_INVENTORY_INVALID');return data.envs.map(({key,type,target})=>({key,type,target}))}
 const before=await inventory()
 if(before.some(e=>e.key.startsWith('WRITEOFFS_DELETION_LEDGER_RECOVERY_')))throw Error('RUNTIME_TRANSFER_RECOVERY_PRESENT')
 const names=[...runtimeSecretNames,'WRITEOFFS_DELETION_LEDGER_SOURCE']
 // Never overwrite an existing value. A partial prior transfer requires explicit diagnosis.
 if(before.some(e=>names.includes(e.key)))throw Error('RUNTIME_TRANSFER_ALREADY_PRESENT')
 const values=runtimeSecretNames.map(key=>({key,value:env[key],type:'sensitive',target:['production']}))
 values.push({key:'WRITEOFFS_DELETION_LEDGER_SOURCE',value:'staging',type:'plain',target:['production']})
 await api(`/v10/projects/${project}/env`,'POST',values)
 const after=await inventory()
 for(const name of names){const matches=after.filter(e=>e.key===name);if(matches.length!==1||matches[0].target?.length!==1||matches[0].target[0]!=='production'||matches[0].type!==(name.endsWith('_SOURCE')?'plain':'sensitive'))throw Error('RUNTIME_TRANSFER_VERIFICATION_FAILED')}
 if(after.some(e=>e.key.startsWith('WRITEOFFS_DELETION_LEDGER_RECOVERY_')))throw Error('RUNTIME_TRANSFER_RECOVERY_PRESENT')
 return {result:'PASS',project,primarySlotOfDedicatedStagingOnly:true,secretNames:runtimeSecretNames,sensitive:true,source:'staging',recoveryCredentialsPresent:false,valuesDisplayed:false,keyRegenerated:false,functionalCertificationPending:true}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{console.log(JSON.stringify(await configureStagingLedgerRuntime({env:process.env})))}catch(e){console.error(JSON.stringify({result:'FAIL',code:/^RUNTIME_TRANSFER_[A-Z0-9_]+$/.test(e.message)?e.message:'RUNTIME_TRANSFER_FAILED'}));process.exitCode=1}}
