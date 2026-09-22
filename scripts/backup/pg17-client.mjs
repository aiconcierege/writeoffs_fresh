#!/usr/bin/env node
import {spawn} from 'node:child_process'
import {isAbsolute,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'

export const pg17Image='postgres:17.6-bookworm'
export function pg17Arguments(command,args,env){
 if(!['psql','pg_restore'].includes(command))throw new Error('DR_CLIENT_NOT_ALLOWED')
 const version=args.length===1&&args[0]==='--version'
 const root=env.WRITEOFFS_DR_WORK_DIRECTORY
 if(!version&&(!root||!isAbsolute(root)||!/^writeoffs-hosted-dr-[a-zA-Z0-9]+$/.test(root.split('/').at(-1))||/[\r\n,:]/.test(root)||resolve(root)!==root))throw new Error('DR_CLIENT_WORK_DIRECTORY_REQUIRED')
 const docker=['run','--rm','-i','--network','host']
 if(!version)docker.push('--mount',`type=bind,source=${root},target=${root},readonly`)
 for(const name of ['PGHOST','PGPORT','PGUSER','PGDATABASE','PGPASSWORD','PGSSLMODE','PGSSLROOTCERT','PGCONNECT_TIMEOUT'])if(env[name])docker.push('--env',name)
 return [...docker,pg17Image,command,...args]
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const args=pg17Arguments(process.argv[2],process.argv.slice(3),process.env)
  const child=spawn('docker',args,{stdio:'inherit',env:process.env})
  child.on('error',()=>{console.error('DR_CLIENT_START_FAILED');process.exitCode=1})
  child.on('exit',code=>{process.exitCode=code??1})
 }catch{console.error('DR_CLIENT_CONFIGURATION_INVALID');process.exitCode=1}
}
