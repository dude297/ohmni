import { describe, expect, it } from "vitest";
import { fitCaution, measurementBodies } from "./lab-helpers";
import { probeStep } from "../../lib/probe";
import { DIVIDER_10K_10K } from "../../lib/circuit/fixtures";

describe("fitCaution", () => {
  it("flags poor fit and an unmodeled top hypothesis, not a good modeled fit", () => {
    expect(fitCaution(null)).toBe(false);
    expect(fitCaution({ fit: "poor", hypotheses: [{ id: "R2_open" }] })).toBe(true);
    expect(fitCaution({ fit: "good", hypotheses: [{ id: "unmodeled" }] })).toBe(true);
    expect(fitCaution({ fit: "good", hypotheses: [{ id: "R2_open" }] })).toBe(false);
  });
  it("matches the real probe engine on an impossible reading", () => {
    // 50 V on a 5 V divider cannot be explained by any single modeled fault.
    expect(fitCaution(probeStep(DIVIDER_10K_10K, [{ node: "VOUT", volts: 50 }]))).toBe(true);
  });
});

describe("measurementBodies", () => {
  it("keeps finite readings, drops duplicates and non-finite values", () => {
    expect(measurementBodies([{ node: "VOUT", volts: 0 }, { node: "VOUT", volts: 0 }, { node: "A", volts: NaN }, { node: "A", volts: 1.2 }])).toEqual([
      { node: "VOUT", volts: 0, method: "typed" },
      { node: "A", volts: 1.2, method: "typed" },
    ]);
  });
});
