// Calibration metrics on top-1 probability. A sample is (p = probability the model gave its top answer, correct = was it right).
export type CalSample = { p: number; correct: boolean };
export type ReliabilityBin = { lo: number; hi: number; n: number; meanConfidence: number; accuracy: number };

/** 10 equal-width bins on p; p = 1 falls in the last bin. Empty bins have n = 0 and NaN-free zeros. */
export function reliability(samples: CalSample[], bins = 10): ReliabilityBin[] {
  const out = Array.from({ length: bins }, (_, i) => ({ lo: i / bins, hi: (i + 1) / bins, n: 0, sp: 0, sc: 0 }));
  for (const s of samples) {
    const b = out[Math.min(bins - 1, Math.max(0, Math.floor(s.p * bins)))];
    b.n++; b.sp += s.p; b.sc += +s.correct;
  }
  return out.map(({ lo, hi, n, sp, sc }) => ({ lo, hi, n, meanConfidence: n ? sp / n : 0, accuracy: n ? sc / n : 0 }));
}

/** Expected Calibration Error: sum over bins of (n_b / N) * |accuracy_b - meanConfidence_b|. */
export function ece(samples: CalSample[], bins = 10): number {
  return samples.length ? reliability(samples, bins).reduce((s, b) => s + (b.n / samples.length) * Math.abs(b.accuracy - b.meanConfidence), 0) : 0;
}

/** Brier score of the top-1 probability against the 0/1 outcome. */
export function brier(samples: CalSample[]): number {
  return samples.length ? samples.reduce((s, x) => s + (x.p - +x.correct) ** 2, 0) / samples.length : 0;
}

export function calibrationReport(samples: CalSample[]) {
  const r4 = (x: number) => +x.toFixed(4);
  return {
    n: samples.length, ece: r4(ece(samples)), brier: r4(brier(samples)),
    reliability: reliability(samples).filter((b) => b.n > 0).map((b) => ({ bin: `${b.lo.toFixed(1)}-${b.hi.toFixed(1)}`, n: b.n, conf: r4(b.meanConfidence), acc: r4(b.accuracy) })),
  };
}
