import {
  LegalPage,
  LegalSection,
  LegalList,
  Strong,
  LegalLink,
} from "@/components/legal/legal-page";

export default function TermsOfService() {
  return (
    <LegalPage
      title="Terms of Service"
      lastUpdated="[Effective Date]"
      intro={
        <p>
          These Terms of Service (the &quot;Terms&quot;) govern your access to
          and use of VendGuard (&quot;VendGuard,&quot; &quot;we,&quot;
          &quot;us,&quot; or &quot;our&quot;), a software service that helps food
          truck and mobile food operators track permits, inspections,
          certifications, insurance certificates (COIs), and commissary
          agreements, and that sends reminders before those items expire. By
          creating an account or using VendGuard, you agree to these Terms. If
          you do not agree, do not use the service.
        </p>
      }
    >
      <LegalSection heading="1. What VendGuard Is">
        <p>
          VendGuard is a compliance tracking and reminder tool. You enter (or
          upload documents describing) your permits, inspections,
          certifications, insurance, and commissary obligations, and VendGuard
          organizes them and notifies you in advance of expiration or fee due
          dates. VendGuard does not file, renew, issue, or guarantee any permit,
          license, inspection, or insurance on your behalf.
        </p>
      </LegalSection>

      <LegalSection heading="2. Not Legal, Regulatory, or Compliance Advice">
        <p>
          <Strong>
            VendGuard is an informational tool, not a substitute for your own
            judgment, your regulator, or a licensed professional.
          </Strong>{" "}
          Reminders, statuses, digests, and any guidance shown in the product
          are provided for convenience only and may be incomplete, out of date,
          or incorrect. You remain solely responsible for knowing and meeting
          all permitting, health, safety, insurance, and other legal
          requirements that apply to your operation. Requirements and deadlines
          vary by jurisdiction and change over time. Always confirm directly
          with the issuing authority. Nothing in VendGuard constitutes legal,
          tax, insurance, or regulatory advice.
        </p>
      </LegalSection>

      <LegalSection heading="3. Your Responsibilities">
        <LegalList>
          <li>
            Provide accurate, complete, and current information for each item
            you track.
          </li>
          <li>
            Verify and confirm renewals yourself. VendGuard never marks an item
            &quot;renewed&quot; on your behalf, and you must not treat a reminder
            (or its absence) as proof of compliance.
          </li>
          <li>Maintain the security of your account and credentials.</li>
          <li>
            Ensure your contact details (email and phone) are correct so
            reminders can reach you.
          </li>
          <li>Comply with all laws applicable to your business.</li>
        </LegalList>
      </LegalSection>

      <LegalSection heading="4. Reminders and Notifications">
        <p>
          VendGuard sends reminders by email and, on eligible plans, by SMS text
          message and automated voice call. These notifications are provided on
          a <Strong>best-effort basis</Strong>. We do not guarantee that any
          reminder will be generated, delivered, received, or delivered on time,
          and delivery depends on third parties and factors outside our control
          (carriers, email providers, spam filtering, and your device). You
          agree not to rely solely on VendGuard reminders to remain compliant.
          By providing a phone number and enabling SMS or voice notifications,
          you consent to receive automated messages and calls related to your
          account; message and data rates may apply, and you can opt out as
          described in those messages.
        </p>
      </LegalSection>

      <LegalSection heading="5. Document Scanning and AI Features">
        <p>
          VendGuard may use automated and AI-assisted processing (including
          optical character recognition) to read uploaded documents and suggest
          dates or details. These suggestions are estimates and may be wrong.
          You are responsible for reviewing and confirming any extracted
          information before relying on it. VendGuard will not treat AI-extracted
          data as a confirmed renewal or compliance status without your
          confirmation.
        </p>
      </LegalSection>

      <LegalSection heading="6. Your Content and Data">
        <p>
          You retain ownership of the documents and information you upload
          (&quot;Your Content&quot;). You grant VendGuard a limited license to
          host, store, process, and display Your Content solely to provide and
          improve the service for you. You are responsible for having the rights
          to upload Your Content. Our handling of personal data is described in
          our <LegalLink href="/privacy">Privacy Policy</LegalLink>.
        </p>
      </LegalSection>

      <LegalSection heading="7. Plans, Billing, and Cancellation">
        <p>
          VendGuard offers paid subscription plans (such as Starter, Pro, and
          Fleet) with different limits and features. Paid plans are billed in
          advance on a recurring basis (monthly or yearly) through our payment
          processor, and renew automatically until cancelled. You can cancel at
          any time; cancellation takes effect at the end of the current billing
          period, and fees already paid are non-refundable except where required
          by law. We may change plans and pricing on prospective notice.
        </p>
      </LegalSection>

      <LegalSection heading="8. Acceptable Use">
        <p>You agree not to:</p>
        <LegalList>
          <li>
            Use the service for any unlawful purpose or to violate any
            regulation;
          </li>
          <li>
            Upload content you do not have the right to share, or that is
            malicious;
          </li>
          <li>Attempt to access another customer&apos;s account or data;</li>
          <li>
            Interfere with, disrupt, reverse engineer, or probe the service or
            its security;
          </li>
          <li>
            Resell or provide the service to third parties except as expressly
            permitted.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection heading="9. Disclaimer of Warranties">
        <p>
          The service is provided on an &quot;as is&quot; and &quot;as
          available&quot; basis. To the fullest extent permitted by law,
          VendGuard disclaims all warranties, express or implied, including
          merchantability, fitness for a particular purpose, and
          non-infringement. We do not warrant that the service will be
          uninterrupted, error-free, or that reminders or data will be accurate,
          complete, or timely.
        </p>
      </LegalSection>

      <LegalSection heading="10. Limitation of Liability">
        <p>
          To the fullest extent permitted by law, VendGuard and its suppliers
          will not be liable for any indirect, incidental, special,
          consequential, or punitive damages, or for any lost profits, lost
          data, business interruption, fines, penalties, or missed deadlines,
          arising out of or related to your use of (or inability to use) the
          service — including any reminder that was missed, late, or not
          delivered — even if advised of the possibility of such damages. Our
          total liability for any claim relating to the service will not exceed
          the amount you paid us for the service in the [twelve (12) months]
          preceding the claim.
        </p>
      </LegalSection>

      <LegalSection heading="11. Termination">
        <p>
          You may stop using VendGuard and close your account at any time. We
          may suspend or terminate your access if you violate these Terms or to
          protect the service. Upon termination, your right to use the service
          ends; we may retain or delete data as described in our{" "}
          <LegalLink href="/privacy">Privacy Policy</LegalLink> and applicable
          law.
        </p>
      </LegalSection>

      <LegalSection heading="12. Changes to These Terms">
        <p>
          We may update these Terms from time to time. If we make material
          changes, we will provide reasonable notice (for example, by email or
          in-app). Your continued use of VendGuard after the changes take effect
          means you accept the updated Terms.
        </p>
      </LegalSection>

      <LegalSection heading="13. Governing Law">
        <p>
          These Terms are governed by the laws of the State of [Minnesota],
          without regard to its conflict-of-laws rules. [Specify venue / dispute
          resolution — to be confirmed by counsel.]
        </p>
      </LegalSection>

      <LegalSection heading="14. Contact Information">
        <p>Questions about these Terms? Contact us at:</p>
        <p className="text-foreground">
          VendGuard
          <br />
          Email: legal@vendguard.app
          <br />
          Address: [Your Business Address]
        </p>
        <p className="text-sm">
          These Terms are effective as of [Effective Date] and apply to all
          users of VendGuard.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
