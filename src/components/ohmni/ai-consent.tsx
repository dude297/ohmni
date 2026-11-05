"use client";

// Shared AI-processing consent for every UI that calls a model route (/api/extract, /api/explain, /api/review mentor).
// One sessionStorage key (lab-helpers) so consent given on one page applies on the others for this tab session.
// The server enforces it only when REQUIRE_AI_CONSENT=1 (src/lib/server/consent.ts); the UI always asks.
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { readConsent, writeConsent } from "./lab-helpers";

const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function setAiConsent(v: boolean) {
  writeConsent(v);
  listeners.forEach((l) => l());
}

/** Current consent (false during SSR) and a setter shared across components. */
export function useAiConsent(): [boolean, (v: boolean) => void] {
  return [useSyncExternalStore(subscribe, readConsent, () => false), setAiConsent];
}

/** JSON body for a model route: adds `aiConsent: true` only when the user consented. */
export function withAiConsent<T extends object>(body: T, consent: boolean): T & { aiConsent?: true } {
  return consent ? { ...body, aiConsent: true } : body;
}

export const CONSENT_NEEDED = "Tick the AI processing consent box to use this AI feature.";

export function AiConsent({ what, note, inline = true }: { what: string; note?: string; inline?: boolean }) {
  const [consent, setConsent] = useAiConsent();
  return (
    <label className={`ai-consent${inline ? " inline" : ""}`}>
      <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
      <span>I agree that {what}, on free tiers whose terms may allow training on it.{note ? ` ${note}` : ""} <Link href="/privacy">Privacy</Link></span>
    </label>
  );
}
