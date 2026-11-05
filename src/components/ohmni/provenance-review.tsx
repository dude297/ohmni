"use client";

import { useState } from "react";
import type { Graph } from "./api";
import type { JunctionQuestion } from "../../lib/circuit/types";
import { joinNodes, questionKey } from "../../lib/topology/questions";

type Box = [number, number, number, number];
const boxStyle = ([x0, y0, x1, y1]: Box) => ({
  left: `${x0 * 100}%`,
  top: `${y0 * 100}%`,
  width: `${(x1 - x0) * 100}%`,
  height: `${(y1 - y0) * 100}%`,
});

/**
 * Where each component came from in the uploaded image (model-reported, approximate) plus explicit yes/no
 * questions for junctions/crossings the model was unsure about. Renders nothing when the model gave neither.
 * A "yes" merges the two nodes through onJoin; nothing is ever merged without the user's answer.
 */
export function ProvenanceReview({
  imageUrl,
  graph,
  selected,
  onSelect,
  questions,
  onJoin,
  onSeparate,
  disabled,
}: {
  imageUrl: string;
  graph: Graph;
  selected?: string;
  onSelect: (id: string) => void;
  questions: JunctionQuestion[];
  onJoin: (q: JunctionQuestion, next: Graph) => void;
  onSeparate: (q: JunctionQuestion) => void;
  disabled?: boolean;
}) {
  const [focusQ, setFocusQ] = useState<string>();
  const [note, setNote] = useState("");
  const boxed = graph.components.filter((c) => c.sourceBoundingBox);
  if (!imageUrl || (!boxed.length && !questions.length)) return null;
  const shown = questions.find((q) => questionKey(q) === focusQ) ?? questions[0];

  return (
    <div className="provenance-review">
      <div className="provenance-image">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="Uploaded schematic with model-reported component locations" />
        {boxed.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`provenance-box ${selected === c.id ? "active" : ""}`}
            style={boxStyle(c.sourceBoundingBox!)}
            disabled={disabled}
            onClick={() => onSelect(c.id)}
            aria-label={`Select ${c.id} (model-reported location)`}
          >
            <span>{c.id}</span>
          </button>
        ))}
        {shown?.region && <div className="provenance-box question" style={boxStyle(shown.region)} aria-hidden />}
      </div>
      {boxed.length > 0 && (
        <p className="provenance-caption">
          Boxes are where the vision model says it read each part ({boxed.length}/{graph.components.length}). They are approximate; check against the drawing, not the box.
        </p>
      )}
      {questions.map((q) => {
        const [a, b] = q.nodes;
        const join = joinNodes(graph, q);
        return (
          <div key={questionKey(q)} className="junction-question" onMouseEnter={() => setFocusQ(questionKey(q))} onFocus={() => setFocusQ(questionKey(q))}>
            <strong>
              Are {a} and {b} connected {q.kind === "crossing" ? "where these wires cross" : "at this junction"}?
            </strong>
            <span>
              The model was unsure{q.region ? " (outlined on the image)" : ""}. Look for a junction dot.
              {join.shortsSupply && " Joining them would short the supply."}
              {join.dropped.length > 0 && ` Joining them would bypass ${join.dropped.join(", ")}.`}
            </span>
            <div>
              <button
                type="button"
                className="button secondary small"
                disabled={disabled}
                onClick={() => {
                  setNote(`Joined ${a} and ${b}.${join.dropped.length ? ` ${join.dropped.join(", ")} removed (both leads on one node).` : ""}`);
                  onJoin(q, join.graph);
                }}
              >
                Yes, connected
              </button>
              <button
                type="button"
                className="button secondary small"
                disabled={disabled}
                onClick={() => {
                  setNote(`Kept ${a} and ${b} separate.`);
                  onSeparate(q);
                }}
              >
                No, separate
              </button>
            </div>
          </div>
        );
      })}
      {note && <p className="provenance-caption" role="status">{note}</p>}
    </div>
  );
}
