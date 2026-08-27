import { PublicPageShell } from '../../components/PublicPageShell'

export const metadata = {
  title: "Tax Disclaimer | WriteOffs.io",
  description:
    "Important information about tax guidance, limitations, and professional advice.",
};

export default function Page() {
  return (
    <PublicPageShell eyebrow="Legal" title="Tax Disclaimer" introduction="Last updated September 30, 2025">
      <article className="public-legal">

      <p>
        The content and tools provided by <strong>AI Concierge Inc. d/b/a WriteOffs.io</strong>
        (including FAQs, automated classifications, and in-app explanations) are for
        informational purposes only. They are not legal, tax, accounting, or investment advice,
        and should not be relied upon as a substitute for professional advice tailored to your
        specific circumstances.
      </p>

      <h2>No Professional Relationship</h2>
      <p>
        Your use of the Services does not create a CPA, tax advisor, attorney, or other professional
        relationship between you and WriteOffs. We are not your tax preparer unless explicitly agreed
        in a separate written engagement.
      </p>

      <h2>Accuracy and Changes in Law</h2>
      <p>
        We strive for accuracy but cannot guarantee that information is complete, current, or suitable
        for your situation. Tax laws, rates, and interpretations change frequently and may vary by
        jurisdiction. You are responsible for verifying how rules apply to you.
      </p>

      <h2>Records and Documentation</h2>
      <p>
        You are responsible for maintaining adequate records to support deductions and positions taken
        on your returns. Our tools may help organize information, but you remain responsible for the
        accuracy and completeness of your filings.
      </p>

      <h2>Limitation of Liability</h2>
      <p>
        To the maximum extent permitted by law, WriteOffs disclaims liability for decisions you make
        based on the Services. See our Terms of Service for additional limitations and dispute provisions.
      </p>

      <h2>Contact</h2>
      <p>
        For questions, contact <a href="mailto:rick@aiconciergeinc.com">rick@aiconciergeinc.com</a>.
      </p>
      </article>
    </PublicPageShell>
  );
}
