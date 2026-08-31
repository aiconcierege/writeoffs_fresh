'use client'
import Link from'next/link'
import{useState}from'react'

export function HomeReviewInvitation({count}:{count:number}){
  const[dismissed,setDismissed]=useState(false)
  if(dismissed)return <div className="home-review-invitation is-dismissed"><p>Your review is still waiting whenever you’re ready.</p><button type="button" onClick={()=>setDismissed(false)}>Show review invitation</button></div>
  return <div className="home-review-invitation"><h2>Are you ready for your weekly review?</h2><p>{count===1?'One weekly review is waiting.':`${count} weekly reviews are waiting.`} I’ve kept working on everything I can in the meantime.</p><div><Link href="/weekly-review" className="btn btn-primary">Yes, let’s review</Link><button type="button" className="btn btn-secondary" onClick={()=>setDismissed(true)}>Not right now</button></div></div>
}
