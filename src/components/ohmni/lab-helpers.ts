// Small pure helpers for the lab: AI consent memory, diagnosis-honesty gate, save-measurement bodies.
import type { Observation } from "../../lib/probe";

export const FIT_CAUTION =
  "Measurements don't match any modelled single fault — check the graph or take another reading.";

/** True when the probe result must not be shown as a confident verdict. */
export function fitCaution(step: { fit?: "good" | "poor"; hypotheses?: { id: string }[] } | null | undefined) {
  return !!step && (step.fit === "poor" || step.hypotheses?.[0]?.id === "unmodeled");
}

const KEY = "ohmni.aiConsent";
// ponytail: session-only memory; try/catch because storage can throw in private mode / blocked site data.
export function readConsent() {
  try { return sessionStorage.getItem(KEY) === "1"; } catch { return false; }
}
export function writeConsent(v: boolean) {
  try { if (v) sessionStorage.setItem(KEY, "1"); else sessionStorage.removeItem(KEY); } catch { /* not remembered */ }
}

/** Measurement bodies for POST /api/v1/investigations/:id/measurements: finite readings, exact duplicates dropped. */
export function measurementBodies(obs: Observation[]) {
  const seen = new Set<string>();
  return obs
    .filter((o) => o.node && Number.isFinite(o.volts) && !seen.has(`${o.node}=${o.volts}`) && seen.add(`${o.node}=${o.volts}`))
    .map((o) => ({ node: o.node, volts: o.volts, method: "typed" as const }));
}
