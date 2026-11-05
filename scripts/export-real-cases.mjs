// Exports consented, benchmark-eligible resolved cases into the bench case format (docs/PRODUCTION_PHASE1.md section D):
// <out>/real-<investigation id prefix>/case.json = { source: 'real', graph, gold, observations, inModel, partTolerances }.
// Eligible = the case was labelled on close AND a server-recomputed post-repair verification passed (case_resolutions).
// Anonymised: no workspace/project/investigation names, titles, user ids, emails or images; ids are opaque prefixes.
// Service role (server-side only). Credentials come from env and are never printed. Real customer data: write OUTSIDE
// the repo unless the case owners agreed to publication. Usage:
//   node --env-file=.env.local scripts/export-real-cases.mjs --out <dir> [--dry-run]
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const out = arg('--out');
const dry = process.argv.includes('--dry-run');
if (!out && !dry) throw new Error('--out <dir> is required (or --dry-run)');
const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: service } = process.env;
if (!url || !service) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
const MODELED = new Set(['open', 'short', 'x10', 'x0.1', 'dead']); // probe hypothesis suffixes

const must = ({ data, error }, what) => { if (error) throw new Error(`${what}: ${error.code ?? ''} ${error.message ?? ''}`); return data ?? []; };

const cases = must(
  await db.from('case_resolutions').select('investigation_id, component_id, fault_class, measured_ohms, created_at, investigation:investigations (revision:design_revisions (graph))')
    .eq('benchmark_consent', true).eq('benchmark_eligible', true).order('created_at'),
  'load case resolutions',
);
let written = 0;
for (const c of cases) {
  const ms = must(
    await db.from('measurements').select('id, node, reference_node, quantity, value, instrument, measured_at, supersedes, provenance').eq('investigation_id', c.investigation_id).order('measured_at').order('id'),
    'load measurements',
  );
  // Diagnosis evidence only (same rule as the server): not superseded, not post-repair verification readings.
  const superseded = new Set(ms.map((m) => m.supersedes).filter(Boolean));
  const observations = ms
    .filter((m) => !superseded.has(m.id) && m.provenance?.kind !== 'verification')
    .map((m) => m.quantity === 'resistance'
      ? { kind: 'resistance', a: m.node, b: m.reference_node, ohms: m.value, instrument: m.instrument ?? null, timestamp: m.measured_at }
      : { node: m.node, volts: m.value, instrument: m.instrument ?? null, timestamp: m.measured_at });
  const none = c.fault_class === 'no_fault_found';
  const id = `real-${c.investigation_id.slice(0, 8)}`;
  const doc = {
    id,
    source: 'real',
    graph: c.investigation.revision.graph,
    gold: {
      faults: none ? [] : [`${c.component_id}:${c.fault_class}`],
      faultClass: c.fault_class, // 'no_fault_found' = abstention class, 'other' = out-of-model
      measuredOhms: c.measured_ohms,
      equivalenceClass: null, // ponytail: computed by the bench harness from the graph, not stored here
    },
    observations,
    inModel: MODELED.has(c.fault_class),
    partTolerances: null, // unknown for real boards; the harness applies its default
  };
  if (!dry) {
    mkdirSync(join(out, id), { recursive: true });
    writeFileSync(join(out, id, 'case.json'), JSON.stringify(doc, null, 2) + '\n');
  }
  written++;
}
console.log(`${dry ? 'would export' : 'exported'} ${written} real case(s)${dry ? '' : ` to ${out}`}`);
