import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { posix } from 'node:path'

export const sha256File = async path => createHash('sha256').update(await readFile(path)).digest('hex')

export function safeRelativePath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.startsWith('/') || value.includes('\0')) {
    throw new Error('Unsafe backup object path.')
  }
  const normalized = posix.normalize(value)
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../') || normalized !== value) {
    throw new Error('Unsafe backup object path.')
  }
  return normalized
}

export function projectRefFromUrl(value) {
  const host = new URL(value).hostname
  const match = host.match(/^([a-z0-9-]+)\.supabase\.co$/)
  if (!match) throw new Error('Supabase URL is not a hosted project URL.')
  return { host, ref: match[1] }
}

export function assertExpectedSupabaseProject(url, expectedRef) {
  if (!expectedRef) throw new Error('WRITEOFFS_BACKUP_EXPECTED_SUPABASE_PROJECT_REF is required.')
  const identity = projectRefFromUrl(url)
  if (identity.ref !== expectedRef) throw new Error('Supabase project identity mismatch; refusing backup.')
  return identity
}

export function assertExpectedDatabaseProject(url, expectedRef) {
  if (!url || !expectedRef) throw new Error('Database URL and expected Supabase project are required.')
  const parsed = new URL(url)
  const host = parsed.hostname
  const port = parsed.port || '5432'
  const direct = host === `db.${expectedRef}.supabase.co` && parsed.username === 'postgres' && port === '5432'
  const pooler = host.endsWith('.pooler.supabase.com') && parsed.username === `postgres.${expectedRef}` && port === '5432'
  if (!direct && !pooler) throw new Error('Database project identity mismatch; refusing backup.')
}

export function sourceFingerprint(environment, projectRef) {
  return createHash('sha256').update(`writeoffs-backup-source:v1:${environment}:${projectRef}`).digest('hex')
}

export function makeBackupObjectKey({ prefix = '', environment, backupClass = 'daily', now = new Date(), id = randomUUID() }) {
  if (!['staging', 'production'].includes(environment)) throw new Error('Backup environment must be staging or production.')
  if (!['daily', 'weekly', 'monthly'].includes(backupClass)) throw new Error('Unsupported backup class.')
  const iso = now.toISOString()
  const datePath = iso.slice(0, 10).replaceAll('-', '/')
  const timestamp = iso.replaceAll(':', '').replaceAll('-', '').replace('.000', '')
  const cleanPrefix = prefix.replace(/^\/+|\/+$/g, '')
  return [cleanPrefix, environment, backupClass, datePath, `${timestamp}-${id}.wobak`].filter(Boolean).join('/')
}
