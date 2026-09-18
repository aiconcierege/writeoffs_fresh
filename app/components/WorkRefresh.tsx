'use client'
import {useEffect} from 'react'
import {useRouter} from 'next/navigation'
/** Read-only freshness: workers remain responsible for all bookkeeping mutations. */
export function WorkRefresh({active}:{active:boolean}) {
 const router=useRouter()
 useEffect(()=>{
  const refresh=()=>{if(document.visibilityState==='visible')router.refresh()}
  window.addEventListener('focus',refresh)
  const timer=active?setInterval(refresh,15000):null
  return ()=>{window.removeEventListener('focus',refresh);if(timer)clearInterval(timer)}
 },[active,router])
 return null
}
