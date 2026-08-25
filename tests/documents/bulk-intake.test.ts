import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { runBoundedBatch } from '../../app/lib/documents/batch-intake'
const source=(path:string)=>readFileSync(path,'utf8')

describe('bulk document intake contracts',()=>{
  it('accepts multi-file receipts with bounded concurrency and no browser OCR continuation',()=>{
    const upload=source('app/receipts/ReceiptUploadAction.tsx')
    expect(upload).toMatch(/type="file" multiple/);expect(upload).toContain('concurrency: 4')
    expect(upload).toContain('Retry ');expect(upload).not.toContain("fetch('/api/receipts/ocr'");expect(upload).not.toContain('keepalive')
  })
  it('settles 127 files independently with bounded concurrency and partial failures',async()=>{
    let active=0,maxActive=0
    const result=await runBoundedBatch({items:Array.from({length:127},(_,index)=>index),concurrency:4,process:async(index)=>{
      active+=1;maxActive=Math.max(maxActive,active);await Promise.resolve();active-=1
      if(index%31===0)throw new Error('synthetic failure');return index
    }})
    expect(result).toHaveLength(127);expect(result.filter(row=>row.status==='rejected')).toHaveLength(5);expect(maxActive).toBeLessThanOrEqual(4)
  })
  it('does not impose a low batch or monthly quota',()=>{
    const upload=source('app/receipts/ReceiptUploadAction.tsx')
    expect(upload).not.toMatch(/slice\(0,\s*(20|50|100)\)/);expect(upload).not.toMatch(/monthly|plan.?limit|quota/i)
  })
  it('supports statement PDF intake and durable return-state display',()=>{
    const upload=source('app/import/StatementUpload.tsx')
    expect(upload).toMatch(/type="file" multiple/);expect(upload).toContain('/api/documents/statements')
    expect(upload).toContain('Still processing');expect(upload).toContain('Could not be read')
    expect(upload).toContain('transaction_count');expect(upload).toContain('institution_name')
    expect(source('app/import/page.tsx')).toContain('<StatementUpload />')
  })
  it('uses exact SHA-256 identities before registration',()=>{
    for(const path of ['app/receipts/ReceiptUploadAction.tsx','app/import/StatementUpload.tsx']){
      const text=source(path);expect(text).toContain("crypto.subtle.digest('SHA-256'");expect(text).toContain('${fingerprint}')
    }
  })
})
