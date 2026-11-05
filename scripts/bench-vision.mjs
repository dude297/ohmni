// Phase 02 connectivity benchmark: exact connectivity of extracted graphs vs hand-labelled gold netlists
// (fixtures/circuits/expected.json). Scoring is src/lib/bench/connectivity.ts (unit-tested).
//
// Offline (no model calls):  node scripts/bench-vision.mjs --from <dir of saved extraction JSONs>
// Live (spends free-tier quota, opt-in):
//   node scripts/bench-vision.mjs --live [--provider groq|gemini] [--limit 5] [--files a.png,b.png] [--gap-ms 8000] [--save <dir>] [--env <.env.local>]
// Live mode makes ONE call per image, sequentially, sleeping --gap-ms between calls, and stops after 2 consecutive
// rate-limit/quota errors. Keys come from the env file and are never printed. --save writes <image>.json per call,
// which --from can re-score later.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { register } from 'node:module';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const live = argv.includes('--live');
const from = arg('--from', '');
if (live === !!from) {
  console.error('choose exactly one of --live or --from <dir>');
  process.exit(2);
}

register(
  'data:text/javascript,' +
    encodeURIComponent(
      `export async function resolve(s,c,n){try{return await n(s,c)}catch(e){if(s.startsWith('.')&&!/\\.\\w+$/.test(s))return n(s+'.ts',c);throw e}}`,
    ),
);
const { scoreConnectivity, summarize } = await import('../src/lib/bench/connectivity.ts');

const gold = JSON.parse(readFileSync(join(root, 'fixtures/circuits/expected.json'), 'utf8')).circuits;
const runs = []; // { file, provider, model, failure, extraction }

if (from) {
  for (const f of readdirSync(from).filter((f) => f.endsWith('.json'))) runs.push(JSON.parse(readFileSync(join(from, f), 'utf8')));
} else {
  const envFile = arg('--env', join(root, '.env.local'));
  try {
    for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    console.error(`no env file at ${envFile}; relying on process.env`);
  }
  const provider = arg('--provider', 'groq');
  const limit = Number(arg('--limit', 5));
  const gap = Number(arg('--gap-ms', 8000));
  const save = arg('--save', '');
  if (save) mkdirSync(save, { recursive: true });
  const run =
    provider === 'gemini'
      ? (await import('../src/lib/ai/gemini.ts')).extractCircuit
      : (await import('../src/lib/ai/groq.ts')).extractWithGroq;
  let streak = 0;
  const files = arg('--files', '') ? arg('--files', '').split(',') : Object.keys(gold);
  for (const file of files.filter((f) => gold[f]).slice(0, limit)) {
    if (streak >= 2) {
      console.log('stopping: 2 consecutive rate-limit/quota errors');
      break;
    }
    const img = new Uint8Array(readFileSync(join(root, 'fixtures/circuits', file)));
    let r;
    try {
      r = await run(img, 'image/png');
    } catch (e) {
      r = { extraction: { graph: null }, event: {}, failure: e?.message || 'threw' };
    }
    const rec = { file, provider, model: r.event?.model ?? null, failure: r.failure ?? null, latencyMs: r.event?.durationMs ?? null, extraction: r.extraction };
    runs.push(rec);
    if (save) writeFileSync(join(save, `${basename(file, '.png')}.json`), JSON.stringify(rec, null, 1));
    streak = ['rate_limited', 'quota_exhausted'].includes(rec.failure) ? streak + 1 : 0;
    await new Promise((res) => setTimeout(res, gap));
  }
}

const scores = [];
let comps = 0, boxed = 0, withQuestions = 0, apiErrors = 0;
console.log('| image | provider/model | exact | wiring exact (values ignored) | precision | recall | value acc | regions | junction Qs |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const r of runs) {
  const g = gold[r.file];
  if (!g) continue;
  if (r.failure && r.failure !== 'malformed_output') {
    apiErrors++;
    console.log(`| ${r.file} | ${r.provider}/${r.model} | API ERROR ${r.failure} | | | | | | |`);
    continue; // provider outage is not a model-accuracy data point
  }
  const graph = r.extraction?.graph ?? null;
  const s = scoreConnectivity(g, graph);
  scores.push(s);
  const n = graph?.components.length ?? 0;
  const b = graph?.components.filter((c) => c.sourceBoundingBox).length ?? 0;
  const q = r.extraction?.junctionQuestions?.length ?? 0;
  comps += n;
  boxed += b;
  if (q) withQuestions++;
  console.log(
    `| ${r.file} | ${r.provider}/${r.model} | ${s.exact} | ${s.connectivityExact} | ${s.precision.toFixed(2)} | ${s.recall.toFixed(2)} | ${s.valueAccuracy.toFixed(2)} | ${b}/${n} | ${q} |`,
  );
}
const sum = summarize(scores);
console.log(
  `\nn=${sum.n} scored (${apiErrors} API errors excluded). exact ${sum.exact}/${sum.n}, wiring-exact ${sum.connectivityExact}/${sum.n}, ` +
    `mean precision ${sum.meanPrecision.toFixed(2)}, recall ${sum.meanRecall.toFixed(2)}, value accuracy ${sum.meanValueAccuracy.toFixed(2)}. ` +
    `regions returned on ${boxed}/${comps} extracted components; junction questions on ${withQuestions}/${sum.n} images.`,
);
if (sum.n < 20) console.log(`NOTE: n=${sum.n} is far too small for a rate; treat as a smoke reading, not an accuracy claim.`);
