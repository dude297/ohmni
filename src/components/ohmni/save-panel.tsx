"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, LoaderCircle, LogOut, Mail, Save } from "lucide-react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { ohmni, OhmniApiError, signInWithEmail, supabaseBrowser } from "../../lib/client/ohmni";
import type { Observation } from "../../lib/probe";
import type { Graph } from "./api";
import { measurementBodies } from "./lab-helpers";

type Source = "image_extraction" | "manual" | "fixture";
type Opt = { id: string; name: string };
const NEW = "__new__";
const noSubscribe = () => () => {};

const describe = (e: unknown) =>
  e instanceof OhmniApiError
    ? `${e.message} (${e.code}${e.requestId ? `, request ${e.requestId}` : ""})`
    : e instanceof Error ? e.message : "Something went wrong.";

/** Sign in + save the confirmed circuit and readings as a private investigation. Hidden when Supabase is not configured. */
export function SavePanel({ graph, source, observations }: { graph: Graph; source: Source; observations: Observation[] }) {
  // Client-only: the browser Supabase client (and its stored session) never exists during SSR.
  const client: SupabaseClient | null = useSyncExternalStore(noSubscribe, supabaseBrowser, () => null);
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [workspaces, setWorkspaces] = useState<Opt[]>([]);
  const [ws, setWs] = useState(NEW);
  const [wsName, setWsName] = useState("My workspace");
  const [projects, setProjects] = useState<Opt[]>([]);
  const [project, setProject] = useState(NEW);
  const [projectName, setProjectName] = useState("Lab circuits");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<{ id: string; count: number } | null>(null);

  useEffect(() => {
    const c = client;
    if (!c) return;
    void c.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = c.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [client]);

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    ohmni.workspaces.list().then(({ workspaces }) => {
      const list = workspaces.flatMap((w) => (w.workspace ? [w.workspace as unknown as Opt] : []));
      setWorkspaces(list);
      if (list[0]) pickWorkspace(list[0].id);
    }, (e) => setError(describe(e)));
  }, [userId]);

  function pickWorkspace(id: string) {
    setWs(id);
    setProjects([]);
    setProject(NEW);
    if (id === NEW) return;
    ohmni.projects.list(id).then(({ projects }) => {
      setProjects(projects);
      if (projects[0]) setProject(projects[0].id);
    }, (e) => setError(describe(e)));
  }

  async function run(f: () => Promise<void>) {
    setBusy(true);
    setError("");
    try { await f(); } catch (e) { setError(describe(e)); } finally { setBusy(false); }
  }

  const signIn = () => run(async () => { await signInWithEmail(email.trim()); setSent(true); });

  const save = () => run(async () => {
    let wsId = ws;
    if (wsId === NEW) {
      const { workspace } = await ohmni.workspaces.create({ name: wsName });
      wsId = workspace.id;
      setWorkspaces((l) => [...l, workspace]);
      setWs(wsId);
    }
    let projectId = project;
    if (projectId === NEW) {
      const { project: created } = await ohmni.projects.create({ workspaceId: wsId, name: projectName });
      projectId = created.id;
      setProjects((l) => [...l, created]);
      setProject(projectId);
    }
    const { revision } = await ohmni.projects.confirm(projectId, { graph, source });
    const { investigation } = await ohmni.investigations.open({ revisionId: revision.id, title: `Lab investigation ${new Date().toLocaleString()}` });
    const bodies = measurementBodies(observations);
    for (const b of bodies) await ohmni.investigations.measure(investigation.id, b);
    setSaved({ id: investigation.id, count: bodies.length });
  });

  const downloadReport = () => run(async () => {
    if (!saved) return;
    const md = await ohmni.investigations.reportMarkdown(saved.id);
    const url = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `ohmni-investigation-${saved.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  });

  if (!client) return null;
  return (
    <section className="save-panel" aria-labelledby="save-heading" aria-busy={busy}>
      <div className="save-head">
        <span className="eyebrow">PRIVATE · SIGNED-IN ONLY</span>
        <h3 id="save-heading">Save investigation</h3>
        {session && <button className="text-button" disabled={busy} onClick={() => void client.auth.signOut()}><LogOut size={13} /> Sign out</button>}
      </div>
      {!session ? (
        sent ? <p role="status">Check your email ({email}) for a sign-in link. It brings you back here.</p> : (
          <form onSubmit={(e) => { e.preventDefault(); if (email.trim()) void signIn(); }}>
            <label htmlFor="save-email">Sign in with an email link to keep this circuit and its readings.</label>
            <div className="save-row">
              <input id="save-email" type="email" required value={email} disabled={busy} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              <button className="button secondary small" type="submit" disabled={busy || !email.trim()}>{busy ? <LoaderCircle size={14} className="spinner" /> : <Mail size={14} />} Email me a link</button>
            </div>
          </form>
        )
      ) : saved ? (
        <div role="status">
          <p>Saved {saved.count} reading{saved.count === 1 ? "" : "s"} to investigation <code>{saved.id}</code>.</p>
          <div className="save-row">
            <button className="button secondary small" disabled={busy} onClick={() => void downloadReport()}>{busy ? <LoaderCircle size={14} className="spinner" /> : <Download size={14} />} Download report (.md)</button>
            <button className="text-button" disabled={busy} onClick={() => setSaved(null)}>Save again</button>
          </div>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <p className="save-who">Signed in as {session.user.email}</p>
          <label htmlFor="save-ws">Workspace</label>
          <div className="save-row">
            <select id="save-ws" value={ws} disabled={busy} onChange={(e) => pickWorkspace(e.target.value)}>
              {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              <option value={NEW}>+ New workspace</option>
            </select>
            {ws === NEW && <input aria-label="New workspace name" required maxLength={120} value={wsName} disabled={busy} onChange={(e) => setWsName(e.target.value)} />}
          </div>
          <label htmlFor="save-project">Project</label>
          <div className="save-row">
            <select id="save-project" value={project} disabled={busy} onChange={(e) => setProject(e.target.value)}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              <option value={NEW}>+ New project</option>
            </select>
            {project === NEW && <input aria-label="New project name" required maxLength={200} value={projectName} disabled={busy} onChange={(e) => setProjectName(e.target.value)} />}
          </div>
          <button className="button primary small" type="submit" disabled={busy}>{busy ? <LoaderCircle size={14} className="spinner" /> : <Save size={14} />} Save confirmed circuit + {measurementBodies(observations).length} reading(s)</button>
        </form>
      )}
      {error && <p className="probe-error" role="alert">{error}</p>}
    </section>
  );
}
