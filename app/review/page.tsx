import { redirect } from 'next/navigation'

export default function LegacyReviewRedirect() {
  redirect('/transactions')
}
