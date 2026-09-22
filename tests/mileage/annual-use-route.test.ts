import {beforeEach,afterEach,it,expect,vi} from 'vitest'
const {rpc}=vi.hoisted(()=>({rpc:vi.fn(async()=>({data:'event',error:null}))}))
vi.mock('../../utils/supabase/server',()=>({createServerSupabase:async()=>({rpc,from:()=>({select:()=>({eq:()=>({eq:async()=>({count:1})})})})})}))
vi.mock('../../app/lib/mileage/repository',()=>({requireMileageBusiness:async()=>({businessId:'business'})}))
vi.mock('../../app/lib/membership/entitlements',()=>({requireCapability:async()=>{},membershipErrorResponse:()=>({error:'denied',status:403})}))
import {PATCH} from '../../app/api/mileage/vehicles/[id]/tax/route'
beforeEach(()=>{vi.clearAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-22T18:00:00Z'))})
afterEach(()=>vi.useRealTimers())
const request=(taxYear:number)=>PATCH(new Request('http://localhost/api/mileage/vehicles/test/tax',{method:'PATCH',body:JSON.stringify({kind:'total_miles',taxYear,totalMiles:'20000',requestKey:'00000000-0000-4000-8000-000000000001'})}),{params:Promise.resolve({id:'00000000-0000-4000-8000-000000000002'})})
it('rejects a current/future annual total before any canonical write',async()=>{for(const year of [2026,2027])expect((await request(year)).status).toBe(400);expect(rpc).not.toHaveBeenCalled()})
it('preserves completed-year annual-use writes and exact mileage precision',async()=>{expect((await request(2025)).status).toBe(200);expect(rpc).toHaveBeenCalledWith('record_vehicle_tax_year_total_miles',expect.objectContaining({p_tax_year:2025,p_total_miles_milli:20000000}))})
