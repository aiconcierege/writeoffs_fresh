import {readFile,writeFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
const path=process.argv[2];assert(path,'Provide the synthetic browser trace')
const events=(await readFile(path,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse)
const documents=[...new Set(events.map(e=>e.doc))],transitions=[],failures=[]
for(const doc of documents){
 let previous=null,lastCommit=-1,lastFailure=-1
 for(const e of events.filter(e=>e.doc===doc).sort((a,b)=>a.at-b.at)){
  if(e.kind==='response'&&e.method==='POST'&&e.status===200)lastCommit=e.at
  if(e.kind==='request-failed'||e.kind==='response'&&e.status>=400)lastFailure=e.at
  if(e.kind!=='visible')continue
  // SSR hydration may populate the diagnostic ID later. It is not a second
  // question if the actual version/text have not changed.
  if(previous?.version===e.version&&previous?.heading===e.heading){previous={...previous,...e};continue}
  if(previous?.version&&previous.heading&&previous.version!==e.version){
   const cause=lastCommit>previous.at?'canonical-command':lastFailure>previous.at&&e.notice?'explained-recovery':e.notice&&e.notice!==previous.notice?'explained-canonical-change':null
   const transition={doc,from:previous.id,fromVersion:previous.version,to:e.id,toVersion:e.version,visibleForMs:e.at-previous.at,cause,notice:e.notice}
   transitions.push(transition);if(!cause)failures.push(transition)
  }
  previous=e
 }
}
const report={documents:documents.length,visibleEvents:events.filter(e=>e.kind==='visible').length,transitions,unexplainedWithdrawals:failures}
await writeFile(path+'.report.json',JSON.stringify(report,null,2))
console.log(JSON.stringify({documents:report.documents,visibleEvents:report.visibleEvents,transitions:transitions.length,unexplainedWithdrawals:failures.length}))
if(failures.length)process.exitCode=1
