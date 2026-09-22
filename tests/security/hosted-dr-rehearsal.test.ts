import {describe,it,expect} from 'vitest'
import {spawnSync} from 'node:child_process'
import {requireLedgerDecryptionFailure} from '../../scripts/backup/drill-hosted-fresh-restore.mjs'
describe('local hosted DR rehearsal safety',()=>{
 it.each(['WRITEOFFS_DELETION_LEDGER_KEY_BASE64','WRITEOFFS_TEMP_DR_TARGET_JSON','WRITEOFFS_BACKUP_DATABASE_URL','AWS_ACCESS_KEY_ID'])('refuses live credentials: %s',name=>{
  const r=spawnSync(process.execPath,['scripts/backup/drill-local-hosted-contract.mjs','--synthetic-only'],{encoding:'utf8',env:{NODE_ENV:'test',PATH:process.env.PATH,[name]:'synthetic-guard-test-value'}})
  expect(r.status).not.toBe(0);expect(r.stderr).toContain('LIVE_CREDENTIALS_FORBIDDEN');expect(r.stderr).not.toContain('synthetic-guard-test-value')
 })
 it('imports the shared drill without executing or accessing a provider',()=>{
  const r=spawnSync(process.execPath,['--input-type=module','-e',"const m=await import('./scripts/backup/drill-hosted-fresh-restore.mjs');console.log(typeof m.runDrill)"],{encoding:'utf8',env:{NODE_ENV:'test',PATH:process.env.PATH}})
  expect(r.status).toBe(0);expect(r.stdout.trim()).toBe('function');expect(r.stderr).toBe('')
 })
 it('preserves the original restore error and its SQL state',()=>{
  const error=Object.assign(new Error('DR_DATABASE_OPERATION_FAILED'),{sqlState:'42501'})
  try{requireLedgerDecryptionFailure(error);expect.unreachable()}catch(caught){expect(caught).toBe(error);expect((caught as typeof error).sqlState).toBe('42501')}
  expect(()=>requireLedgerDecryptionFailure(new Error('DELETION_LEDGER_INTEGRITY_FAILED'))).not.toThrow()
 })
})
