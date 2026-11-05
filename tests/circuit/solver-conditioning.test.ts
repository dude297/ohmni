import { describe, expect, it } from 'vitest';
import { solveDC, SolveError } from '../../src/lib/circuit/solve';
import { DIVIDER_10K_10K, LOADED_BRIDGE_12V, SERIES_PARALLEL_12V } from '../../src/lib/circuit/fixtures';
import { exactStress, kclViolation, stress, tinyR1 } from '../../bench/solver-stress';
import { solveExact, toNumber } from '../../bench/exact-solver';
import type { CircuitGraph } from '../../src/lib/circuit/types';

describe('solver numerical honesty', () => {
  it('well-conditioned fixtures carry no warnings', () => {
    for (const g of [DIVIDER_10K_10K, SERIES_PARALLEL_12V, LOADED_BRIDGE_12V]) expect(solveDC(g).warnings).toBeUndefined();
  });

  it('R1 = 1e-12 ohm: the 11 % KCL violation is reported, not silent', () => {
    const s = solveDC(tinyR1());
    expect(kclViolation(tinyR1(), s)).toBeGreaterThan(1e-3);
    expect(s.warnings).toEqual(['ill_conditioned']);
    expect(s.residual).toBeGreaterThan(1e-9);
  });

  it('1 mOhm - 1 TOhm random networks: any KCL violation above 1e-6 is flagged ill_conditioned', () => {
    const r = stress(solveDC, 400, 99);
    expect(r.over1e6).toBeGreaterThan(0); // the regime really is hard
    expect(r.silentOver1e6).toBe(0);
  });

  it('still rejects genuinely singular circuits (floating node, source loop)', () => {
    const floating: CircuitGraph = { schemaVersion: 1, groundNode: 'GND', measureNode: 'A', components: [
      { id: 'V1', kind: 'dc_voltage', value: 5, positiveNode: 'A', negativeNode: 'GND' },
      { id: 'R1', kind: 'resistor', value: 1000, positiveNode: 'B', negativeNode: 'C' },
    ] };
    expect(() => solveDC(floating)).toThrow(SolveError);
    const loop: CircuitGraph = { schemaVersion: 1, groundNode: 'GND', measureNode: 'A', components: [
      { id: 'V1', kind: 'dc_voltage', value: 5, positiveNode: 'A', negativeNode: 'GND' },
      { id: 'V2', kind: 'dc_voltage', value: 3, positiveNode: 'A', negativeNode: 'GND' },
      { id: 'R1', kind: 'resistor', value: 1000, positiveNode: 'A', negativeNode: 'GND' },
    ] };
    expect(() => solveDC(loop)).toThrow(SolveError);
  });

  it('extreme-but-benign scale (all parts 1 GOhm) is solved exactly and unflagged', () => {
    const g: CircuitGraph = { ...DIVIDER_10K_10K, components: DIVIDER_10K_10K.components.map((c) => (c.kind === 'resistor' ? { ...c, value: 1e9 } : c)) };
    const s = solveDC(g);
    expect(s.voltages.VOUT).toBeCloseTo(2.5, 9);
    expect(s.warnings).toBeUndefined();
  });
  it('regression: nA cluster next to an amp-level branch is solved to full precision (was 1.6e-6 off, above the 5 V supply, unflagged)', () => {
    // exactStress seed 4242 net #136: A-B tied by 2.6 mOhm, hung between VIN and C by 88 MOhm / 295 MOhm, while X2 76 Ohm carries 66 mA.
    const R = (id: string, a: string, b: string, value: number) => ({ id, kind: 'resistor' as const, value, positiveNode: a, negativeNode: b });
    const g: CircuitGraph = { schemaVersion: 1, groundNode: 'GND', measureNode: 'A', components: [
      { id: 'V1', kind: 'dc_voltage', value: 5, positiveNode: 'VIN', negativeNode: 'GND' },
      R('R1', 'VIN', 'A', 88521700), R('R2', 'A', 'B', 0.00261822), R('R3', 'B', 'C', 295283000), R('R4', 'C', 'D', 19095500),
      R('R5', 'D', 'GND', 957.084), R('X1', 'D', 'VIN', 0.00103213), R('X2', 'VIN', 'GND', 76.2674),
    ] };
    const s = solveDC(g), ex = solveExact(g);
    for (const [n, q] of Object.entries(ex)) expect(Math.abs(s.voltages[n] - toNumber(q)), n).toBeLessThanOrEqual(1e-14 * 5);
    expect(s.voltages.A).toBeLessThanOrEqual(5);
  });

  it('node voltages within 1e-6 of the exact rational solution on random 1 mOhm - 1 GOhm networks', () => {
    const r = exactStress(solveDC, 9, 150, 5);
    expect(r.over1e6).toBe(0);
    expect(r.worstRel).toBeLessThan(1e-12);
  });
});
