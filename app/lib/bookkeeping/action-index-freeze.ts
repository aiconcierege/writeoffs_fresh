/** Explicit staging certification holds. Exclude before acquiring a lease so a
 * frozen baseline's index, facts, and job state are not touched by deployment. */
export function frozenStagingBusinesses(env:NodeJS.ProcessEnv=process.env){
 const raw=env.WRITEOFFS_STAGING_FROZEN_BUSINESS_IDS?.trim()
 if(!raw)return [] as string[]
 if(env.WRITEOFFS_ENVIRONMENT!=='staging')throw new Error('STAGING_FREEZE_OUTSIDE_STAGING')
 const ids=[...new Set(raw.split(',').map(id=>id.trim().toLowerCase()))]
 if(ids.length>20||ids.some(id=>!/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(id)||!/^[0-9a-f-]+$/.test(id)))throw new Error('INVALID_STAGING_FREEZE')
 return ids
}
