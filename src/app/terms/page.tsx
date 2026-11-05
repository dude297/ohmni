import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/ohmni/legal";

export const metadata: Metadata = { title: "Terms of Service | Ohmni", description: "Beta terms for using Ohmni." };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        These terms govern your use of Ohmni (the &quot;Service&quot;), provided by [Legal entity name] (&quot;we&quot;, &quot;us&quot;). By using the Service you agree to them.
        If you do not agree, do not use the Service.
      </p>

      <h2>1. Beta service, provided as is</h2>
      <p>
        Ohmni is a beta. It may change, break, lose data or be discontinued at any time. The Service is provided <strong>&quot;as is&quot; and &quot;as available&quot;</strong>,
        without warranties of any kind, express or implied, including merchantability, fitness for a particular purpose, accuracy and non-infringement.
      </p>

      <h2>2. Low-voltage DC only — not for safety-critical decisions</h2>
      <ul>
        <li>Ohmni only analyses <strong>low-voltage DC circuits</strong>. It does not model mains, high-voltage, high-current or other energized hazardous systems.</li>
        <li><strong>Do not use Ohmni for work on energized or hazardous high-voltage equipment</strong>, or for any safety-critical, medical, automotive, aviation or life-support decision.</li>
        <li>Disconnect power before measuring resistance. Follow the instructions for your meter and equipment, and applicable electrical safety rules.</li>
        <li>Diagnoses, probe suggestions and repair proposals are hypotheses. Verify them physically before acting on them. You are responsible for your work.</li>
      </ul>

      <h2>3. AI output may be wrong</h2>
      <p>
        Ohmni uses third-party AI models to read schematics and write explanations. Their output can be incomplete or wrong — for example, a misread component
        value or connection. Uploaded circuits must be reviewed and confirmed by you before they are solved. Probabilities shown by Ohmni are relative to its
        model, not field-calibrated.
      </p>

      <h2>4. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>break the law, or upload content you do not have the right to share;</li>
        <li>upload confidential third-party designs, personal data of others, or malware;</li>
        <li>attempt to access other users&apos; data, probe or bypass security controls, rate limits or feature gates (report vulnerabilities instead — see <Link href="/security">Security</Link>);</li>
        <li>overload the Service, scrape it at scale, or use it to build a competing model or dataset;</li>
        <li>resell or redistribute the Service without our written permission.</li>
      </ul>

      <h2>5. Your content</h2>
      <p>
        You keep ownership of the schematics, circuits, measurements and notes you submit (&quot;your content&quot;). You grant us a limited licence to host, process and
        transmit your content only to provide the Service, including sending it to the providers listed on <Link href="/subprocessors">Subprocessors</Link>. Read the{" "}
        <Link href="/privacy">Privacy notice</Link>: AI providers process uploads under free-tier terms that may allow them to use inputs, so do not upload confidential designs.
      </p>

      <h2>6. Accounts, termination and deletion</h2>
      <p>
        You can export your workspaces and delete your account at any time from <Link href="/account">Account</Link>. We may suspend or terminate access for violation
        of these terms or to protect the Service or other users. Deletion is permanent; we do not keep a recoverable copy beyond the database provider&apos;s backups.
      </p>

      <h2>7. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, we are not liable for any indirect, incidental, special, consequential or punitive damages, or for loss of data,
        profits, equipment or injury arising from use of the Service or reliance on its output. Our total liability for any claim relating to the Service is limited
        to the greater of the amount you paid us for the Service in the 12 months before the claim, or USD 50. Some jurisdictions do not allow these limits, in which
        case they apply to the extent permitted.
      </p>

      <h2>8. Changes</h2>
      <p>
        We may update these terms. We will change the &quot;Last updated&quot; date above and, for material changes, give notice in the Service. Continued use after a change
        means you accept the updated terms.
      </p>

      <h2>9. Contact</h2>
      <p>[contact email]. Governing law and venue: [to be determined by counsel].</p>
    </LegalPage>
  );
}
