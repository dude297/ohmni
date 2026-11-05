"use client";

import { useEffect, useState } from "react";
import { ohmni, OhmniApiError, signInWithEmail, supabaseBrowser } from "@/lib/client/ohmni";
import { WorkspaceTeam } from "./team-panel";
import { AiPolicyToggle } from "./ai-policy-toggle";

type Ws = { id: string; name: string; role: string; aiProcessing: boolean };

function errText(e: unknown) {
  if (e instanceof OhmniApiError) return `${e.message}${e.requestId ? ` (request ${e.requestId})` : ""}`;
  return e instanceof Error ? e.message : String(e);
}

function Err({ e }: { e: unknown }) {
  if (!e) return null;
  const details = e instanceof OhmniApiError && Array.isArray(e.details) ? (e.details as string[]) : [];
  return (
    <div role="alert" className="error">
      <p className="error">{errText(e)}</p>
      {details.length > 0 && <ul>{details.map((d) => <li key={d}>{d}</li>)}</ul>}
    </div>
  );
}

export function AccountClient() {
  const sb = supabaseBrowser();
  const [email, setEmail] = useState<string | null | undefined>(undefined); // undefined = loading session
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setEmail(s?.user.email ?? null));
    return () => data.subscription.unsubscribe();
  }, [sb]);

  if (!sb) return <p>Accounts are not enabled on this deployment. Ohmni&apos;s analysis tools work without an account and store nothing.</p>;
  if (email === undefined) return <p>Loading…</p>;
  if (email === null) return <>{notice && <p className="ok" role="status">{notice}</p>}<SignIn /></>;
  return (
    <SignedIn
      email={email}
      onSignOut={() => sb.auth.signOut()}
      onAccountDeleted={(msg) => {
        setNotice(msg);
        // The user no longer exists server-side; just drop the local session.
        void sb.auth.signOut({ scope: "local" });
      }}
    />
  );
}

function SignIn() {
  const [addr, setAddr] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [err, setErr] = useState<unknown>(null);
  return (
    <form
      onSubmit={async (ev) => {
        ev.preventDefault();
        setState("sending");
        setErr(null);
        try {
          await signInWithEmail(addr.trim());
          setState("sent");
        } catch (e) {
          setErr(e);
          setState("idle");
        }
      }}
    >
      <p>Sign in with a one-time link sent to your email. An account is only needed to save investigations.</p>
      <div className="row">
        <label htmlFor="acct-email">Email</label>
        <input id="acct-email" type="email" required value={addr} onChange={(e) => setAddr(e.target.value)} autoComplete="email" />
        <button type="submit" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Send sign-in link"}</button>
      </div>
      {state === "sent" && <p className="ok" role="status">Check {addr} for a sign-in link. It brings you back here.</p>}
      <Err e={err} />
    </form>
  );
}

function SignedIn({ email, onSignOut, onAccountDeleted }: { email: string; onSignOut: () => void; onAccountDeleted: (msg: string) => void }) {
  const [list, setList] = useState<Ws[] | null>(null);
  const [listErr, setListErr] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  const load = () => setReload((n) => n + 1);
  useEffect(() => {
    ohmni.workspaces.list().then(
      ({ workspaces }) => {
        setListErr(null);
        setList(
          workspaces.flatMap((m) => {
            const w = (Array.isArray(m.workspace) ? m.workspace[0] : m.workspace) as { id: string; name: string; ai_processing?: boolean } | null | undefined;
            return w ? [{ id: w.id, name: w.name, role: m.role as string, aiProcessing: w.ai_processing !== false }] : [];
          }),
        );
      },
      (e) => {
        setListErr(e);
        setList([]);
      },
    );
  }, [reload]);

  return (
    <>
      <div className="row">
        <span>Signed in as <strong>{email}</strong></span>
        <button type="button" onClick={onSignOut}>Sign out</button>
      </div>

      <h2>Workspaces</h2>
      {list === null && <p>Loading workspaces…</p>}
      <Err e={listErr} />
      {list?.length === 0 && !listErr && <p>You have no workspaces.</p>}
      {list?.map((w) => <WorkspaceCard key={w.id} ws={w} onDeleted={load} />)}

      <DeleteAccount email={email} onDeleted={onAccountDeleted} />
    </>
  );
}

function WorkspaceCard({ ws, onDeleted }: { ws: Ws; onDeleted: () => void }) {
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [confirm, setConfirm] = useState("");
  const [asking, setAsking] = useState(false);

  const doExport = async () => {
    setBusy("export");
    setErr(null);
    try {
      const data = await ohmni.workspaces.export(ws.id);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: `ohmni-workspace-${ws.id.slice(0, 8)}.json` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(null);
    }
  };

  const doDelete = async () => {
    setBusy("delete");
    setErr(null);
    try {
      await ohmni.workspaces.delete(ws.id, confirm);
      onDeleted();
    } catch (e) {
      setErr(e);
      setBusy(null);
    }
  };

  return (
    <div className="card">
      <div className="row">
        <strong>{ws.name}</strong>
        <span>· {ws.role}</span>
      </div>
      <div className="row">
        {ws.role !== "viewer" && <button type="button" onClick={doExport} disabled={!!busy}>{busy === "export" ? "Exporting…" : "Export (JSON)"}</button>}
        {ws.role === "owner" && !asking && <button type="button" className="danger" onClick={() => setAsking(true)}>Delete workspace</button>}
      </div>
      {asking && (
        <div>
          <p>Permanently deletes this workspace, all its projects, investigations and stored images, for every member. Export first if you need a copy.</p>
          <div className="row">
            <label htmlFor={`del-${ws.id}`}>Type <strong>{ws.name}</strong> to confirm</label>
            <input id={`del-${ws.id}`} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <button type="button" className="danger" disabled={confirm !== ws.name || !!busy} onClick={doDelete}>{busy === "delete" ? "Deleting…" : "Delete permanently"}</button>
            <button type="button" onClick={() => { setAsking(false); setConfirm(""); }}>Cancel</button>
          </div>
        </div>
      )}
      <Err e={err} />
      <AiPolicyToggle wsId={ws.id} role={ws.role} initial={ws.aiProcessing} />
      <WorkspaceTeam wsId={ws.id} role={ws.role} />
    </div>
  );
}

function DeleteAccount({ email, onDeleted }: { email: string; onDeleted: (msg: string) => void }) {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const match = confirm.trim().toLowerCase() === email.toLowerCase();

  return (
    <>
      <h2>Delete my account</h2>
      <p>
        Permanently deletes workspaces where you are the only member and removes your sign-in. In shared workspaces your entries stay but are no longer
        attributed to you. If you are the only owner of a shared workspace, make someone else an owner or remove the other members first.
      </p>
      <div className="row">
        <label htmlFor="acct-del">Type your email to confirm</label>
        <input id="acct-del" type="email" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <button
          type="button"
          className="danger"
          disabled={!match || busy}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              const r = await ohmni.account.delete(confirm.trim());
              onDeleted(`Your account was deleted (${r.workspacesDeleted.length} workspace(s) deleted, ${r.membershipsRemoved} shared membership(s) removed).`);
            } catch (e) {
              setErr(e);
              setBusy(false);
            }
          }}
        >
          {busy ? "Deleting…" : "Delete my account"}
        </button>
      </div>
      {err instanceof OhmniApiError && err.code === "LAST_OWNER" && <p className="error">You are the only owner of these shared workspaces:</p>}
      {err instanceof OhmniApiError && err.status === 422 && <p className="error">The email you typed does not match your account.</p>}
      {err instanceof OhmniApiError && err.code === "REAUTH_REQUIRED" && (
        <p className="error">For safety, account deletion needs a recent sign-in. Sign out, sign in again with a fresh magic link, then delete within 10 minutes.</p>
      )}
      <Err e={err} />
    </>
  );
}
