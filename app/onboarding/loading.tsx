import {BettiPresence} from '../components/experience/BettiPresence'
import {LoadingLines} from '../components/experience/LoadingLines'
import './onboarding.css'
export default function OnboardingLoading(){
 return <section className="wo-onboarding wo-experience" aria-label="Loading onboarding" aria-busy="true"><div className="wo-onboarding-composition">
  <aside className="wo-onboarding-guide"><p className="wo-eyebrow">Betti · Your bookkeeper</p><p className="wo-onboarding-intro">Let’s get to know your business.</p><BettiPresence state="welcome" className="wo-onboarding-art"/></aside>
  <div className="onboarding-conversation"><h1 className="wo-onboarding-title">Getting your place ready.</h1><LoadingLines rows={4}/></div>
 </div></section>
}
