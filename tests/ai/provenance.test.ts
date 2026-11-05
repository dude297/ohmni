import { describe, expect, it } from 'vitest';
import { toCandidateExtraction, toRegion } from '../../src/lib/ai/extractionSchema';
import { validateGraph } from '../../src/lib/circuit/validate';
import { joinNodes, openQuestions, questionKey } from '../../src/lib/topology/questions';

const raw = (extra: Record<string, unknown> = {}, region?: unknown) => ({
  inputKind: 'schematic',
  components: [
    { id: 'V1', kind: 'dc_voltage', value: '5V', positiveNode: 'VIN', negativeNode: 'GND', region },
    { id: 'R1', kind: 'resistor', value: '10k', positiveNode: 'VIN', negativeNode: 'VOUT', region: [0.4, 0.1, 0.6, 0.3] },
    { id: 'R2', kind: 'resistor', value: '10k', positiveNode: 'VOUT', negativeNode: 'GND' },
  ],
  measureNode: 'VOUT',
  warnings: [],
  unresolvedConnections: [],
  ...extra,
});

describe('component provenance regions', () => {
  it('keeps a valid normalized box as sourceBoundingBox and the graph still validates', () => {
    const e = toCandidateExtraction(raw());
    expect(e.graph!.components[1].sourceBoundingBox).toEqual([0.4, 0.1, 0.6, 0.3]);
    expect(e.graph!.components[2].sourceBoundingBox).toBeUndefined();
    expect(validateGraph(e.graph).ok).toBe(true);
  });
  it.each([[[10, 20, 300, 400]], [[0.5, 0.5, 0.2, 0.9]], [[0.1, 0.2, 0.3]], ['top-left'], [null]])(
    'drops a bad region %j without failing the extraction',
    (bad) => {
      const e = toCandidateExtraction(raw({}, bad));
      expect(e.graph).not.toBeNull();
      expect(e.graph!.components[0].sourceBoundingBox).toBeUndefined();
    },
  );
  it('toRegion rejects pixel and 0..1000 boxes instead of guessing a scale', () => expect(toRegion([0, 0, 1000, 1000])).toBeUndefined());
});

describe('junction questions', () => {
  it('keeps questions about two existing distinct nodes, drops the rest', () => {
    const e = toCandidateExtraction(
      raw({
        uncertainJunctions: [
          { nodes: ['vout', 'ground'], kind: 'crossing', region: [0.3, 0.4, 0.35, 0.45] },
          { nodes: ['VOUT', 'N9'], kind: 'junction' }, // unknown node
          { nodes: ['VIN', 'VIN'], kind: 'junction' }, // same node
          { nodes: ['GND', 'VOUT'], kind: 'junction' }, // duplicate pair
          'garbage',
        ],
      }),
    );
    expect(e.junctionQuestions).toEqual([{ nodes: ['VOUT', 'GND'], kind: 'crossing', region: [0.3, 0.4, 0.35, 0.45] }]);
  });
  it('omits the field when the model gives none, and never changes the graph by itself', () => {
    const e = toCandidateExtraction(raw({ uncertainJunctions: 'n/a' }));
    expect(e.junctionQuestions).toBeUndefined();
    expect(e.graph!.components.map((c) => c.negativeNode)).toEqual(['GND', 'VOUT', 'GND']);
  });
  it('"yes" merges the pair (GND survives), "no" only closes the question', () => {
    const e = toCandidateExtraction(raw({ uncertainJunctions: [{ nodes: ['VIN', 'VOUT'], kind: 'crossing' }] }));
    const q = e.junctionQuestions![0];
    expect(openQuestions(e.junctionQuestions, e.graph, [])).toHaveLength(1);
    expect(openQuestions(e.junctionQuestions, e.graph, [questionKey(q)])).toHaveLength(0);
    const yes = joinNodes(e.graph!, q);
    expect(yes.dropped).toEqual(['R1']); // R1 had both leads on the merged node
    expect(yes.graph.measureNode).toBe('VIN');
    expect(openQuestions(e.junctionQuestions, yes.graph, [])).toHaveLength(0); // VOUT no longer exists
    expect(validateGraph(yes.graph).ok).toBe(true);
  });
});
