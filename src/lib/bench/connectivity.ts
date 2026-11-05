// Phase 02 promotion gate: score an extracted netlist against a hand-labelled gold netlist.
// Pure, deterministic, no model calls. Component ids and non-ground node names may differ between gold and
// extraction, so connectivity is compared as graph isomorphism with GND (and the measure node) pinned.

export type NetComponent = { kind: string; value: number; positiveNode: string; negativeNode: string };
export type Netlist = { components: NetComponent[]; measureNode?: string | null };
export type ConnectivityScore = {
  exact: boolean; // isomorphic with kinds AND values equal: the Phase 02 promotion metric
  connectivityExact: boolean; // isomorphic on kinds + wiring only (values ignored)
  precision: number; // predicted components matching a gold component by kind+value
  recall: number; // gold components found by kind+value
  valueAccuracy: number; // of components matched by kind, fraction whose value also matches
  gold: number;
  predicted: number;
};

const GND = 'GND';
const MAX_NODES = 9; // ponytail: brute-force mapping with pruning; 9! worst case. Use VF2 if benchmark images get denser.
const vkey = (v: number) => String(Number(v.toPrecision(6)));
const nodesOf = (n: Netlist) => [...new Set(n.components.flatMap((c) => [c.positiveNode, c.negativeNode]))].filter((x) => x !== GND);

function sig(c: NetComponent, map: (n: string) => string, values: boolean) {
  const a = map(c.positiveNode), b = map(c.negativeNode);
  const ends = c.kind === 'resistor' ? [a, b].sort().join(',') : `${a}>${b}`; // source polarity matters
  return `${c.kind}|${values ? vkey(c.value) : ''}|${ends}`;
}

// Per-node fingerprint used to prune the mapping search: what is attached, ignoring neighbour names.
function fingerprints(n: Netlist, values: boolean) {
  const fp = new Map<string, string[]>();
  for (const c of n.components)
    for (const [end, other] of [[c.positiveNode, c.negativeNode], [c.negativeNode, c.positiveNode]] as const) {
      const tag = `${c.kind}|${values ? vkey(c.value) : ''}|${c.kind === 'resistor' ? '' : end === c.positiveNode ? '+' : '-'}|${other === GND ? 'g' : ''}`;
      fp.set(end, [...(fp.get(end) ?? []), tag]);
    }
  return new Map([...fp].map(([k, v]) => [k, v.sort().join(';')]));
}

/** True when `got` is `gold` up to renaming of non-ground nodes (and component ids). */
export function isomorphic(gold: Netlist, got: Netlist, values = true): boolean {
  if (gold.components.length !== got.components.length) return false;
  const gn = nodesOf(gold), hn = nodesOf(got);
  if (gn.length !== hn.length || gn.length > MAX_NODES) return false;
  const target = gold.components.map((c) => sig(c, (x) => x, values)).sort().join(';');
  const fg = fingerprints(gold, values), fh = fingerprints(got, values);
  const map = new Map<string, string>();
  const used = new Set<string>();
  const pinned = gold.measureNode && got.measureNode ? [got.measureNode, gold.measureNode] : null;
  const search = (i: number): boolean => {
    if (i === hn.length) return got.components.map((c) => sig(c, (x) => (x === GND ? GND : map.get(x)!), values)).sort().join(';') === target;
    const h = hn[i];
    for (const g of gn) {
      if (used.has(g) || fg.get(g) !== fh.get(h)) continue;
      if (pinned && (h === pinned[0]) !== (g === pinned[1])) continue;
      map.set(h, g);
      used.add(g);
      if (search(i + 1)) return true;
      used.delete(g);
    }
    map.delete(h);
    return false;
  };
  if (pinned && pinned[0] !== GND && !hn.includes(pinned[0])) return false;
  return search(0);
}

// Multiset intersection size of two key lists.
function overlap(a: string[], b: string[]) {
  const pool = new Map<string, number>();
  for (const k of b) pool.set(k, (pool.get(k) ?? 0) + 1);
  let n = 0;
  for (const k of a) if ((pool.get(k) ?? 0) > 0) { pool.set(k, pool.get(k)! - 1); n++; }
  return n;
}

/** Score one extraction. `got` null (no graph produced) scores zero on everything. */
export function scoreConnectivity(gold: Netlist, got: Netlist | null): ConnectivityScore {
  const pred = got?.components ?? [];
  const kv = (c: NetComponent) => `${c.kind}|${vkey(c.value)}`;
  const hit = overlap(gold.components.map(kv), pred.map(kv));
  const kindHit = overlap(gold.components.map((c) => c.kind), pred.map((c) => c.kind));
  return {
    exact: !!got && isomorphic(gold, got, true),
    connectivityExact: !!got && isomorphic(gold, got, false),
    precision: pred.length ? hit / pred.length : 0,
    recall: gold.components.length ? hit / gold.components.length : 0,
    valueAccuracy: kindHit ? hit / kindHit : 0,
    gold: gold.components.length,
    predicted: pred.length,
  };
}

/** Aggregate over a benchmark run. n is reported so tiny samples are never mistaken for a rate. */
export function summarize(scores: ConnectivityScore[]) {
  const mean = (f: (s: ConnectivityScore) => number) => (scores.length ? scores.reduce((a, s) => a + f(s), 0) / scores.length : 0);
  return {
    n: scores.length,
    exact: scores.filter((s) => s.exact).length,
    connectivityExact: scores.filter((s) => s.connectivityExact).length,
    meanPrecision: mean((s) => s.precision),
    meanRecall: mean((s) => s.recall),
    meanValueAccuracy: mean((s) => s.valueAccuracy),
  };
}
