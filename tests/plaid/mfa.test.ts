import { expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { hasPlaidMfa } from '../../app/lib/plaid/mfa'
it.each(['aal1',null,undefined])('denies Plaid mutations without second factor (%s)', async level => {
 const supabase={auth:{mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:level},error:null})}}}
 expect(await hasPlaidMfa(supabase as never)).toBe(false)
})
it('allows verified second factor and fails closed on auth failure',async()=>{
 const check=vi.fn().mockResolvedValue({data:{currentLevel:'aal2'},error:null}),supabase={auth:{mfa:{getAuthenticatorAssuranceLevel:check}}}
 expect(await hasPlaidMfa(supabase as never)).toBe(true)
 check.mockRejectedValue(new Error('unavailable'))
 expect(await hasPlaidMfa(supabase as never)).toBe(false)
})
it.each(['link-token','exchange','sync','disconnect'])('enforces MFA before %s side effects', route=>{
 const source=readFileSync(`app/api/plaid/${route}/route.ts`,'utf8')
 expect(source.indexOf('if (!user)')).toBeLessThan(source.indexOf('if (!await hasPlaidMfa'))
 expect(source.indexOf('if (!await hasPlaidMfa')).toBeLessThan(source.indexOf('request.json'))
})
