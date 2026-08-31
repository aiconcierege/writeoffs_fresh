import { redirect } from 'next/navigation'
import { createServerSupabase } from '../../utils/supabase/server'
import { listCustomerWeeklyReviews } from '../lib/bookkeeping/weekly-review'
import { loadCustomerEntitlements } from '../lib/membership/entitlements'

export const dynamic='force-dynamic'

export default async function WeeklyReviewIndex(){
  const supabase=await createServerSupabase()
  const{data:{user}}=await supabase.auth.getUser();if(!user)redirect('/login')
  const membership=await loadCustomerEntitlements(supabase)
  if(membership.lifecycle==='none')redirect('/membership')
  if(membership.lifecycle==='expired_read_only')redirect('/membership/read-only')
  const reviews=await listCustomerWeeklyReviews(supabase)
  const oldest=reviews.find(review=>review.actionable)
  redirect(oldest?`/weekly-review/${oldest.id}`:'/home')
}
