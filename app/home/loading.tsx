import {BettiPresence} from '../components/experience/BettiPresence'
import {LoadingLines} from '../components/experience/LoadingLines'
import './command-center.css'
export default function HomeLoading(){
 return <div className="home-command-center wo-experience" aria-busy="true"><div className="home-shell">
  <section className="home-betti-hero" aria-label="Loading Home"><div className="home-betti-message"><p className="home-betti-identity">Betti · your bookkeeper</p><h1>Opening your books.</h1><LoadingLines rows={2}/></div><BettiPresence state="welcome" className="home-betti-portrait"/></section>
  <div className="wo-loading-financial" aria-hidden="true"><LoadingLines rows={2}/><LoadingLines rows={2}/><LoadingLines rows={2}/></div>
 </div></div>
}
