import { PublicPageShell } from '../../components/PublicPageShell'

export const metadata = {
  title: "Terms of Service | WriteOffs.io",
  description: "The rules for using WriteOffs.io.",
};

export default function Page() {
  return (
    <PublicPageShell eyebrow="Legal" title="Terms of Service" introduction="Last updated September 30, 2025">
      <article className="public-legal">

      <p>
        These Terms of Service (“Terms”) govern your access to and use of the Services provided by
        <strong> AI Concierge Inc. d/b/a WriteOffs.io</strong> (“WriteOffs,” “we,” “our,” “us”).
        By using the Services, you agree to these Terms.
      </p>

      <h2>1. Use of the Services</h2>
      <ul>
        <li>You must be at least 18 years old and able to form a binding contract.</li>
        <li>You are responsible for maintaining the confidentiality of your account and for all activity under it.</li>
        <li>You will comply with applicable laws and these Terms.</li>
      </ul>

      <h2>2. Content</h2>
      <ul>
        <li>
          <strong>Your Content.</strong> You retain ownership of content you submit (e.g., receipts, notes).
          You grant us a limited license to host, process, and display your content as needed to provide the Services.
        </li>
        <li>
          <strong>Our Content.</strong> The Services, site, software, logos, and materials are owned by us or our licensors and are protected by law.
          You may not copy, modify, distribute, or create derivative works except as expressly permitted.
        </li>
      </ul>

      <h2>3. Prohibited Conduct</h2>
      <ul>
        <li>Reverse engineering, scraping, or interfering with the Services.</li>
        <li>Uploading unlawful, infringing, or harmful content.</li>
        <li>Attempting to gain unauthorized access to systems or data.</li>
      </ul>

      <h2>4. Subscriptions & Payments</h2>
      <ul>
        <li>Paid features may require a month-to-month membership. Prices, features, and billing terms may change with notice.</li>
        <li>Taxes may apply and are your responsibility where required.</li>
        <li>You may cancel your membership. Cancellation stops future renewal, and paid access continues through the end of the current paid billing period.</li>
        <li>We do not provide prorated or partial-month refunds.</li>
      </ul>

      <h2>5. Third-Party Services</h2>
      <p>
        The Services may rely on or link to third-party providers (e.g., hosting, analytics, payments, bank data aggregators).
        Your use of those services may be subject to separate terms and privacy policies.
      </p>

      <h2>6. Disclaimers</h2>
      <p>
        THE SERVICES ARE PROVIDED “AS IS” AND “AS AVAILABLE.” TO THE MAXIMUM EXTENT PERMITTED BY LAW,
        WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
        AND NON-INFRINGEMENT. WE DO NOT GUARANTEE ACCURACY, RELIABILITY, OR AVAILABILITY.
      </p>

      <h2>7. Limitation of Liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, WRITEOFFS AND ITS AFFILIATES WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL,
        SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, OR USE,
        EVEN IF ADVISED OF THE POSSIBILITY. OUR AGGREGATE LIABILITY ARISING FROM OR RELATING TO THE SERVICES
        WILL NOT EXCEED THE AMOUNTS YOU PAID TO US FOR THE SERVICES IN THE 12 MONTHS BEFORE THE CLAIM AROSE.
      </p>

      <h2>8. Indemnification</h2>
      <p>
        You will indemnify and hold harmless WriteOffs from any claims, losses, and expenses (including attorneys’ fees)
        arising from your use of the Services or violation of these Terms.
      </p>

      <h2>9. Termination</h2>
      <p>
        We may suspend or terminate the Services or your account at any time, with or without notice,
        for any reason, including violation of these Terms. You may stop using the Services at any time.
      </p>

      <h2>10. Changes</h2>
      <p>
        We may update these Terms from time to time. If changes are material, we will provide notice (e.g., via the site or email).
        Your continued use of the Services after changes take effect constitutes acceptance.
      </p>

      <h2>11. Governing Law & Dispute Resolution</h2>
      <p>
        These Terms are governed by the laws of the State of Arizona (without regard to conflicts of law).
        Disputes will be resolved in the state or federal courts located in Maricopa County, Arizona,
        and you consent to their jurisdiction and venue.
      </p>

      <h2>12. Contact</h2>
      <p>
        Questions about these Terms: <a href="mailto:rick@writeoffs.io">rick@writeoffs.io</a>.
      </p>
      </article>
    </PublicPageShell>
  );
}
