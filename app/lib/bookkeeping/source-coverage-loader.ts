import 'server-only'
import type {SupabaseClient} from '@supabase/supabase-js'
import {projectSourceCoverage,type CoverageInput} from './source-coverage'
export async function loadSourceCoverage(db:SupabaseClient,start?:string,end?:string){
 const {data,error}=await db.rpc('read_customer_source_coverage',{p_start:start??null,p_end:end??new Date().toISOString().slice(0,10)})
 if(error||!data)throw new Error('SOURCE_COVERAGE_UNAVAILABLE')
 return projectSourceCoverage(data as CoverageInput)
}
