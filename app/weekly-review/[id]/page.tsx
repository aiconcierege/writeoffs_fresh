import Link from 'next/link'
import { notFound,redirect } from 'next/navigation'
import { createServerSupabase } from '../../../utils/supabase/server'
import { BettiIllustration } from '../../components/BettiIllustration'
import { listCustomerQuestions } from '../../lib/bookkeeping/customer-questions'
import { getCustomerWeeklyReviewById,listCustomerWeeklyReviews } from '../../lib/bookkeeping/weekly-review'
import { formatReviewPeriod } from '../../lib/bookkeeping/weekly-review-presentation'
import { loadCustomerEntitlements } from '../../lib/membership/entitlements'
import { WeeklyReview } from '../../home/WeeklyReview'

export const dynamic='force-dynamic'
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default async function WeeklyReviewPage({params}:{params:Promise<{id:string}>}){
  const{id}=await params;if(!UUID.test(id))notFound()
  const supabase=await createServerSupabase()
  const{data:{user}}=await supabase.auth.getUser();if(!user)redirect('/login')
  const membership=await loadCustomerEntitlements(supabase)
  if(membership.lifecycle==='none')redirect('/membership')
  if(membership.lifecycle==='expired_read_only')redirect('/membership/read-only')
  const[reviews,review,questions]=await Promise.all([
    listCustomerWeeklyReviews(supabase),getCustomerWeeklyReviewById(supabase,id),
    listCustomerQuestions({supabase,scope:membership.plan!}),
  ])
  const selected=reviews.find(item=>item.id===id)
  if(!review||!selected||!selected.actionable)notFound()
  const actionable=reviews.filter(item=>item.actionable)
  const position=actionable.findIndex(item=>item.id===id)+1
  const currentQuestions=questions.filter(question=>question.transaction.date
    &&question.transaction.date>=review.periodStart&&question.transaction.date<=review.periodEnd)
  return <main className="weekly-page"><div className="weekly-page-shell">
    <nav className="weekly-page-back" aria-label="Weekly review navigation"><Link href="/home">← Back to Home</Link></nav>
    <header className="weekly-page-intro">
      <div><p className="home-kicker">Weekly review</p><h1>{formatReviewPeriod(review.periodStart,review.periodEnd)}</h1>
        <p>{position} of {actionable.length} waiting</p>
        {actionable.length>1&&<details className="weekly-chooser"><summary>Choose another week</summary><nav aria-label="Available weekly reviews">{actionable.map(item=><Link key={item.id} href={`/weekly-review/${item.id}`} aria-current={item.id===id?'page':undefined}>{formatReviewPeriod(item.periodStart,item.periodEnd)}</Link>)}</nav></details>}
      </div>
      <BettiIllustration state="question" className="weekly-page-betti" priority sizes="(max-width: 639px) 7rem, 10rem" decorative/>
    </header>
    <WeeklyReview review={review} currentQuestions={currentQuestions} waitingCount={actionable.length}/>
  </div></main>
}
