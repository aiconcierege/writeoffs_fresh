import { createReadStream } from 'node:fs'
import { open, stat } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { GetBucketLocationCommand, GetBucketVersioningCommand, GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { makeBackupObjectKey, sha256File } from './backup-common.mjs'

const need = (env, name) => { const value = env[name]; if (!value) throw new Error(`${name} is required.`); return value }

export function loadS3Config(env = process.env) {
  const bucket = need(env, 'WRITEOFFS_BACKUP_S3_BUCKET')
  const expectedBucket = need(env, 'WRITEOFFS_BACKUP_EXPECTED_S3_BUCKET')
  if (bucket !== expectedBucket) throw new Error('S3 bucket identity mismatch; refusing backup.')
  const region = need(env, 'WRITEOFFS_BACKUP_S3_REGION')
  const endpoint = env.WRITEOFFS_BACKUP_S3_ENDPOINT || undefined
  return {
    bucket, region, endpoint, prefix: env.WRITEOFFS_BACKUP_S3_PREFIX || '',
    credentials: { accessKeyId: need(env, 'WRITEOFFS_BACKUP_S3_ACCESS_KEY_ID'), secretAccessKey: need(env, 'WRITEOFFS_BACKUP_S3_SECRET_ACCESS_KEY') },
  }
}

export function makeS3Client(config) {
  return new S3Client({ region: config.region, endpoint: config.endpoint, credentials: config.credentials, forcePathStyle: Boolean(config.endpoint) })
}

export async function verifyS3Destination(client, config) {
  const [location, versioning] = await Promise.all([
    client.send(new GetBucketLocationCommand({ Bucket: config.bucket })),
    client.send(new GetBucketVersioningCommand({ Bucket: config.bucket })),
  ])
  const actualRegion = location.LocationConstraint || 'us-east-1'
  if (actualRegion !== config.region) throw new Error('S3 region identity mismatch; refusing backup.')
  if (versioning.Status !== 'Enabled') throw new Error('S3 bucket versioning is not enabled; refusing backup.')
}

export async function uploadBackup({ client, config, input, environment, backupClass = 'daily', key, uploaderFactory = options => new Upload(options) }) {
  await verifyS3Destination(client, config)
  const objectKey = key ?? makeBackupObjectKey({ prefix: config.prefix, environment, backupClass })
  const expectedPrefix = [config.prefix.replace(/^\/+|\/+$/g,''), environment, backupClass].filter(Boolean).join('/') + '/'
  if (!objectKey.startsWith(expectedPrefix) || !objectKey.endsWith('.wobak')) throw new Error('S3 backup key is outside the expected prefix.')
  const bytes = (await stat(input)).size
  const sha256 = await sha256File(input)
  const upload = uploaderFactory({ client, params: { Bucket: config.bucket, Key: objectKey, Body: createReadStream(input), ContentType: 'application/octet-stream', Metadata: { 'writeoffs-sha256': sha256, 'writeoffs-format': 'WOBAK01' }, ChecksumAlgorithm: 'SHA256' } })
  await upload.done()
  const head = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: objectKey }))
  if (Number(head.ContentLength) !== bytes || head.Metadata?.['writeoffs-sha256'] !== sha256) throw new Error('Uploaded S3 backup verification failed.')
  return { key: objectKey, bytes, sha256, versionId: head.VersionId ?? null }
}

export async function downloadBackup({ client, config, key, output, expectedSha256, expectedBytes }) {
  const response = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }))
  if (!response.Body) throw new Error('S3 backup download returned no body.')
  const handle = await open(output, 'wx', 0o600); await handle.close()
  await pipeline(response.Body, (await import('node:fs')).createWriteStream(output, { flags: 'w', mode: 0o600 }))
  const bytes = (await stat(output)).size; const sha256 = await sha256File(output)
  if ((expectedBytes != null && bytes !== expectedBytes) || (expectedSha256 && sha256 !== expectedSha256)) throw new Error('Downloaded S3 backup integrity check failed.')
  return { bytes, sha256 }
}
