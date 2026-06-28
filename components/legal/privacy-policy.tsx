import {
  LegalPage,
  LegalSection,
  LegalList,
  Strong,
  LegalLink,
} from "@/components/legal/legal-page";

export default function PrivacyPolicy() {
  return (
    <LegalPage
      title="Privacy Policy"
      lastUpdated="May 15, 2026"
      intro={
        <p>
          This Privacy Policy explains how CartLedger (&quot;CartLedger,&quot;
          &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) collects, uses, and
          shares information when you use our compliance-tracking service for
          food truck and mobile food operators. It applies to our website, web
          application, and the email, SMS, and voice reminders we send. By using
          CartLedger, you agree to this Policy. If you do not agree, do not use
          the service.
        </p>
      }
    >
      <LegalSection heading="1. Information We Collect">
        <p>We collect the following categories of information:</p>
        <LegalList>
          <li>
            <Strong>Account &amp; workspace data</Strong> — your name, email
            address, business/workspace name, and role. A workspace is created
            for you on first sign-in.
          </li>
          <li>
            <Strong>Compliance data you enter or upload</Strong> — details about
            your trucks, permits, inspections, certifications, insurance
            certificates (COIs), and commissary agreements, including identifiers,
            issuing authorities, and expiration and fee due dates, plus any
            documents you upload.
          </li>
          <li>
            <Strong>Contact &amp; notification data</Strong> — the email address
            and phone number used to deliver reminders, and your notification
            preferences.
          </li>
          <li>
            <Strong>Billing data</Strong> — subscription plan and billing status.
            Payments are processed by our payment processor (Stripe); we do not
            store full card numbers on our systems.
          </li>
          <li>
            <Strong>Usage &amp; device data</Strong> — limited technical data such
            as log events, approximate device/browser information, and product
            analytics about how features are used.
          </li>
          <li>
            <Strong>Communications</Strong> — messages you send us and renewal
            notices you forward to your CartLedger inbox address.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection heading="2. How We Use Information">
        <LegalList>
          <li>Provide, operate, and secure the service and your workspace.</li>
          <li>
            Track your compliance items and send reminders before expiration or
            fee due dates by email and, on eligible plans, SMS and voice.
          </li>
          <li>
            Read and organize documents you upload (including via AI-assisted
            processing) to suggest dates and details for your review.
          </li>
          <li>Process subscriptions, billing, and customer support.</li>
          <li>
            Monitor reliability, debug errors, and improve the product in
            aggregate.
          </li>
          <li>Comply with law and enforce our Terms.</li>
        </LegalList>
      </LegalSection>

      <LegalSection heading="3. Document Scanning and AI Processing">
        <p>
          When you upload a document, we may send its contents to an AI provider
          to perform optical character recognition and suggest structured details
          (such as an expiration date). These suggestions are estimates you must
          review and confirm; we never treat AI-extracted data as a confirmed
          renewal or compliance status on your behalf. We take steps to avoid
          exposing sensitive document contents in our diagnostic and analytics
          tooling — for example, <Strong>we do not log permit or COI numbers, or
          extracted document text, to our error-monitoring or analytics
          providers.</Strong>
        </p>
      </LegalSection>

      <LegalSection heading="4. Service Providers (Sub-processors)">
        <p>
          We share information with vendors who process it on our behalf, under
          contract, only to provide the service. These currently include:
        </p>
        <LegalList>
          <li>
            <Strong>Supabase</Strong> — database, authentication, and document
            storage (hosting your account and compliance data).
          </li>
          <li>
            <Strong>Vercel</Strong> — application hosting and delivery.
          </li>
          <li>
            <Strong>Anthropic</Strong> — AI-assisted document reading
            (OCR/extraction).
          </li>
          <li>
            <Strong>Resend</Strong> (outbound) and <Strong>Postmark</Strong>{" "}
            (inbound) — email delivery and forwarded-notice intake.
          </li>
          <li>
            <Strong>Twilio</Strong> — SMS and automated voice reminders.
          </li>
          <li>
            <Strong>Stripe</Strong> — subscription billing and payment
            processing.
          </li>
          <li>
            <Strong>Sentry</Strong> (error monitoring) and{" "}
            <Strong>PostHog</Strong> (product analytics) — operated subject to
            the logging limits described above.
          </li>
        </LegalList>
        <p>
          We do not sell your personal information, and we do not share it for
          cross-context behavioral advertising.
        </p>
      </LegalSection>

      <LegalSection heading="5. When We Disclose Information">
        <p>
          Beyond the service providers above, we may disclose information: (a) to
          comply with law, legal process, or a lawful government request; (b) to
          protect the rights, safety, and security of CartLedger, our users, or
          the public; and (c) in connection with a merger, acquisition, or sale
          of assets, in which case we will continue to protect your information
          and notify you of any change in control or applicable policy.
        </p>
      </LegalSection>

      <LegalSection heading="6. Data Retention">
        <p>
          We retain your information for as long as your account is active and as
          needed to provide the service. Compliance items are archived rather
          than hard-deleted so your history and audit trail remain intact. We
          retain certain records as required for legal, tax, security, and
          audit-log purposes. When you close your account, we will delete or
          de-identify your information within 90 days, except where retention is
          required by law.
        </p>
      </LegalSection>

      <LegalSection heading="7. Security">
        <p>
          We use technical and organizational measures to protect your
          information, including access controls, encryption in transit, and
          tenant isolation so each workspace can only access its own data. No
          method of transmission or storage is completely secure, and we cannot
          guarantee absolute security. You are responsible for keeping your
          account credentials confidential.
        </p>
      </LegalSection>

      <LegalSection heading="8. Your Choices and Rights">
        <LegalList>
          <li>
            <Strong>Access &amp; correction</Strong> — view and update your
            account and compliance data from within the app.
          </li>
          <li>
            <Strong>Deletion</Strong> — request deletion of your account by
            contacting us, subject to legal retention requirements.
          </li>
          <li>
            <Strong>Notification controls</Strong> — adjust reminder preferences
            in Settings. Reply <Strong>STOP</Strong> to any SMS to opt out of
            text messages; transactional account emails may still be sent.
          </li>
          <li>
            <Strong>Regional rights</Strong> — depending on where you live, you
            may have additional rights to access, correct, delete, or port your
            data, or to object to certain processing. Contact us to exercise
            them; we will not discriminate against you for doing so.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection heading="9. Cookies and Analytics">
        <p>
          We use strictly necessary cookies to keep you signed in and to operate
          the service, and limited analytics to understand product usage. We do
          not use third-party advertising cookies. You can control cookies
          through your browser settings, though some features may not work
          without them.
        </p>
      </LegalSection>

      <LegalSection heading="10. Data Location">
        <p>
          CartLedger is operated in the United States and our providers may
          process and store information in the United States and other countries.
          By using the service, you understand your information may be
          transferred to and processed in those locations.
        </p>
      </LegalSection>

      <LegalSection heading="11. Children's Privacy">
        <p>
          CartLedger is a business tool intended for users 18 and older and is not
          directed to children. We do not knowingly collect personal information
          from children. If you believe a child has provided us information,
          contact us and we will delete it.
        </p>
      </LegalSection>

      <LegalSection heading="12. Changes to This Policy">
        <p>
          We may update this Policy from time to time. If we make material
          changes, we will provide reasonable notice (for example, by email or
          in-app) and update the &quot;Last updated&quot; date above. Your
          continued use of CartLedger after the changes take effect means you
          accept the updated Policy.
        </p>
      </LegalSection>

      <LegalSection heading="13. Contact Us">
        <p>
          Questions or requests about your privacy? Contact us at:
        </p>
        <p className="text-foreground">
          CartLedger
          <br />
          Email: raysarchive@proton.me
        </p>
        <p className="text-sm">
          See also our{" "}
          <LegalLink href="/legal/terms">Terms of Service</LegalLink>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
