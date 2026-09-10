import { redirect } from 'next/navigation'

export const dynamic='force-dynamic'

export default async function WeeklyReviewPage({params}:{params:Promise<{id:string}>}){
  await params
  redirect('/check-in')
}
