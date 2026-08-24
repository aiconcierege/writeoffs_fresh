import { createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { afterAll, describe, expect, it } from 'vitest'
import { startTotpEnrollment } from '../../app/lib/auth/totp-enrollment'

const url=process.env.LOCAL_SUPABASE_URL, anon=process.env.LOCAL_SUPABASE_ANON_KEY, service=process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY
const run=process.env.RUN_LOCAL_SUPABASE_INTEGRATION==='1'&&process.env.LOCAL_SUPABASE_TOTP_ENABLED==='1'&&Boolean(url&&anon&&service)
const admin=run?createClient(url!,service!,{auth:{persistSession:false,autoRefreshToken:false}}):null
let userId:string|undefined

afterAll(async()=>{if(admin&&userId)await admin.auth.admin.deleteUser(userId)})

describe.skipIf(!run)('Supabase TOTP MFA against local Auth',()=>{
  it('enrolls, verifies, reaches aal2, and removes only the owned factor',async()=>{
    const email=`mfa-${crypto.randomUUID()}@example.test`,password=`Local-${crypto.randomUUID()}-password`
    const created=await admin!.auth.admin.createUser({email,password,email_confirm:true});expect(created.error).toBeNull();userId=created.data.user?.id
    const customer=createClient(url!,anon!,{auth:{persistSession:false,autoRefreshToken:false}})
    expect((await customer.auth.signInWithPassword({email,password})).error).toBeNull()
    const enrolled=await startTotpEnrollment(customer.auth.mfa)
    const factorId=enrolled.factorId,secret=enrolled.secret
    const verified=await customer.auth.mfa.challengeAndVerify({factorId,code:totp(secret)});expect(verified.error).toBeNull()
    expect((await customer.auth.mfa.getAuthenticatorAssuranceLevel()).data?.currentLevel).toBe('aal2')
    expect((await customer.auth.mfa.listFactors()).data?.totp.some(f=>f.id===factorId&&f.status==='verified')).toBe(true)
    expect((await customer.auth.mfa.unenroll({factorId})).error).toBeNull()
  },15000)
})

function totp(secret:string){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',clean=secret.replace(/=+$/,'').toUpperCase();let bits='';for(const char of clean)bits+=alphabet.indexOf(char).toString(2).padStart(5,'0');const bytes=Buffer.alloc(Math.floor(bits.length/8));for(let i=0;i<bytes.length;i++)bytes[i]=parseInt(bits.slice(i*8,i*8+8),2);const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const hash=createHmac('sha1',bytes).update(counter).digest(),offset=hash[hash.length-1]&15;return String((hash.readUInt32BE(offset)&0x7fffffff)%1_000_000).padStart(6,'0')}
