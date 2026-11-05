import { z } from 'zod';
import type { CandidateExtraction, CircuitComponent, JunctionQuestion } from '../circuit/types';

// Raw model output. Lenient on purpose: we normalise and never invent missing data.
export const rawExtractionSchema = z.object({
  inputKind: z.string().optional(),
  components: z
    .array(
      z.object({
        id: z.string(),
        kind: z.string(),
        value: z.union([z.string(), z.number()]).nullable().optional(),
        positiveNode: z.string().nullable().optional(),
        negativeNode: z.string().nullable().optional(),
        region: z.unknown().optional(), // provenance; validated by toRegion, dropped (never fatal) when bad
      }),
    )
    .default([]),
  measureNode: z.string().nullable().optional(),
  warnings: z.array(z.string()).default([]),
  unresolvedConnections: z.array(z.string()).default([]),
  uncertainJunctions: z.unknown().optional(), // validated by toJunctions; bad entries dropped
});

const REGION = { type: 'array', items: { type: 'number' }, minItems: 4, maxItems: 4 } as const;
const regionSchema = z
  .tuple([z.number(), z.number(), z.number(), z.number()])
  .refine(([x0, y0, x1, y1]) => [x0, y0, x1, y1].every((v) => v >= 0 && v <= 1) && x1 > x0 && y1 > y0);
/** Normalized [x0, y0, x1, y1] box in 0..1 image fractions, or undefined. Pixel / 0..1000 boxes are dropped, not rescaled. */
export const toRegion = (v: unknown) => {
  const r = regionSchema.safeParse(v);
  return r.success ? (r.data as [number, number, number, number]) : undefined;
};
const junctionSchema = z.object({
  nodes: z.tuple([z.string(), z.string()]),
  kind: z.enum(['crossing', 'junction']).catch('junction'),
  region: z.unknown().optional(),
});
/** Keep only questions about two distinct nodes that exist in the graph. Never adds or removes a wire itself. */
function toJunctions(v: unknown, nodes: Set<string>): JunctionQuestion[] {
  if (!Array.isArray(v)) return [];
  const out: JunctionQuestion[] = [];
  for (const item of v.slice(0, 10)) {
    const j = junctionSchema.safeParse(item);
    if (!j.success) continue;
    const [a, b] = j.data.nodes.map((n) => normalizeNode(n));
    if (a === b || !nodes.has(a) || !nodes.has(b) || out.some((q) => q.nodes.includes(a) && q.nodes.includes(b))) continue;
    const region = toRegion(j.data.region);
    out.push({ nodes: [a, b], kind: j.data.kind, ...(region && { region }) });
  }
  return out;
}

// JSON schema handed to Gemini (responseJsonSchema).
export const responseJsonSchema = {
  type: 'object',
  properties: {
    inputKind: { type: 'string', enum: ['schematic', 'breadboard_template', 'unknown'] },
    components: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          kind: { type: 'string', description: 'resistor, dc_voltage, or the real part name (capacitor, led, opamp...)' },
          value: { type: 'string', description: 'value exactly as printed, e.g. "10k", "5V"; omit if not visible' },
          positiveNode: { type: 'string' },
          negativeNode: { type: 'string' },
          region: { ...REGION, description: 'where this part is drawn: [x0, y0, x1, y1] as fractions 0..1 of image width/height (top-left origin); omit if unsure' },
        },
        required: ['id', 'kind', 'positiveNode', 'negativeNode'],
      },
    },
    measureNode: { type: 'string', description: 'node explicitly labelled VOUT; omit if none' },
    warnings: { type: 'array', items: { type: 'string' } },
    unresolvedConnections: { type: 'array', items: { type: 'string' } },
    uncertainJunctions: {
      type: 'array',
      description: 'places where two differently-named nodes MIGHT be the same wire (crossing without a dot, unclear junction)',
      items: {
        type: 'object',
        properties: {
          nodes: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2 },
          kind: { type: 'string', enum: ['crossing', 'junction'] },
          region: REGION,
        },
        required: ['nodes', 'kind'],
      },
    },
  },
  required: ['inputKind', 'components', 'warnings', 'unresolvedConnections'],
};

const PREFIX: Record<string, number> = {
  p: 1e-12, n: 1e-9, u: 1e-6, 'µ': 1e-6, 'μ': 1e-6, m: 1e-3,
  k: 1e3, K: 1e3, M: 1e6, MEG: 1e6, Meg: 1e6, meg: 1e6, G: 1e9,
};

/** "10k", "4.7kΩ", "1M", "5V", "4k7" -> SI number; null if unparseable or not > 0. */
export function parseSiValue(input: unknown): number | null {
  if (typeof input === 'number') return Number.isFinite(input) && input > 0 ? input : null;
  if (typeof input !== 'string') return null;
  let s = input.trim().replace(/\s+/g, '');
  s = s.replace(/(ohms?|volts?|Ω|ω|V|v|R)$/, '');
  const rkm = /^(\d+)(MEG|Meg|meg|[pnuµμmkKMG])(\d+)$/.exec(s); // 4k7 notation
  if (rkm) s = `${rkm[1]}.${rkm[3]}${rkm[2]}`;
  const m = /^(\d*\.?\d+(?:[eE][+-]?\d+)?)(MEG|Meg|meg|[pnuµμmkKMG])?$/.exec(s);
  if (!m) return null;
  const n = parseFloat(m[1]) * (m[2] ? PREFIX[m[2]] : 1);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const GROUND = new Set(['GND', 'GROUND', '0', 'EARTH', 'AGND', 'DGND']);
export function normalizeNode(name: string): string {
  const n = name.trim().toUpperCase();
  return GROUND.has(n) ? 'GND' : n;
}

function nullResult(
  inputKind: CandidateExtraction['inputKind'],
  warnings: string[],
  unresolvedConnections: string[] = [],
): CandidateExtraction {
  return { inputKind, graph: null, warnings, unresolvedConnections, requiresHumanReview: true };
}

/** Pure: validate + normalise raw model JSON into a CandidateExtraction. Never throws. */
export function toCandidateExtraction(raw: unknown): CandidateExtraction {
  const parsed = rawExtractionSchema.safeParse(raw);
  if (!parsed.success) return nullResult('unknown', ['Model output was malformed; enter the circuit manually.']);
  const r = parsed.data;
  const inputKind = (['schematic', 'breadboard_template'] as const).find((k) => k === r.inputKind) ?? 'unknown';
  const warnings = [...r.warnings];
  const fail = (msg: string) => nullResult(inputKind, [...warnings, msg], r.unresolvedConnections);

  const components: CircuitComponent[] = [];
  const ids = new Set<string>();
  let bad = false;
  for (const c of r.components) {
    const kind = c.kind.trim().toLowerCase();
    const mapped =
      kind === 'resistor'
        ? 'resistor'
        : ['dc_voltage', 'voltage_source', 'dc_source', 'battery', 'vsource', 'v_source', 'dc_voltage_source', 'voltage', 'dc_battery'].includes(kind)
          ? 'dc_voltage'
          : null;
    if (!mapped) {
      warnings.push(`Unsupported component ignored: ${c.id} (${c.kind})`);
      continue;
    }
    const value = parseSiValue(c.value);
    const pos = c.positiveNode?.trim() ? normalizeNode(c.positiveNode) : '';
    const neg = c.negativeNode?.trim() ? normalizeNode(c.negativeNode) : '';
    const id = c.id.trim();
    if (value === null || !pos || !neg || !id || ids.has(id)) {
      warnings.push(`Component ${c.id || '(unnamed)'} has a missing/unreadable value, node or id`);
      bad = true;
      continue;
    }
    ids.add(id);
    const region = toRegion(c.region);
    components.push({ id, kind: mapped, value, positiveNode: pos, negativeNode: neg, ...(region && { sourceBoundingBox: region }) });
  }

  if (bad) return fail('Could not build a circuit: some components are incomplete.');
  if (!components.some((c) => c.kind === 'dc_voltage') || !components.some((c) => c.kind === 'resistor'))
    return fail('Need at least one resistor and one DC voltage source.');
  const nodes = new Set(components.flatMap((c) => [c.positiveNode, c.negativeNode]));
  if (!nodes.has('GND')) return fail('No ground node found.');
  if (!r.measureNode?.trim()) return fail('No explicit VOUT/measure node label found; choose the measure node manually.');
  const measureNode = normalizeNode(r.measureNode);
  if (!nodes.has(measureNode)) return fail(`Measure node ${measureNode} is not connected to any component.`);

  const junctionQuestions = toJunctions(r.uncertainJunctions, nodes);
  return {
    inputKind,
    graph: { schemaVersion: 1, components, groundNode: 'GND', measureNode },
    warnings,
    unresolvedConnections: r.unresolvedConnections,
    ...(junctionQuestions.length > 0 && { junctionQuestions }),
    requiresHumanReview: true,
  };
}

// Shared by every vision provider.
export const EXTRACTION_PROMPT = `You read images of simple DC circuits (schematic or breadboard layout).
Extract ONLY what is visible. Never guess or infer a value, label or wire that is not clearly shown.
- components: every part with its printed id (R1, V1...), kind, value exactly as printed, and its two node names.
  Use kind "resistor" or "dc_voltage"; for any other part use its real name (capacitor, led, opamp...).
  For dc_voltage, positiveNode is the + terminal. Omit value if not legible.
- Name nodes by their printed labels (VIN, VOUT...); the ground symbol is "GND". Give unlabeled junctions short names like N1.
- measureNode: only if a node is explicitly labelled VOUT (or a clearly marked measurement point); otherwise omit it.
- unresolvedConnections: describe any wire or junction you are unsure about.
- warnings: anything illegible or ambiguous.
- region (optional, per component): the box around that part as [x0, y0, x1, y1], fractions 0..1 of image width and height, origin top-left. Omit if unsure.
- uncertainJunctions (optional): wherever two of your differently-named nodes MIGHT be the same wire (wires crossing without a dot, a junction you cannot confirm),
  give {"nodes": [nodeA, nodeB], "kind": "crossing" or "junction", "region": box around that point}. Keep your node assignment as read; a human will decide.
Return JSON matching the schema.`;
