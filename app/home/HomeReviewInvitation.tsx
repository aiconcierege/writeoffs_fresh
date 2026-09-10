'use client'
import Link from'next/link'
import{useState}from'react'

export function HomeReviewInvitation({count}:{count:number}){
  const[dismissed,setDismissed]=useState(false)
  if(dismissed)return <div className="home-review-invitation is-dismissed"><p>Your review is still waiting whenever you’re ready.</p><button type="button" onClick={()=>setDismissed(false)}>Show review invitation</button></div>
  return <div className="home-review-invitation"><h2>Betti needs a few details.</h2><p>{count===1?'There is one question waiting for you.':`There are ${count} questions waiting for you.`}</p><div><Link href="/check-in" className="btn btn-primary">Check in with Betti</Link><button type="button" className="btn btn-secondary" onClick={()=>setDismissed(true)}>Not right now</button></div></div>
}
