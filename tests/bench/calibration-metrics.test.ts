import { describe, expect, it } from 'vitest';
import { brier, calibrationReport, ece, reliability, type CalSample } from '@/lib/bench/calibration';
import { fromNumber, solveExact, toNumber } from '../../bench/exact-solver';
import { exactStress } from '../../bench/solver-stress';
import { solveDC } from '@/lib/circuit/solve';
import { DIVIDER_10K_10K, LOADED_BRIDGE_12V } from '@/lib/circuit/fixtures';

// p in bin centre, correct with exactly that frequency -> perfectly calibrated
function calibrated(): CalSample[] {
  const out: CalSample[] = [];
  for (let b = 0; b < 10; b++) for (let i = 0; i < 20; i++) out.push({ p: (b + 0.5) / 10, correct: i < (b + 0.5) * 2 });
  return out;
}

describe('calibration metrics', () => {
  it('perfectly calibrated synthetic set has ECE ~ 0', () => {
    expect(ece(calibrated())).toBeLessThan(1e-12);
  });

  it('always 1.0 but 50 % right has ECE 0.5 and Brier 0.5', () => {
    const s = Array.from({ length: 100 }, (_, i) => ({ p: 1, correct: i % 2 === 0 }));
    expect(ece(s)).toBeCloseTo(0.5, 12);
    expect(brier(s)).toBeCloseTo(0.5, 12);
    expect(reliability(s)[9]).toMatchObject({ n: 100, meanConfidence: 1, accuracy: 0.5 });
  });

  it('Brier on known values', () => {
    // (0.8-1)^2 + (0.6-0)^2 + (0.3-0)^2 + (1-1)^2 = 0.04 + 0.36 + 0.09 + 0 = 0.49 -> /4
    expect(brier([{ p: 0.8, correct: true }, { p: 0.6, correct: false }, { p: 0.3, correct: false }, { p: 1, correct: true }])).toBeCloseTo(0.1225, 12);
    expect(brier([])).toBe(0);
  });

  it('report lists only non-empty bins with n', () => {
    const r = calibrationReport([{ p: 0.95, correct: true }, { p: 0.05, correct: false }]);
    expect(r).toMatchObject({ n: 2, ece: 0.05, reliability: [{ bin: '0.0-0.1', n: 1 }, { bin: '0.9-1.0', n: 1 }] });
  });
});

describe('exact rational MNA reference', () => {
  it('fromNumber/toNumber round-trip and exact divider', () => {
    for (const x of [1e-3, 0.1, 5, 1e12, 123.456]) expect(toNumber(fromNumber(x))).toBe(x);
    const v = solveExact(DIVIDER_10K_10K);
    expect(v.VOUT).toEqual({ n: BigInt(5), d: BigInt(2) }); // 5 V across 10k/10k, exactly 2.5
  });

  it('agrees with solveDC on a well-conditioned fixture to ~1e-15', () => {
    const ex = solveExact(LOADED_BRIDGE_12V), s = solveDC(LOADED_BRIDGE_12V);
    for (const [n, q] of Object.entries(ex)) expect(Math.abs(s.voltages[n] - toNumber(q))).toBeLessThan(1e-13);
  });

  it('small exact-error bench runs and stays near double precision on most nets', () => {
    const r = exactStress(solveDC, 9, 50, 7);
    expect(r.cases).toBe(50);
    expect(r.thrown).toBe(0);
    expect(r.worstNorm).toBeLessThan(1e-3);
  });
});
