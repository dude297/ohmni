import type { Metadata } from "next";
import { ADVISORIES_URL, LegalPage } from "@/components/ohmni/legal";

export const metadata: Metadata = { title: "Security | Ohmni", description: "How to report a vulnerability in Ohmni." };

export default function SecurityPage() {
  return (
    <LegalPage title="Security">
      <h2>Reporting a vulnerability</h2>
      <p>
        Please report security issues privately through <a href={ADVISORIES_URL}>GitHub security advisories</a>. Do not open a public issue. Include steps to
        reproduce and the affected URL or route. Please do not access other users&apos; data or degrade the service while testing.
      </p>
      <p>Machine-readable contact: <a href="/.well-known/security.txt">/.well-known/security.txt</a>.</p>

      <h2>What we do today</h2>
      <ul>
        <li>Saved data is isolated per workspace by database row-level security; the service-role key is server-only.</li>
        <li>Enforced Content-Security-Policy, HSTS, frame denial and other security headers on every route.</li>
        <li>Per-IP rate limits and request size limits; image uploads are type-checked by magic bytes.</li>
        <li>Stored images live in a private bucket and are served through short-lived signed links.</li>
      </ul>
    </LegalPage>
  );
}
