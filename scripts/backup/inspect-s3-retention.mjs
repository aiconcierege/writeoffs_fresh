#!/usr/bin/env node
import {pathToFileURL} from 'node:url'
import {
 GetBucketLocationCommand,GetBucketVersioningCommand,GetBucketEncryptionCommand,
 GetBucketLifecycleConfigurationCommand,GetObjectLockConfigurationCommand,
 GetPublicAccessBlockCommand,GetBucketPolicyStatusCommand,ListObjectVersionsCommand,
 ListMultipartUploadsCommand,HeadObjectCommand,GetObjectLegalHoldCommand,
} from '@aws-sdk/client-s3'
import {loadS3Config,makeS3Client} from './s3-transfer.mjs'

// Read-only. Permission failures are evidence gaps, never treated as absent controls.
export async function inspectBackupRetention(client,config){
 const reads=[['location',GetBucketLocationCommand],['versioning',GetBucketVersioningCommand],
  ['encryption',GetBucketEncryptionCommand],['lifecycle',GetBucketLifecycleConfigurationCommand],
  ['objectLock',GetObjectLockConfigurationCommand],['publicAccess',GetPublicAccessBlockCommand],['policyStatus',GetBucketPolicyStatusCommand]]
 const result={bucket:config.bucket,region:config.region,inspectedAt:new Date().toISOString(),mode:'READ_ONLY',checks:{},scope:'staging backup prefixes only',expirationObserved:false}
 const clean=value=>JSON.parse(JSON.stringify(value,(key,value)=>key==='$metadata'?undefined:value))
 const inspect=async(name,command)=>{try{const value=await client.send(command);result.checks[name]={verified:true,value:clean(value)};return value}catch(error){result.checks[name]={verified:false,errorCode:/^[A-Za-z0-9_]+$/.test(error?.name??'')?error.name:'READ_FAILED'};return null}}
 await Promise.all(reads.map(async([name,Command])=>inspect(name,new Command({Bucket:config.bucket}))))
 const prefix=[config.prefix.replace(/^\/+|\/+$/g,''),'staging'].filter(Boolean).join('/')+'/'
 const versions=await inspect('representativeVersions',new ListObjectVersionsCommand({Bucket:config.bucket,Prefix:prefix,MaxKeys:20}))
 await inspect('incompleteUploads',new ListMultipartUploadsCommand({Bucket:config.bucket,Prefix:prefix,MaxUploads:20}))
 const sample=versions?.Versions?.find(v=>v.Key?.endsWith('.wobak'))
 if(sample){await inspect('representativeObject',new HeadObjectCommand({Bucket:config.bucket,Key:sample.Key,VersionId:sample.VersionId}));await inspect('representativeLegalHold',new GetObjectLegalHoldCommand({Bucket:config.bucket,Key:sample.Key,VersionId:sample.VersionId}))}
 return result
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const config=loadS3Config();if(config.bucket!=='writeoffs-backups-264524064115-us-east-2-an'||config.region!=='us-east-2')throw new Error('UNAPPROVED_BACKUP_TARGET');console.log(JSON.stringify(await inspectBackupRetention(makeS3Client(config),config),null,2))}
 catch{console.error('Backup retention inspection failed; no configuration was changed.');process.exitCode=1}
}
