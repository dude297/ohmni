"use client";

// Which saved project the lab is working in, shared by the lab's AI calls and the save panel (one sessionStorage key,
// so it survives the lab's stage changes for this tab). When set and signed in, model calls carry its projectId and
// the user's Bearer token, so the server can apply the workspace AI switch (403 AI_DISABLED_FOR_WORKSPACE).
// Unset = unsaved/anonymous analysis, governed by the per-request consent checkbox only.
import { useEffect, useState, useSyncExternalStore } from "react";
import { ohmni, supabaseBrowser } from "../../lib/client/ohmni";

export type ProjectContext = { projectId: string; workspaceId: string; label: string; aiProcessing: boolean };
const KEY = "ohmni.projectContext";
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
let cache: { raw: string | null; value: ProjectContext | null } = { raw: null, value: null };

export function getProjectContext(): ProjectContext | null {
  let raw: string | null = null;
  try { raw = sessionStorage.getItem(KEY); } catch { /* storage blocked: no context */ }
  if (raw !== cache.raw) {
    let value: ProjectContext | null = null;
    try { value = raw ? (JSON.parse(raw) as ProjectContext) : null; } catch { value = null; }
    cache = { raw, value };
  }
  return cache.value;
}

export function setProjectContext(v: ProjectContext | null) {
  try { if (v) sessionStorage.setItem(KEY, JSON.stringify(v)); else sessionStorage.removeItem(KEY); } catch { /* not remembered */ }
  listeners.forEach((l) => l());
}

export function useProjectContext(): ProjectContext | null {
  return useSyncExternalStore(subscribe, getProjectContext, () => null);
}

/** projectId + Authorization for a model call when a project is selected and the user is signed in; else nothing. */
export async function aiCallContext(ctx: ProjectContext | null): Promise<{ projectId?: string; headers?: Record<string, string> }> {
  const sb = supabaseBrowser();
  if (!ctx || !sb) return {};
  const token = (await sb.auth.getSession()).data.session?.access_token;
  return token ? { projectId: ctx.projectId, headers: { Authorization: `Bearer ${token}` } } : {};
}

export const AI_OFF_NOTE = "AI processing is off for this workspace. Image upload and AI features are disabled; samples, manual graphs, solve and probe still work.";

/** Signed-in only: pick the saved project this lab session works in. Hidden when accounts are off or signed out. */
export function ProjectContextPicker() {
  const ctx = useProjectContext();
  const [options, setOptions] = useState<ProjectContext[] | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const sb = supabaseBrowser();
    if (!sb) return;
    let live = true;
    void sb.auth.getSession().then(async ({ data }) => {
      if (!live || !data.session) return;
      setSignedIn(true);
      try {
        const { workspaces } = await ohmni.workspaces.list();
        const out: ProjectContext[] = [];
        for (const m of workspaces) {
          const w = (Array.isArray(m.workspace) ? m.workspace[0] : m.workspace) as { id: string; name: string; ai_processing?: boolean } | null;
          if (!w) continue;
          const { projects } = await ohmni.projects.list(w.id);
          for (const p of projects as { id: string; name: string }[])
            out.push({ projectId: p.id, workspaceId: w.id, label: `${w.name} / ${p.name}`, aiProcessing: w.ai_processing !== false });
        }
        if (!live) return;
        setOptions(out);
        // Refresh the stored flag (an owner may have changed it since it was picked); drop a project that is gone.
        const cur = getProjectContext();
        if (cur) setProjectContext(out.find((o) => o.projectId === cur.projectId) ?? null);
      } catch {
        if (live) setOptions([]);
      }
    });
    return () => { live = false; };
  }, []);

  if (!signedIn || !options?.length) return null;
  return (
    <div className="project-context">
      <label htmlFor="lab-project">Working in</label>{" "}
      <select id="lab-project" value={ctx?.projectId ?? ""} onChange={(e) => setProjectContext(options.find((o) => o.projectId === e.target.value) ?? null)}>
        <option value="">No saved project (unsaved analysis)</option>
        {options.map((o) => <option key={o.projectId} value={o.projectId}>{o.label}{o.aiProcessing ? "" : " (AI off)"}</option>)}
      </select>
      {ctx && !ctx.aiProcessing && <p role="note">{AI_OFF_NOTE}</p>}
    </div>
  );
}
