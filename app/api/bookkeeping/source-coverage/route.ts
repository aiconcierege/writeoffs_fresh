import {NextResponse} from 'next/server'
import {getAuthenticatedContext,unauthorizedResponse} from '../../../lib/auth/require-user'
import {loadSourceCoverage} from '../../../lib/bookkeeping/source-coverage-loader'
export async function GET(){
 const {supabase,user}=await getAuthenticatedContext();if(!user)return unauthorizedResponse()
 try{return NextResponse.json(await loadSourceCoverage(supabase),{headers:{'Cache-Control':'private, no-store'}})}
 catch{return NextResponse.json({error:'coverage_unavailable'},{status:503})}
}
