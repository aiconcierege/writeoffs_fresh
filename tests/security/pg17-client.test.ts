import {describe,it,expect} from 'vitest'
import {pg17Arguments,pg17Image} from '../../scripts/backup/pg17-client.mjs'
import {readFileSync} from 'node:fs'
const root='/tmp/writeoffs-hosted-dr-ABC123'
describe('portable hosted DR PostgreSQL clients',()=>{
 it.each(['psql','pg_restore'])('runs %s 17 without assuming host packages',command=>{
  expect(pg17Arguments(command,['--version'],{})).toEqual(['run','--rm','-i','--network','host',pg17Image,command,'--version'])
 })
 it('mounts only the private drill directory read-only and passes credentials by variable name',()=>{
  const args=pg17Arguments('psql',['-Atq'],{WRITEOFFS_DR_WORK_DIRECTORY:root,PGPASSWORD:'do-not-put-this-in-argv',PGSSLMODE:'verify-full',PGSSLROOTCERT:root+'/ca.crt'})
  expect(args).toContain(`type=bind,source=${root},target=${root},readonly`)
  expect(args).toContain('PGPASSWORD');expect(args.join(' ')).not.toContain('do-not-put-this-in-argv')
  expect(args).toContain('PGSSLMODE');expect(args).toContain('PGSSLROOTCERT')
 })
 it.each(['/', '/tmp','relative-path','/tmp/writeoffs-hosted-dr-a/../b','/tmp/writeoffs-hosted-dr-a,b'])('rejects unintended filesystem mounts: %s',path=>{
  expect(()=>pg17Arguments('psql',[],{WRITEOFFS_DR_WORK_DIRECTORY:path})).toThrow()
 })
 it('rejects arbitrary commands',()=>expect(()=>pg17Arguments('sh',['--version'],{})).toThrow())
 it('keeps workflow diagnostics when preparation fails before the drill',()=>{
  const workflow=readFileSync('.github/workflows/staging-backup-certification.yml','utf8').split('  certify-hosted-dr:')[1]
  expect(workflow).not.toContain('/usr/lib/postgresql/17/bin')
  expect(workflow).toContain('pg17-client.mjs psql --version')
  expect(workflow).toContain('pg17-client.mjs pg_restore --version')
  expect(workflow).toContain('name: Preserve preparation failure evidence\n        if: always()')
  expect(workflow).toContain('drillStarted:false')
 })
})
