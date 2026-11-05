import { describe, expect, it } from 'vitest';
import { isomorphic, scoreConnectivity, summarize, type Netlist } from '@/lib/bench/connectivity';

// R1 series, R2 || R3 to ground (fixtures/circuits/03).
const gold: Netlist = {
  measureNode: 'VOUT',
  components: [
    { kind: 'dc_voltage', value: 5, positiveNode: 'VIN', negativeNode: 'GND' },
    { kind: 'resistor', value: 1000, positiveNode: 'VIN', negativeNode: 'VOUT' },
    { kind: 'resistor', value: 2000, positiveNode: 'VOUT', negativeNode: 'GND' },
    { kind: 'resistor', value: 2000, positiveNode: 'GND', negativeNode: 'VOUT' },
  ],
};

describe('connectivity benchmark scoring', () => {
  it('matches an isomorphic graph with renamed nodes, reordered components and flipped resistor leads', () => {
    const got: Netlist = {
      measureNode: 'N2',
      components: [
        { kind: 'resistor', value: 2000, positiveNode: 'N2', negativeNode: 'GND' },
        { kind: 'resistor', value: 1000, positiveNode: 'N2', negativeNode: 'N1' },
        { kind: 'resistor', value: 2e3, positiveNode: 'N2', negativeNode: 'GND' },
        { kind: 'dc_voltage', value: 5, positiveNode: 'N1', negativeNode: 'GND' },
      ],
    };
    const s = scoreConnectivity(gold, got);
    expect(s).toMatchObject({ exact: true, connectivityExact: true, precision: 1, recall: 1, valueAccuracy: 1 });
  });

  it('fails a swapped wire even when every component and value is right', () => {
    // R3 moved from VOUT||GND to VIN-GND.
    const got: Netlist = { ...gold, components: gold.components.map((c, i) => (i === 3 ? { ...c, negativeNode: 'VIN' } : c)) };
    const s = scoreConnectivity(gold, got);
    expect(s.exact).toBe(false);
    expect(s.connectivityExact).toBe(false);
    expect(s.recall).toBe(1); // component detection alone does not prove the wiring
  });

  it('counts a value misread: wiring exact, value accuracy drops, promotion metric fails', () => {
    const got: Netlist = { ...gold, components: gold.components.map((c, i) => (i === 1 ? { ...c, value: 10000 } : c)) };
    const s = scoreConnectivity(gold, got);
    expect(s.connectivityExact).toBe(true);
    expect(s.exact).toBe(false);
    expect(s.valueAccuracy).toBe(0.75);
    expect(s.precision).toBe(0.75);
  });

  it('respects source polarity and the measure node', () => {
    const flipped: Netlist = { ...gold, components: gold.components.map((c, i) => (i === 0 ? { ...c, positiveNode: 'GND', negativeNode: 'VIN' } : c)) };
    expect(isomorphic(gold, flipped)).toBe(false);
    expect(isomorphic(gold, { ...gold, measureNode: 'VIN' })).toBe(false);
  });

  it('scores a missing graph as zero and aggregates with n', () => {
    const none = scoreConnectivity(gold, null);
    expect(none).toMatchObject({ exact: false, precision: 0, recall: 0, predicted: 0 });
    expect(summarize([none, scoreConnectivity(gold, gold)])).toMatchObject({ n: 2, exact: 1, meanRecall: 0.5 });
  });
});
