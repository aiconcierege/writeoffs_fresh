import { PublicPageShell } from '../components/PublicPageShell'

export const metadata = {
  title: 'Contact WriteOffs | WriteOffs.io',
  description: 'Get in touch with WriteOffs.',
}

export default function ContactPage() {
  return <PublicPageShell eyebrow="Contact" title="Contact WriteOffs" introduction="Questions about WriteOffs or need help finding the right next step? We’d be glad to hear from you.">
    <section className="public-contact" aria-labelledby="contact-email-heading">
      <p className="public-section-label">Get in touch</p>
      <h2 id="contact-email-heading">Send us an email.</h2>
      <p>Write to <a href="mailto:rick@writeoffs.io">rick@writeoffs.io</a> and we’ll get back to you as soon as we can.</p>
      <p>For press inquiries, email <a href="mailto:press@writeoffs.io">press@writeoffs.io</a>.</p>
    </section>
  </PublicPageShell>
}
