import { PublicPageShell } from '../../components/PublicPageShell'

export const metadata = {
  title: "Privacy Policy | WriteOffs.io",
  description:
    "How WriteOffs.io collects, uses, stores, and protects your information.",
};

export default function Page() {
  return (
    <PublicPageShell eyebrow="Legal" title="Privacy Policy" introduction="Last updated September 30, 2025">
      <article className="public-legal">

      <p>
        This Privacy Policy explains how <strong>AI Concierge Inc. d/b/a WriteOffs.io</strong>
        (“WriteOffs,” “we,” “our,” or “us”) collects, uses, shares, and protects information in
        connection with our website, applications, and services (collectively, the “Services”).
      </p>

      <h2>1. Information We Collect</h2>
      <ul>
        <li><strong>Account & Contact.</strong> Name, email address, and basic profile details you provide.</li>
        <li><strong>Usage.</strong> Interactions with the Services, device information, IP, pages viewed.</li>
        <li><strong>Transactional.</strong> Subscription status, payments, and related records (processed by our payment provider).</li>
        <li><strong>Content You Upload.</strong> Receipts, notes, and other files you intentionally submit.</li>
        <li><strong>Integrations.</strong> With your permission, we may receive information from supported financial-account and payment providers to deliver features you request.</li>
      </ul>

      <h2>2. How We Use Information</h2>
      <ul>
        <li>Provide, maintain, and improve the Services.</li>
        <li>Organize business financial activity, connect receipts and other documentation, prepare bookkeeping records and reports, and export data you request.</li>
        <li>Communicate about updates, security, and support.</li>
        <li>Analyze anonymized/aggregated usage to improve performance and reliability.</li>
        <li>Comply with legal obligations and enforce terms.</li>
      </ul>

      <h2>3. Legal Bases (EEA/UK where applicable)</h2>
      <ul>
        <li><strong>Contract.</strong> To provide the Services you request.</li>
        <li><strong>Legitimate Interests.</strong> To secure, improve, and support the Services.</li>
        <li><strong>Consent.</strong> Where required, such as certain analytics or marketing.</li>
        <li><strong>Legal Obligation.</strong> Where laws require retention or disclosure.</li>
      </ul>

      <h2>4. Sharing</h2>
      <p>
        We do not sell your personal information. We may share data with service providers that help us run the Services
        (e.g., hosting, database, analytics, payments, authentication, email). Examples include but are not limited to
        infrastructure and analytics providers. These providers are bound by agreements to process data only per our instructions.
      </p>

      <h2>5. Data Retention</h2>
      <p>
        We keep information for as long as necessary to provide the Services, comply with law, resolve disputes, and enforce agreements.
        You may request deletion where applicable (see “Your Rights”).
      </p>

      <h2>6. Security</h2>
      <p>
        We use reasonable administrative, technical, and physical safeguards. No method of transmission or storage is 100% secure;
        we cannot guarantee absolute security.
      </p>

      <h2>7. Your Rights</h2>
      <p>
        Depending on your location, you may have rights to access, correct, delete, or export your data, and to object or restrict certain processing.
        To exercise rights, contact <a href="mailto:rick@writeoffs.io">rick@writeoffs.io</a>.
      </p>

      <h2>8. Cookies & Similar Technologies</h2>
      <p>
        We may use cookies or similar technologies to operate the site, remember preferences, and measure performance.
        You can control cookies via your browser settings; blocking some cookies may impact functionality.
      </p>

      <h2>9. Children</h2>
      <p>
        The Services are not directed to children under 13. If you believe a child has provided personal information, contact us to remove it.
      </p>

      <h2>10. International Transfers</h2>
      <p>
        We may process and store information in the United States or other countries. Where required, we use appropriate safeguards for transfers.
      </p>

      <h2>11. Changes to this Policy</h2>
      <p>
        We may update this Policy from time to time. If changes are material, we will provide notice (e.g., via the site or email).
        Your continued use of the Services after changes take effect constitutes acceptance.
      </p>

      <h2>12. Contact</h2>
      <p>
        Questions or requests: <a href="mailto:rick@writeoffs.io">rick@writeoffs.io</a>.
      </p>
      </article>
    </PublicPageShell>
  );
}
