import type { CircuitGraph, JunctionQuestion } from '../circuit/types';
import { buildCandidates, nodesOf } from './candidates';

// Targeted human questions for model-flagged maybe-connected node pairs. The model only ASKS; the graph changes
// only when the human answers "yes", and the result still goes through validateGraph / the solver as usual.

export const questionKey = (q: JunctionQuestion) => [...q.nodes].sort().join('~');

/** Questions still meaningful for the graph as edited now: both nodes still exist and the pair is unanswered. */
export function openQuestions(questions: JunctionQuestion[] | undefined, graph: CircuitGraph | null, answered: string[]): JunctionQuestion[] {
  if (!graph || !questions?.length) return [];
  const nodes = new Set(nodesOf(graph));
  return questions.filter((q) => nodes.has(q.nodes[0]) && nodes.has(q.nodes[1]) && !answered.includes(questionKey(q)));
}

/** "Yes, these wires are connected": merge the two nodes (GND survives). Same transform as topology candidate B. */
export function joinNodes(graph: CircuitGraph, q: JunctionQuestion): { graph: CircuitGraph; shortsSupply: boolean; dropped: string[] } {
  const b = buildCandidates(graph, q.nodes[0], q.nodes[1])[1];
  const kept = new Set(b.graph.components.map((c) => c.id));
  return { graph: b.graph, shortsSupply: b.shortsSupply, dropped: graph.components.filter((c) => !kept.has(c.id)).map((c) => c.id) };
}
