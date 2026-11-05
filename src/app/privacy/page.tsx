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
          <strong>Usage metadata.</strong> For signed-in calls linked to a project by an owner or editor we store call metadata (provider, model, status, latency,
          token counts, request id) — never prompts, images or model output.
        </li>
        <li>
          <strong>Audit log.</strong> We record exactly these actions on saved data: workspace create, export and delete (including workspaces deleted with
          an account), member add, role change and removal, project create, circuit confirm, investigation open and close, benchmark-consent changes, image
          upload and account deletion. Each event holds who (user id), what (action, record type and id), when, and a request id — never names, emails, titles,
          circuits, readings or images. Workspace owners can read it. It outlives a deleted workspace or account (with the workspace link and the actor cleared;
          an account-deletion event keeps the deleted user&apos;s id, which is pseudonymous, not anonymous).
        </li>
        <li>
          <strong>Resolved-case labels.</strong> When an owner or editor closes an investigation as resolved they may record the confirmed fault (component,
          fault type, an optional out-of-circuit reading, and who resolved it). These labels are part of the workspace, included in its export and deleted with it.
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

      <h2>Benchmark use of resolved cases (opt-in)</h2>
      <p>
        A resolved case is used to measure Ohmni&apos;s diagnosis accuracy <strong>only if a workspace owner opts in</strong> (editors cannot; an editor&apos;s
        request is stored as &quot;no&quot;). Owners can grant or withdraw this later. Even with consent, a case is exported only if our server verified, from a
        post-repair reading, that the repair of exactly the confirmed fault worked. The export contains the circuit, the readings and the fault label — no names,
        titles, user ids or images. Withdrawing consent or deleting the workspace or account stops future exports, but <strong>exports already made are
        kept</strong>.
      </p>

      <h2>Retention</h2>
      <ul>
        <li>Usage metadata: deleted after <strong>90 days</strong>.</li>
        <li>Audit events: deleted after <strong>400 days</strong>.</li>
        <li>
          Both deletions run from a scheduled database job that the operator must enable; until it is scheduled, usage metadata is kept until its workspace is
          deleted and audit events are kept indefinitely. Everything else is kept until you delete it (see below).
        </li>
      </ul>

      <h2>Your choices: export and deletion</h2>
      <ul>
        <li>
          <strong>Export:</strong> workspace owners and editors can download a full JSON export of a workspace from <Link href="/account">Account</Link>, including
          resolved-case labels; owners&apos; exports also include the workspace&apos;s audit log.
        </li>
        <li><strong>Delete a workspace:</strong> owners can permanently delete a workspace; this deletes all of its rows and stored images.</li>
        <li>
          <strong>Delete your account:</strong> from <Link href="/account">Account</Link>, within 10 minutes of signing in. This deletes the workspaces where you are the only member and removes your sign-in.
          In workspaces shared with others, the rows you entered stay but are no longer attributed to you. If you are the only owner of a shared workspace, make
          another member an owner (or remove the other members) first.
        </li>
      </ul>

      <h2>Consent for AI processing</h2>
      <p>
        The upload screen in the <Link href="/lab">Lab</Link> has a consent checkbox: no image is sent to an AI provider until you tick it, and your browser
        remembers the choice. Explanations and the design-review mentor send the content described above when you ask for them. The server can also be
        configured to refuse any AI request that does not carry consent.
      </p>

      <h2>Contact</h2>
      <p>
        Privacy requests: <strong>[contact email — to be added before public launch]</strong>. Security issues: report privately via <a href={ADVISORIES_URL}>GitHub security advisories</a>. See also{" "}
        <Link href="/security">Security</Link>.
      </p>
    </LegalPage>
  );
}
