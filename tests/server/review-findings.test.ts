import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Caller } from '@/lib/server/supabase';

// Negative tests for the 2026-11-05 review findings. Network-free fake supabase-js: from(table) resolves to
// results[table] (a function gets the recorded filters); every call (rpc, insert, update, delete, in, eq) is logged.
type Call = { table: string; op: string; args: unknown[] };
const calls: Call[] = [];
let results: Record<string, { data: unknown; error: unknown } | ((f: Call[]) => { data: unknown; error: unknown })> = {};
let rpcResult: { data: unknown; error: unknown } = { data: null, error: null };
function fakeDb() {
  return {
    rpc: (name: string, args: unknown) => {
      calls.push({ table: `rpc:${name}`, op: 'rpc', args: [args] });
      return Promise.resolve(rpcResult);
    },
    auth: { admin: { deleteUser: (id: string) => (calls.push({ table: 'auth', op: 'deleteUser', args: [id] }), Promise.resolve({ error: null })) } },
    from(table: string) {
      const mine: Call[] = [];
      const chain: unknown = new Proxy(
        {},
        {
          get(_t, k) {
            if (k === 'then')
              return (res: (v: unknown) => void) => {
                const r = results[table];
                res(typeof r === 'function' ? r(mine) : (r ?? { data: null, error: null }));
              };
            return (...args: unknown[]) => {
              const c = { table, op: String(k), args };
              calls.push(c);
              mine.push(c);
              return chain;
            };
          },
        },
      );
      return chain;
    },
  };
}
vi.mock('@/lib/server/supabase', async (orig) => ({
  ...(await orig<object>()),
  adminDb: () => fakeDb(),
  persistenceConfigured: () => true,
  caller: async () => ({ user: { id: 'u1' }, db: fakeDb() }),
}));
vi.mock('@/lib/persist/artifacts', () => ({ removeWorkspaceObjects: async () => {} }));

const { caseResolution, passedVerification, closeInvestigation, setBenchmarkConsent, CONSENT_NOTE } = await import('@/lib/persist');
const { deleteAccount, exportWorkspace, sessionAuthTime } = await import('@/lib/persist/lifecycle');
const { recordTraces } = await import('@/lib/persist/traces');

const GRAPH = {
  schemaVersion: 1,
  components: [
    { id: 'V1', kind: 'dc_voltage', value: 12, positiveNode: 'VIN', negativeNode: 'GND' },
    { id: 'R1', kind: 'resistor', value: 1000, positiveNode: 'VIN', negativeNode: 'A' },
    { id: 'R2', kind: 'resistor', value: 1000, positiveNode: 'A', negativeNode: 'GND' },
  ],
  groundNode: 'GND',
  measureNode: 'A',
} as never;
const INV = { id: '40000000-0000-4000-a000-000000000001', workspace_id: '10000000-0000-4000-a000-000000000001' };
const c = { user: { id: 'u1', email: 'me@test.invalid' }, db: fakeDb(), requestId: 'req-1' } as unknown as Caller;
const ops = (table: string, op: string) => calls.filter((x) => x.table === table && x.op === op);
const openInv = (role: string) => ({
  investigations: { data: { ...INV, status: 'open', revision: { graph: GRAPH, revision_hash: 'rev_x' } }, error: null },
  workspace_members: { data: { role }, error: null },
  measurements: { data: [], error: null },
  repair_proposals: { data: [{ id: 'p-r1', hypothesis: { hypothesis_key: 'R1:open' } }, { id: 'p-r2', hypothesis: { hypothesis_key: 'R2:short' } }], error: null },
  verifications: { data: [{ id: 'ver-1' }], error: null },
});

beforeEach(() => {
  calls.length = 0;
  results = {};
  rpcResult = { data: { investigation: { ...INV, status: 'resolved' }, resolution: null }, error: null };
});

describe('P1-1 benchmark eligibility is tied to the confirmed fault', () => {
  it("'other' and 'no_fault_found' are never eligible, even with a passing verification", () => {
    expect(caseResolution(INV, GRAPH, { componentId: 'R1', faultClass: 'other' }, true, 'ver-1', 'u1')).toMatchObject({ benchmark_eligible: false, verification_id: null });
    expect(caseResolution(INV, GRAPH, { faultClass: 'no_fault_found' }, true, 'ver-1', 'u1')).toMatchObject({ benchmark_eligible: false, verification_id: null });
  });

  it('a verified repair of a DIFFERENT hypothesis does not count', async () => {
    results = openInv('editor');
    expect(await passedVerification(c, INV.id, { componentId: 'R2', faultClass: 'open' })).toBeNull(); // only R2:short and R1:open were repaired
    expect(ops('verifications', 'in')).toEqual([]);
    expect(await passedVerification(c, INV.id, { componentId: 'R1', faultClass: 'short' })).toBeNull();
  });

  it('only proposals for componentId:faultClass are checked', async () => {
    results = openInv('editor');
    expect(await passedVerification(c, INV.id, { componentId: 'R2', faultClass: 'short' })).toBe('ver-1');
    expect(ops('verifications', 'in').at(-1)?.args).toEqual(['repair_proposal_id', ['p-r2']]);
    expect(await passedVerification(c, INV.id, { componentId: 'R1', faultClass: 'other' })).toBeNull();
  });
});

describe('P1-2 close is atomic (one SQL function), validated first', () => {
  it('validation failures write nothing', async () => {
    results = openInv('editor');
    await expect(closeInvestigation(c, INV.id, { status: 'resolved', confirmedFault: { componentId: 'R9', faultClass: 'open' } })).rejects.toMatchObject({ status: 422 });
    results = openInv('viewer');
    await expect(closeInvestigation(c, INV.id, { status: 'resolved' })).rejects.toMatchObject({ status: 403 });
    results = { ...openInv('editor'), investigations: { data: { ...INV, status: 'resolved', revision: { graph: GRAPH, revision_hash: 'x' } }, error: null } };
    await expect(closeInvestigation(c, INV.id, { status: 'resolved' })).rejects.toMatchObject({ status: 409, code: 'INVESTIGATION_CLOSED' });
    expect(calls.filter((x) => x.op === 'rpc' || x.op === 'insert' || x.op === 'update')).toEqual([]);
  });

  it('status and label go in one rpc; no separate status update or label insert; a failed rpc audits nothing', async () => {
    results = openInv('owner');
    await closeInvestigation(c, INV.id, { status: 'resolved', confirmedFault: { componentId: 'R2', faultClass: 'short' }, benchmarkConsent: true });
    expect(ops('rpc:close_investigation', 'rpc')[0].args[0]).toMatchObject({ p_id: INV.id, p_status: 'resolved', p_resolution: { benchmark_eligible: true, benchmark_consent: true, verification_id: 'ver-1' } });
    expect(ops('investigations', 'update')).toEqual([]);
    expect(ops('case_resolutions', 'insert')).toEqual([]);
    calls.length = 0;
    rpcResult = { data: null, error: { code: '23505' } };
    await expect(closeInvestigation(c, INV.id, { status: 'resolved' })).rejects.toMatchObject({ status: 409 });
    rpcResult = { data: null, error: { code: 'P0002' } }; // closed concurrently
    await expect(closeInvestigation(c, INV.id, { status: 'resolved' })).rejects.toMatchObject({ status: 409, code: 'INVESTIGATION_CLOSED' });
    expect(ops('audit_events', 'insert')).toEqual([]);
  });
});

describe('P2-6 benchmark consent is an owner decision', () => {
  it('an editor can close and label, but consent is stored false with a note', async () => {
    results = openInv('editor');
    const out = await closeInvestigation(c, INV.id, { status: 'resolved', confirmedFault: { componentId: 'R2', faultClass: 'short' }, benchmarkConsent: true });
    expect(ops('rpc:close_investigation', 'rpc')[0].args[0]).toMatchObject({ p_resolution: { benchmark_consent: false, benchmark_eligible: true } });
    expect(out).toMatchObject({ consentNote: CONSENT_NOTE });
  });

  it('consent endpoint: editors refused before any write; owners update and are audited', async () => {
    results = { investigations: { data: INV, error: null }, workspace_members: { data: { role: 'editor' }, error: null } };
    await expect(setBenchmarkConsent(c, INV.id, { consent: true })).rejects.toMatchObject({ status: 403 });
    expect(ops('case_resolutions', 'update')).toEqual([]);
    results = { investigations: { data: INV, error: null }, workspace_members: { data: { role: 'owner' }, error: null }, case_resolutions: { data: null, error: null } };
    await expect(setBenchmarkConsent(c, INV.id, { consent: false })).rejects.toMatchObject({ status: 404 }); // no resolution yet
    results.case_resolutions = { data: { benchmark_consent: false }, error: null };
    await setBenchmarkConsent(c, INV.id, { consent: false });
    expect(ops('case_resolutions', 'update').at(-1)?.args[0]).toEqual({ benchmark_consent: false });
    expect(ops('audit_events', 'insert').at(-1)?.args[0]).toMatchObject({ action: 'resolution.consent', target_id: INV.id, metadata: { consent: false } });
  });
});

describe('P2-8 account deletion needs a recent sign-in', () => {
  const now = Date.parse('2026-11-05T12:00:00Z');
  it('stale or unknown sign-in: 401 REAUTH_REQUIRED before anything is read or deleted', async () => {
    await expect(deleteAccount(c, { confirm: 'me@test.invalid' }, now - 11 * 60_000, now)).rejects.toMatchObject({ status: 401, code: 'REAUTH_REQUIRED' });
    await expect(deleteAccount(c, { confirm: 'me@test.invalid' }, null, now)).rejects.toMatchObject({ status: 401, code: 'REAUTH_REQUIRED' });
    expect(calls).toEqual([]);
  });

  it('auth time = newest amr timestamp of the token (survives refresh), else last_sign_in_at', () => {
    const jwt = (p: object) => `h.${Buffer.from(JSON.stringify(p)).toString('base64url')}.s`;
    const req = (t: string) => new Request('http://x', { headers: { authorization: `Bearer ${t}` } });
    expect(sessionAuthTime(req(jwt({ iat: 2e9, amr: [{ method: 'otp', timestamp: 1000 }, { method: 'otp', timestamp: 1500 }] })), {})).toBe(1_500_000);
    expect(sessionAuthTime(req('garbage'), { last_sign_in_at: '2026-11-05T11:55:00Z' })).toBe(Date.parse('2026-11-05T11:55:00Z'));
    expect(sessionAuthTime(req(jwt({ iat: 2e9 })), {})).toBeNull(); // iat alone is NOT sign-in time
  });

  it('P2-10 solo workspaces deleted with the account are audited as workspace.delete', async () => {
    results = { workspace_members: { data: [{ workspace_id: 'ws-solo', user_id: 'u1', role: 'owner' }], error: null }, workspaces: { data: null, error: null } };
    await deleteAccount(c, { confirm: 'me@test.invalid' }, now - 60_000, now);
    const ev = ops('audit_events', 'insert').map((x) => x.args[0] as Record<string, unknown>);
    expect(ev.find((e) => e.action === 'workspace.delete')).toMatchObject({ target_id: 'ws-solo', workspace_id: null, actor_id: 'u1' });
    expect(ev.find((e) => e.action === 'account.delete')).toMatchObject({ actor_id: null });
  });
});

describe('P2-9 export completeness', () => {
  const tablesFor = async (role: string) => {
    calls.length = 0;
    results = { workspace_members: (f) => (f.some((x) => x.op === 'maybeSingle') ? { data: { role }, error: null } : { data: [], error: null }), workspaces: { data: { id: INV.workspace_id }, error: null } };
    return Object.keys((await exportWorkspace(c, INV.workspace_id)).tables);
  };
  it('includes case_resolutions; audit_events only for owners', async () => {
    expect(await tablesFor('editor')).toContain('case_resolutions');
    expect(await tablesFor('editor')).not.toContain('audit_events');
    expect(await tablesFor('owner')).toEqual(expect.arrayContaining(['case_resolutions', 'audit_events']));
  });
});

describe('P2-11 viewers do not write model traces', () => {
  const req = new Request('http://x', { headers: { authorization: 'Bearer abcdefghijklmnopqrstuvwxyz' } });
  const ev = [{ step: 'extract', provider: 'gemini', model: 'g', status: 'ok', durationMs: 5 }] as never;
  it('viewer: no insert; editor: insert', async () => {
    results = { projects: { data: { id: 'p1', workspace_id: INV.workspace_id }, error: null }, workspace_members: { data: { role: 'viewer' }, error: null } };
    await recordTraces(req, '20000000-0000-4000-a000-000000000001', '/api/extract', ev);
    expect(ops('model_traces', 'insert')).toEqual([]);
    results.workspace_members = { data: { role: 'editor' }, error: null };
    await recordTraces(req, '20000000-0000-4000-a000-000000000001', '/api/extract', ev);
    expect(ops('model_traces', 'insert')).toHaveLength(1);
  });
});
