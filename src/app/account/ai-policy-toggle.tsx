"use client";

import { useState } from "react";
import { ohmni, OhmniApiError } from "@/lib/client/ohmni";

/** Owner-only switch for third-party AI processing in one workspace. Others see the current state read-only. */
export function AiPolicyToggle({ wsId, role, initial }: { wsId: string; role: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const owner = role === "owner";

  const flip = async (next: boolean) => {
    setBusy(true);
    setErr(null);
    try {
      const { workspace } = await ohmni.workspaces.aiPolicy(wsId, next);
      setOn(workspace.ai_processing);
    } catch (e) {
      setErr(e instanceof OhmniApiError ? `${e.message} (${e.code})` : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <label className="row">
        <input type="checkbox" checked={on} disabled={!owner || busy} onChange={(e) => flip(e.target.checked)} />
        <span>
          AI processing {on ? "on" : "off"}
          {busy && "…"}
        </span>
      </label>
      <small>
        {on
          ? "Schematic reading, explanations and the mentor may send this workspace's circuits to third-party AI providers (free tiers may use inputs for training)."
          : "AI features are refused for this workspace's projects. Solve, probe and repair still work."}
        {" Applies to AI calls made while working in this workspace's projects. Unsaved/anonymous analysis is governed by the per-request consent checkbox."}
        {!owner && " Only owners can change this."}
      </small>
      {err && <p role="alert" className="error">{err}</p>}
    </div>
  );
}
