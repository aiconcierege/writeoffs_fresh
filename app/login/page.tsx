import BrandLogo from '../components/BrandLogo'
import { isCustomerSignupEnabled } from '../lib/auth/signup-policy'
import { LoginForm } from './LoginForm'

export const metadata = {
  title: 'Log in | WriteOffs.io',
  description: 'Log in to your WriteOffs account.',
}

export default function LoginPage() {
  const signupEnabled = isCustomerSignupEnabled()
  return <div className="public-site -mx-4 -mb-10 grid min-h-[calc(100vh-5rem)] place-items-center overflow-hidden bg-[radial-gradient(circle_at_80%_12%,rgba(140,230,203,.28),transparent_22rem),linear-gradient(145deg,#fff8ee,#edf6ef)] px-4 py-10 sm:-mx-6 sm:px-6 lg:-mx-8">
    <section className="w-full max-w-md rounded-[1.75rem] border border-[#d5ddd7] bg-[#fffdf8]/95 p-6 shadow-[0_28px_75px_rgba(23,33,29,.13)] sm:p-9" aria-labelledby="login-heading">
      <BrandLogo heightPx={38}/>
      <p className="mt-9 text-xs font-bold uppercase tracking-[.14em] text-[#178368]">Welcome back</p>
      <h1 id="login-heading" className="mt-3 text-4xl font-semibold tracking-[-.045em] text-[#17211d]">Log in to WriteOffs</h1>
      <p className="mt-3 text-sm leading-6 text-[#59665f]">Your books are waiting right where you left them.</p>
      <LoginForm signupEnabled={signupEnabled}/>
    </section>
  </div>
}
