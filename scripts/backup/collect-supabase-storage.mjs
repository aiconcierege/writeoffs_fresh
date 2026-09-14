#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { mkdir, open, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { assertExpectedSupabaseProject, safeRelativePath, sha256File } from './backup-common.mjs'

const need = name => { const value = process.env[name]; if (!value) throw new Error(`${name} is required.`); return value }

export async function listStorageInventory(bucket, prefix = '') {
  const inventory = []
  async function walk(current) {
    for (let offset = 0;; offset += 100) {
      const { data, error } = await bucket.list(current, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } })
      if (error) throw new Error('Supabase Storage inventory failed.')
      const entries = data ?? []
      for (const entry of entries) {
        const path = safeRelativePath(current ? `${current}/${entry.name}` : entry.name)
        if (entry.id == null) await walk(path)
        else inventory.push({ path, id: String(entry.id), updatedAt: entry.updated_at ?? null, bytes: Number(entry.metadata?.size ?? -1) })
      }
      if (entries.length < 100) break
    }
  }
  await walk(prefix)
  return inventory.sort((a, b) => a.path.localeCompare(b.path))
}

const signature = inventory => JSON.stringify(inventory.map(({ path, id, updatedAt, bytes }) => [path, id, updatedAt, bytes]))

export async function collectSupabaseStorage({ bucket, output, prefixes = ['receipts', 'statements'] }) {
  const target = resolve(output)
  await mkdir(target, { recursive: true, mode: 0o700 })
  const before = (await Promise.all(prefixes.map(prefix => listStorageInventory(bucket, prefix)))).flat().sort((a,b)=>a.path.localeCompare(b.path))
  const seen = new Set()
  try {
    for (const object of before) {
      if (seen.has(object.path)) throw new Error('Duplicate Supabase Storage object path.')
      seen.add(object.path)
      const { data, error } = await bucket.download(object.path)
      if (error || !data) throw new Error(`Supabase Storage download failed: ${object.path}`)
      const destination = join(target, safeRelativePath(object.path))
      await mkdir(dirname(destination), { recursive: true, mode: 0o700 })
      const handle = await open(destination, 'wx', 0o600)
      await handle.write(Buffer.from(await data.arrayBuffer())); await handle.close()
      const actualBytes = (await import('node:fs/promises')).stat(destination).then(info => info.size)
      if (object.bytes >= 0 && await actualBytes !== object.bytes) throw new Error(`Supabase Storage object changed while downloading: ${object.path}`)
      object.sha256 = await sha256File(destination)
    }
    const after = (await Promise.all(prefixes.map(prefix => listStorageInventory(bucket, prefix)))).flat().sort((a,b)=>a.path.localeCompare(b.path))
    if (signature(before) !== signature(after)) throw new Error('Supabase Storage inventory changed during collection; retry the backup.')
    return before
  } catch (error) {
    await rm(target, { recursive: true, force: true })
    throw error
  }
}

async function main() {
  process.umask(0o077)
  const url = need('SUPABASE_URL')
  assertExpectedSupabaseProject(url, need('WRITEOFFS_BACKUP_EXPECTED_SUPABASE_PROJECT_REF'))
  const admin = createClient(url, need('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })
  const bucketName = process.env.WRITEOFFS_BACKUP_SUPABASE_BUCKET || 'receipts'
  if (bucketName !== 'receipts') throw new Error('Unexpected Supabase Storage bucket; refusing backup.')
  const inventory = await collectSupabaseStorage({ bucket: admin.storage.from(bucketName), output: need('WRITEOFFS_BACKUP_STORAGE_ROOT') })
  console.log(JSON.stringify({ collected: true, bucket: bucketName, objects: inventory.length }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
