import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProvenanceReview } from '../../src/components/ohmni/provenance-review';
import type { CircuitGraph } from '../../src/lib/circuit/types';

const graph: CircuitGraph = {
  schemaVersion: 1, groundNode: 'GND', measureNode: 'VOUT',
  components: [
    { id: 'V1', kind: 'dc_voltage', value: 5, positiveNode: 'VIN', negativeNode: 'GND', sourceBoundingBox: [0.06, 0.43, 0.19, 0.57] },
    { id: 'R1', kind: 'resistor', value: 2200, positiveNode: 'VIN', negativeNode: 'VOUT' },
    { id: 'R2', kind: 'resistor', value: 4700, positiveNode: 'VOUT', negativeNode: 'GND' },
  ],
};
const render = (p: Partial<Parameters<typeof ProvenanceReview>[0]>) =>
  renderToStaticMarkup(
    createElement(ProvenanceReview, { imageUrl: 'blob:x', graph, questions: [], onSelect: () => {}, onJoin: () => {}, onSeparate: () => {}, ...p }),
  );

describe('ProvenanceReview', () => {
  it('renders nothing without regions or questions (graceful absence)', () => {
    expect(render({ graph: { ...graph, components: graph.components.map((c) => ({ ...c, sourceBoundingBox: undefined })) } })).toBe('');
  });
  it('outlines boxed components and asks an explicit yes/no junction question', () => {
    const html = render({ selected: 'V1', questions: [{ nodes: ['VOUT', 'GND'], kind: 'crossing', region: [0.71, 0.24, 0.75, 0.28] }] });
    expect(html).toContain('Select V1 (model-reported location)');
    expect(html).toContain('left:6%');
    expect(html).toContain('Are VOUT and GND connected where these wires cross?');
    expect(html).toContain('Joining them would bypass R2.');
    expect(html).toContain('Yes, connected');
    expect(html).toContain('No, separate');
  });
});
