import type { Metadata } from "next";
import Link from "next/link";
import { ADVISORIES_URL, LegalPage } from "@/components/ohmni/legal";

export const metadata: Metadata = { title: "Privacy | Ohmni", description: "What Ohmni sends to AI providers, what it stores, and how to export or delete your data." };

// Mirrors docs/PRIVACY.md. Keep the two in sync; claim nothing the code does not do.
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy notice">
      <p>
        This notice explains what leaves your browser when you use Ohmni, who receives it, and what Ohmni keeps. Ohmni is operated by
        [Legal entity name] (&quot;we&quot;). Where we have not checked a provider&apos;s policy, this page says <strong>not verified</strong> rather than guessing.
      </p>

      <h2>Do not upload confidential designs</h2>
      <p>
        Image analysis runs on <strong>free plans</strong> of third-party AI providers. Free tiers of AI APIs commonly allow the provider to use
        inputs to improve their models. Their retention periods and training use for our keys are <strong>not verified</strong>, and Ohmni gives
        <strong> no no-training guarantee</strong>. Do not upload confidential or proprietary circuit designs.
      </p>

      <h2>What is sent to AI providers</h2>
      <table>
        <thead><tr><th>Feature</th><th>What is sent</th><th>Provider</th></tr></thead>
        <tbody>
          <tr><td>Schematic upload (extraction)</td><td>The uploaded image (PNG, JPEG or WebP)</td><td>Groq (first reader by default and second &quot;verify&quot; reader); Google Gemini (fallback, or first if configured)</td></tr>
          <tr><td>Routing after extraction</td><td>A text summary of the extracted circuit (component ids, kinds, values, node names, warnings). <strong>Not the image.</strong></td><td>BeatAPI (Jev model)</td></tr>
          <tr><td>Explanations</td><td>The confirmed circuit graph and solver results</td><td>Google Gemini</td></tr>
          <tr><td>Design review mentor (only when requested)</td><td>The circuit graph and the selected finding</td><td>Google Gemini</td></tr>
        </tbody>
      </table>
      <p>
        Circuit solving, probe guidance, repair checks, AC simulation and the other analysis features run on our server and send nothing to an AI
        provider. See <Link href="/subprocessors">Subprocessors</Link> for the full list of services.
      </p>

      <h2>What Ohmni stores</h2>
      <ul>
        <li><strong>Analysis is not stored.</strong> Uploaded images and circuits sent for analysis are processed in memory for the request only.</li>
        <li>
          <strong>Account (optional).</strong> Signing in uses an email magic link through Supabase Auth, which stores your email address and sign-in records.
        </li>
        <li>
          <strong>Saved investigations (optional, signed in).</strong> When you save work, we store in Supabase Postgres (region us-west-2): workspace and project
          names, confirmed circuit graphs, measurements (with any provenance your browser sends, such as a voice transcript), and the engine&apos;s hypotheses,
          repair proposals and verification results. Rows are isolated per workspace by database row-level security.
        </li>
        <li>
          <strong>Images, only if you explicitly save one</strong> with a project. They go to a private storage bucket with their checksum, size, type and your
          AI-processing consent flag; downloads use 60-second signed links issued after a membership check.
        </li>
        <li>
          <strong>Usage metadata.</strong> For signed-in calls linked to a project we store call metadata (provider, model, status, latency, token counts, request id) —
          never prompts, images or model output.
        </li>
        <li>
          <strong>Rate limiting.</strong> Per-IP counters in server memory that expire with their window. When the database is configured, counters for the
          AI routes are also kept in Postgres keyed by a <strong>salted hash</strong> of your IP (never the raw IP) and deleted within a day.
        </li>
        <li><strong>Your browser.</strong> The Build page keeps the current evidence packet in your browser&apos;s session storage; it never leaves the browser unless you export it.</li>
        <li>
          <strong>Logs.</strong> Ohmni&apos;s code does not log request bodies, images or keys. Our hosting provider keeps its own request logs (path, status, IP, timing);
          their retention follows the host&apos;s plan and is <strong>not verified</strong> here. Database backup retention is also <strong>not verified</strong>.
        </li>
      </ul>
      <p>We do not use advertising or analytics cookies. Signing in stores a session token in your browser&apos;s local storage.</p>

      <h2>Your choices: export and deletion</h2>
      <ul>
        <li><strong>Export:</strong> workspace owners and editors can download a full JSON export of a workspace from <Link href="/account">Account</Link>.</li>
        <li><strong>Delete a workspace:</strong> owners can permanently delete a workspace; this deletes all of its rows and stored images.</li>
        <li>
          <strong>Delete your account:</strong> from <Link href="/account">Account</Link>. This deletes the workspaces where you are the only member and removes your sign-in.
          In workspaces shared with others, the rows you entered stay but are no longer attributed to you. If you are the only owner of a shared workspace, make
          another member an owner (or remove the other members) first.
        </li>
      </ul>

      <h2>Consent for AI processing</h2>
      <p>
        The server can be configured to require explicit consent before any content is sent to an AI provider. Until the upload screen ships a consent
        checkbox this requirement is off by default; using upload, explain or mentor features sends the content described above.
      </p>

      <h2>Contact</h2>
      <p>
        Privacy requests: [contact email]. Security issues: report privately via <a href={ADVISORIES_URL}>GitHub security advisories</a>. See also{" "}
        <Link href="/security">Security</Link>.
      </p>
    </LegalPage>
  );
}
