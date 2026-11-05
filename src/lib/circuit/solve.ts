import type { CircuitGraph } from './types';

// Owner: Agent A. Deterministic DC Modified Nodal Analysis. Input must already pass validateGraph.
export class SolveError extends Error {}

// currents[id]:
//  - resistor: (V(positiveNode) - V(negativeNode)) / R, i.e. flowing positiveNode -> negativeNode.
//  - dc_voltage: MNA convention: current flowing INTO the positive terminal, through the source, out of
//    the negative terminal. A source delivering power to a load therefore reports a NEGATIVE current.
// warnings/residual are only present when the numerical check failed: warnings ['ill_conditioned'] means the
// (compensated) KCL residual of the returned solution exceeds RESIDUAL_WARN (relative to the largest current), so treat results as approximate.
export type DCSolution = { voltages: Record<string, number>; currents: Record<string, number>; warnings?: string[]; residual?: number };

const PIVOT_EPS = 1e-13; // relative: pivot / (magnitude of its original row)
const RESIDUAL_WARN = 1e-9;
const REFINE_ABOVE = 1e-13; // componentwise; below it the plain-elimination result is returned bit-for-bit

// Gaussian elimination with scaled partial pivoting. Singular when no remaining pivot is meaningful relative to its own row.
function lu(A0: number[][], b0: number[]): number[] {
  const n = b0.length;
  const A = A0.map((r) => [...r]);
  const b = [...b0];
  const scale = A.map((r) => Math.max(...r.map(Math.abs), 0));
  for (let col = 0; col < n; col++) {
    let piv = col;
    let best = -1;
    for (let r = col; r < n; r++) {
      const q = scale[r] > 0 ? Math.abs(A[r][col]) / scale[r] : 0;
      if (q > best) {
        best = q;
        piv = r;
      }
    }
    if (best < PIVOT_EPS) throw new SolveError('circuit is singular (e.g. conflicting/looped voltage sources or floating nodes)');
    [A[col], A[piv]] = [A[piv], A[col]];
    [b[col], b[piv]] = [b[piv], b[col]];
    [scale[col], scale[piv]] = [scale[piv], scale[col]];
    for (let r = col + 1; r < n; r++) {
      const f = A[r][col] / A[col][col];
      if (f === 0) continue;
      for (let c = col; c < n; c++) A[r][c] -= f * A[col][c];
      b[r] -= f * b[col];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let c = r + 1; c < n; c++) s -= A[r][c] * x[c];
    x[r] = s / A[r][r];
  }
  return x;
}

export function solveDC(graph: CircuitGraph): DCSolution {
  const nodes = [...new Set(graph.components.flatMap((c) => [c.positiveNode, c.negativeNode]))].filter(
    (n) => n !== graph.groundNode,
  );
  const idx = new Map(nodes.map((n, i) => [n, i]));
  const sources = graph.components.filter((c) => c.kind === 'dc_voltage');
  const n = nodes.length + sources.length;
  const A = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const b = new Array<number>(n).fill(0);

  for (const c of graph.components) {
    const p = idx.get(c.positiveNode);
    const q = idx.get(c.negativeNode);
    if (c.kind === 'resistor') {
      if (!(c.value > 0) || !Number.isFinite(c.value)) throw new SolveError(`${c.id}: invalid resistance`);
      const g = 1 / c.value;
      if (p !== undefined) A[p][p] += g;
      if (q !== undefined) A[q][q] += g;
      if (p !== undefined && q !== undefined) {
        A[p][q] -= g;
        A[q][p] -= g;
      }
    } else {
      const k = nodes.length + sources.indexOf(c);
      if (p !== undefined) {
        A[p][k] += 1;
        A[k][p] += 1;
      }
      if (q !== undefined) {
        A[q][k] -= 1;
        A[k][q] -= 1;
      }
      b[k] = c.value;
    }
  }

  const x0 = lu(A, b);
  if (x0.some((v) => !Number.isFinite(v))) throw new SolveError('non-finite solution');

  const build = (x: number[]) => {
    const voltages: Record<string, number> = { [graph.groundNode]: 0 };
    nodes.forEach((name, i) => (voltages[name] = x[i]));
    const currents: Record<string, number> = {};
    for (const c of graph.components) {
      currents[c.id] =
        c.kind === 'resistor'
          ? (voltages[c.positiveNode] - voltages[c.negativeNode]) / c.value
          : x[nodes.length + sources.indexOf(c)];
    }
    // Residual b - A*x of what the caller actually receives, computed branch-wise from the returned currents (not from the
    // assembled A, whose stamped conductance sums already lost digits) with compensated (Neumaier) sums: node rows = minus the
    // KCL imbalance, source rows = value - (V+ - V-). rel = worst node imbalance / largest current, or source-row error / largest voltage.
    const sum = Array.from({ length: n }, () => [0, 0, 0]); // [sum, compensation, sum of |terms|]
    const acc = (k: number | undefined, v: number) => {
      if (k === undefined) return;
      const a = sum[k], t = a[0] + v;
      a[1] += Math.abs(a[0]) >= Math.abs(v) ? a[0] - t + v : v - t + a[0];
      a[0] = t;
      a[2] += Math.abs(v);
    };
    for (const c of graph.components) {
      const p = idx.get(c.positiveNode), q = idx.get(c.negativeNode);
      acc(p, -currents[c.id]);
      acc(q, currents[c.id]);
      if (c.kind === 'dc_voltage') {
        const k = nodes.length + sources.indexOf(c);
        acc(k, c.value);
        acc(k, -voltages[c.positiveNode]);
        acc(k, voltages[c.negativeNode]);
      }
    }
    const r = sum.map(([t, e]) => t + e);
    const iMax = Math.max(...Object.values(currents).map(Math.abs), 0);
    const vMax = Math.max(...Object.values(voltages).map(Math.abs), 0);
    const rel = Math.max(
      iMax > 0 ? Math.max(0, ...r.slice(0, nodes.length).map(Math.abs)) / iMax : 0,
      vMax > 0 ? Math.max(0, ...r.slice(nodes.length).map(Math.abs)) / vMax : 0,
    );
    const cw = Math.max(0, ...r.map((v, k) => (sum[k][2] > 0 ? Math.abs(v) / sum[k][2] : 0))); // per-row backward error
    return { x, voltages, currents, rel, r, cw };
  };

  let out = build(x0);
  // Iterative refinement with the accurate residual above (ponytail: re-factors each step; validated graphs are small).
  // Recovers full voltage precision whenever cond(A) * 2^-53 < 1, e.g. 1 mOhm next to 1 GOhm (bench/solver-stress.ts exactStress).
  // Gated on the per-row (componentwise) residual, not rel: rel is relative to the largest current, so a node carrying only nA
  // next to an amp-level branch can be off by 1e-6 at rel ~1e-12. Stops when the correction stops shrinking (divergence: cond(A) beyond double precision).
  let prev = Infinity;
  for (let step = 0; step < 3 && out.cw > REFINE_ABOVE; step++) {
    let d: number[];
    try {
      d = lu(A, out.r);
    } catch {
      break;
    }
    const size = Math.max(...d.map(Math.abs));
    const xr = out.x.map((v, k) => v + d[k]);
    if (!(size < prev) || !xr.every(Number.isFinite)) break;
    prev = size;
    out = build(xr);
  }
  const { voltages, currents, rel } = out;
  return rel > RESIDUAL_WARN ? { voltages, currents, warnings: ['ill_conditioned'], residual: rel } : { voltages, currents };
}
