import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/ohmni/legal";

export const metadata: Metadata = { title: "Subprocessors | Ohmni", description: "Third-party services that process data for Ohmni." };

// Source of truth: docs/PRIVACY.md and src/lib/ai (groq.ts, gemini.ts, jev.ts).
const ROWS: [string, string, string, string][] = [
  ["Vercel", "Hosting and serverless functions", "All requests to the site and API (request path, status, IP address, timing in platform logs); uploads pass through in memory", "Not verified"],
  ["Supabase", "Database, sign-in and file storage", "Your email and sign-in records; saved workspaces, projects, circuits, measurements and results; images you explicitly save; salted-hash IP rate-limit counters", "Project region us-west-2 (USA)"],
  ["Groq", "Schematic image reading (first and verification reader)", "The uploaded schematic image", "Not verified"],
  ["Google (Gemini API)", "Schematic image reading (fallback), explanations, review mentor", "The uploaded image when used as reader; the confirmed circuit graph and solver results for explanations; graph and selected finding for the mentor", "Not verified"],
  ["BeatAPI (Jev model)", "Routing the next step after extraction", "A text summary of the extracted circuit (component ids, kinds, values, node names, warnings) — not the image", "Not verified"],
];

export default function SubprocessorsPage() {
  return (
    <LegalPage title="Subprocessors">
      <p>
        These services process data on behalf of Ohmni. AI providers are used on free plans; their retention and training terms for our keys are
        not verified — see the <Link href="/privacy">Privacy notice</Link>.
      </p>
      <table>
        <thead><tr><th>Provider</th><th>Purpose</th><th>Data it receives</th><th>Location</th></tr></thead>
        <tbody>{ROWS.map(([p, purpose, data, loc]) => <tr key={p}><td>{p}</td><td>{purpose}</td><td>{data}</td><td>{loc}</td></tr>)}</tbody>
      </table>
      <p>We will update this page before adding a new subprocessor that receives your content.</p>
    </LegalPage>
  );
}
