import {readdirSync} from 'node:fs'
import {describe,it,expect} from 'vitest'
describe('migration identity',()=>{
 it('assigns every SQL migration a unique timestamp version',()=>{
  const files=readdirSync(new URL('../../supabase/migrations/',import.meta.url)).filter(f=>f.endsWith('.sql'))
  const versions=files.map(f=>f.split('_')[0])
  expect(new Set(versions).size).toBe(files.length)
 })
})
