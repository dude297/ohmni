import type { CircuitGraph } from '../src/lib/circuit/types';

// Test/bench-only exact reference: the same MNA system as solveDC, solved in BigInt rationals (no rounding anywhere).
// Values enter as their exact binary value (a double is a dyadic rational), so the reference solves exactly the system solveDC was given.
export type Q = { n: bigint; d: bigint }; // d > 0, reduced

const gcd = (a: bigint, b: bigint): bigint => { a = a < BigInt(0) ? -a : a; b = b < BigInt(0) ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
const q = (n: bigint, d = BigInt(1)): Q => { if (d < BigInt(0)) { n = -n; d = -d; } const g = gcd(n, d) || BigInt(1); return { n: n / g, d: d / g }; };
const add = (a: Q, b: Q) => q(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a: Q, b: Q) => q(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a: Q, b: Q) => q(a.n * b.n, a.d * b.d);
const div = (a: Q, b: Q) => q(a.n * b.d, a.d * b.n);
const ZERO = q(BigInt(0)), ONE = q(BigInt(1));

/** Exact rational value of a finite double. */
export function fromNumber(x: number): Q {
  if (!Number.isFinite(x)) throw new Error('non-finite');
  let d = BigInt(1);
  while (!Number.isInteger(x)) { x *= 2; d *= BigInt(2); } // exact: scaling by 2 never rounds at these magnitudes
  return q(BigInt(x), d);
}

/** Nearest-ish double of a rational (relative error ~1e-16), safe for huge numerators/denominators. */
export function toNumber(a: Q): number {
  if (a.n === BigInt(0)) return 0;
  const neg = a.n < BigInt(0), n = neg ? -a.n : a.n;
  const k = n.toString(2).length - a.d.toString(2).length;
  const scaled = k > 60 ? n / (a.d << BigInt(k - 60)) : (n << BigInt(60 - k)) / a.d; // ~2^60
  return (neg ? -1 : 1) * Number(scaled) * 2 ** (k - 60);
}

/** Exact node voltages of the DC MNA system (same stamps as src/lib/circuit/solve.ts). Throws on a singular system. */
export function solveExact(graph: CircuitGraph): Record<string, Q> {
  const nodes = [...new Set(graph.components.flatMap((c) => [c.positiveNode, c.negativeNode]))].filter((n) => n !== graph.groundNode);
  const idx = new Map(nodes.map((n, i) => [n, i]));
  const sources = graph.components.filter((c) => c.kind === 'dc_voltage');
  const n = nodes.length + sources.length;
  const A: Q[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => ZERO));
  const b: Q[] = Array.from({ length: n }, () => ZERO);
  for (const c of graph.components) {
    const p = idx.get(c.positiveNode), m = idx.get(c.negativeNode);
    if (c.kind === 'resistor') {
      const g = div(ONE, fromNumber(c.value));
      if (p !== undefined) A[p][p] = add(A[p][p], g);
      if (m !== undefined) A[m][m] = add(A[m][m], g);
      if (p !== undefined && m !== undefined) { A[p][m] = sub(A[p][m], g); A[m][p] = sub(A[m][p], g); }
    } else {
      const k = nodes.length + sources.indexOf(c);
      if (p !== undefined) { A[p][k] = add(A[p][k], ONE); A[k][p] = add(A[k][p], ONE); }
      if (m !== undefined) { A[m][k] = sub(A[m][k], ONE); A[k][m] = sub(A[k][m], ONE); }
      b[k] = fromNumber(c.value);
    }
  }
  for (let col = 0; col < n; col++) {
    const piv = A.findIndex((r, i) => i >= col && r[col].n !== BigInt(0)); // exact arithmetic: any nonzero pivot is fine
    if (piv < 0) throw new Error('singular');
    [A[col], A[piv]] = [A[piv], A[col]];
    [b[col], b[piv]] = [b[piv], b[col]];
    for (let r = col + 1; r < n; r++) {
      if (A[r][col].n === BigInt(0)) continue;
      const f = div(A[r][col], A[col][col]);
      for (let c = col; c < n; c++) A[r][c] = sub(A[r][c], mul(f, A[col][c]));
      b[r] = sub(b[r], mul(f, b[col]));
    }
  }
  const x: Q[] = Array.from({ length: n }, () => ZERO);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let c = r + 1; c < n; c++) s = sub(s, mul(A[r][c], x[c]));
    x[r] = div(s, A[r][r]);
  }
  const v: Record<string, Q> = { [graph.groundNode]: ZERO };
  nodes.forEach((name, i) => (v[name] = x[i]));
  return v;
}
