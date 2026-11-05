import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "./brand";
import "./legal.css";

export const LEGAL_UPDATED = "2026-11-05";
export const ADVISORIES_URL = "https://github.com/dude297/ohmni/security/advisories/new";

/** Small footer with the legal/compliance links; used on the home page, legal pages and /account. */
export function LegalLinks() {
  return (
    <nav aria-label="Legal" className="legal-links">
      <Link href="/privacy">Privacy</Link>
      <Link href="/terms">Terms</Link>
      <Link href="/subprocessors">Subprocessors</Link>
      <Link href="/security">Security</Link>
      <Link href="/account">Account</Link>
    </nav>
  );
}

/** Plain, server-rendered page shell for legal text. `draft` adds the counsel-review banner and last-updated line. */
export function LegalPage({ title, children, draft = true }: { title: string; children: ReactNode; draft?: boolean }) {
  return (
    <div className="legal-page">
      <header className="legal-header"><Brand /></header>
      <main className="legal">
        {draft && <p className="legal-banner" role="note">Draft for beta — to be reviewed by counsel before commercial launch</p>}
        <h1>{title}</h1>
        {draft && <p className="legal-updated">Last updated {LEGAL_UPDATED}</p>}
        {children}
      </main>
      <footer className="legal-footer"><LegalLinks /></footer>
    </div>
  );
}
