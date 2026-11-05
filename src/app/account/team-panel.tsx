"use client";

import { useCallback, useEffect, useState } from "react";
import { ohmni, OhmniApiError, supabaseBrowser } from "@/lib/client/ohmni";
import { actionLabel, actorLabel } from "./team-helpers";

type Role = "owner" | "editor" | "viewer";
type Member = { user_id: string; role: Role; email: string | null; created_at: string };
type AuditRow = { id: string; actor_id: string | null; action: string; target_type: string; metadata: Record<string, unknown> | null; created_at: string };
type UsageRow = { provider: string; model: string; calls: number; errors: number; inputTokens: number; outputTokens: number };
const ROLES: Role[] = ["owner", "editor", "viewer"];

function ApiErr({ e }: { e: unknown }) {
  if (!e) return null;
  if (e instanceof OhmniApiError) {
    if (e.code === "INVITE_LIMIT") return <p role="alert" className="error">Invitation limit reached. {e.message}</p>;
    return <p role="alert" className="error">{e.message} <small>({e.code}{e.requestId ? `, request ${e.requestId}` : ""})</small></p>;
  }
  return <p role="alert" className="error">{e instanceof Error ? e.message : String(e)}</p>;
}

/** Expandable per-workspace team, activity log and usage. Loads only when opened. */
export function WorkspaceTeam({ wsId, role }: { wsId: string; role: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>Team{role === "owner" ? ", activity" : ""}{role !== "viewer" ? " and usage" : ""}</summary>
      {open && (
        <>
          <Members wsId={wsId} isOwner={role === "owner"} />
          {role === "owner" && <Activity wsId={wsId} />}
          {role !== "viewer" && <Usage wsId={wsId} />}
        </>
      )}
    </details>
  );
}

function useMe() {
  const [me, setMe] = useState<string | null>(null);
  useEffect(() => {
    supabaseBrowser()?.auth.getSession().then(({ data }) => setMe(data.session?.user.id ?? null));
  }, []);
  return me;
}

function Members({ wsId, isOwner }: { wsId: string; isOwner: boolean }) {
  const me = useMe();
  const [list, setList] = useState<Member[] | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<Role>("viewer");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const load = useCallback(() => {
    ohmni.members.list(wsId).then(
      (r) => setList(r.members as Member[]),
      (e) => { setErr(e); setList([]); },
    );
  }, [wsId]);
  useEffect(load, [load]);

  const run = async (key: string, fn: () => Promise<string | null>) => {
    setBusy(key);
    setErr(null);
    setNotice(null);
    try {
      setNotice(await fn());
      load();
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(null);
      setConfirmRemove(null);
    }
  };

  return (
    <section>
      <h3>Members</h3>
      {list === null && <p>Loading members…</p>}
      {list && list.length > 0 && (
        <ul>
          {list.map((m) => (
            <li key={m.user_id} className="row">
              <span>{m.email ?? m.user_id.slice(0, 8)}{m.user_id === me ? " (you)" : ""}</span>
              {isOwner ? (
                <select
                  aria-label={`Role for ${m.email ?? m.user_id}`}
                  value={m.role}
                  disabled={!!busy || !m.email}
                  onChange={(e) => {
                    const r = e.target.value as Role;
                    void run(`role-${m.user_id}`, async () => (await ohmni.members.upsert(wsId, { email: m.email!, role: r }), `Role changed to ${r}.`));
                  }}
                >
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              ) : (
                <span>· {m.role}</span>
              )}
              {isOwner && confirmRemove !== m.user_id && (
                <button type="button" className="danger" disabled={!!busy} onClick={() => setConfirmRemove(m.user_id)}>Remove</button>
              )}
              {isOwner && confirmRemove === m.user_id && (
                <>
                  <span>Remove {m.user_id === me ? "yourself" : "this member"}?</span>
                  <button type="button" className="danger" disabled={!!busy} onClick={() => run(`rm-${m.user_id}`, async () => (await ohmni.members.remove(wsId, m.user_id), "Member removed."))}>
                    {busy === `rm-${m.user_id}` ? "Removing…" : "Yes, remove"}
                  </button>
                  <button type="button" onClick={() => setConfirmRemove(null)}>Cancel</button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {isOwner && (
        <form
          onSubmit={(ev) => {
            ev.preventDefault();
            const addr = email.trim();
            void run("add", async () => {
              const r = await ohmni.members.upsert(wsId, { email: addr, role: newRole });
              setEmail("");
              return r.invited ? `Invitation email sent to ${addr}.` : `${addr} added as ${newRole}.`;
            });
          }}
        >
          <div className="row">
            <label htmlFor={`add-${wsId}`}>Add by email</label>
            <input id={`add-${wsId}`} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <select aria-label="Role for new member" value={newRole} onChange={(e) => setNewRole(e.target.value as Role)}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <button type="submit" disabled={!!busy}>{busy === "add" ? "Adding…" : "Add member"}</button>
          </div>
          <p><small>People without an account get an invitation email. Invitation emails are limited until custom email is configured.</small></p>
        </form>
      )}
      {notice && <p className="ok" role="status">{notice}</p>}
      <ApiErr e={err} />
    </section>
  );
}

function Activity({ wsId }: { wsId: string }) {
  const me = useMe();
  const [events, setEvents] = useState<AuditRow[]>([]);
  const [next, setNext] = useState<string | null | undefined>(undefined); // undefined = first page not loaded
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  const fetchPage = useCallback(
    (before?: string) =>
      ohmni.workspaces.audit(wsId, before).then(
        (r) => {
          setEvents((prev) => (before ? [...prev, ...(r.events as AuditRow[])] : (r.events as AuditRow[])));
          setNext(r.nextBefore as string | null);
        },
        (e) => { setErr(e); setNext((n) => n ?? null); },
      ).finally(() => setBusy(false)),
    [wsId],
  );
  useEffect(() => { void fetchPage(); }, [fetchPage]);
  const more = (before: string) => { setBusy(true); setErr(null); void fetchPage(before); };

  return (
    <section>
      <h3>Activity log</h3>
      {next === undefined && <p>Loading activity…</p>}
      {next !== undefined && events.length === 0 && !err && <p>No activity recorded yet.</p>}
      {events.length > 0 && (
        <table>
          <thead><tr><th>Time</th><th>Action</th><th>By</th><th>Target</th></tr></thead>
          <tbody>
            {events.map((ev) => (
              <tr key={ev.id}>
                <td>{new Date(ev.created_at).toLocaleString()}</td>
                <td>{actionLabel(ev.action, ev.metadata)}</td>
                <td>{actorLabel(ev.actor_id, me)}</td>
                <td>{ev.target_type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {next && <button type="button" disabled={busy} onClick={() => more(next)}>{busy ? "Loading…" : "Load more"}</button>}
      <ApiErr e={err} />
    </section>
  );
}

function Usage({ wsId }: { wsId: string }) {
  const [rows, setRows] = useState<UsageRow[] | null>(null);
  const [meta, setMeta] = useState<{ days: number; truncated: boolean } | null>(null);
  const [err, setErr] = useState<unknown>(null);
  useEffect(() => {
    ohmni.workspaces.usage(wsId).then(
      (r) => { setRows(r.models as UsageRow[]); setMeta({ days: r.days, truncated: r.truncated }); },
      (e) => { setErr(e); setRows([]); },
    );
  }, [wsId]);

  return (
    <section>
      <h3>AI usage{meta ? ` (last ${meta.days} days)` : ""}</h3>
      {rows === null && <p>Loading usage…</p>}
      {rows?.length === 0 && !err && <p>No AI calls recorded for this workspace.</p>}
      {rows && rows.length > 0 && (
        <table>
          <thead><tr><th>Provider</th><th>Model</th><th>Calls</th><th>Errors</th><th>Tokens in</th><th>Tokens out</th></tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={`${u.provider}|${u.model}`}>
                <td>{u.provider}</td><td>{u.model}</td><td>{u.calls}</td><td>{u.errors}</td>
                <td>{u.inputTokens.toLocaleString()}</td><td>{u.outputTokens.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {meta?.truncated && <p><small>Showing the newest 1000 calls only.</small></p>}
      <ApiErr e={err} />
    </section>
  );
}
