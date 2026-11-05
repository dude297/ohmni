import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Caller } from '@/lib/server/supabase';

// Network-free: a chainable fake stands in for supabase-js (same pattern as audit-cases.test.ts).
const writes: { table: string; op: string; row: unknown }[] = [];
let results: Record<string, { data: unknown; error: unknown }> = {};
function fakeDb() {
  return {
    rpc: async () => ({ data: 0, error: null }), // shared rate limiter: never limited here
    from(table: string) {
      const chain: unknown = new Proxy({}, {
        get(_t, k) {
          if (k === 'then') return (res: (v: unknown) => void) => res(results[table] ?? { data: null, error: null });
          if (k === 'insert' || k === 'update')
            return (row: unknown) => {
              writes.push({ table, op: k, row });
              return chain;
            };
          return () => chain;
        },
      });
      return chain;
    },
  };
}
vi.mock('@/lib/server/supabase', async (orig) => ({ ...(await orig<object>()), adminDb: () => fakeDb() }));
vi.mock('@/lib/ai/vision', () => ({ extractWithFallback: vi.fn() }));
vi.mock('@/lib/explain', () => ({ explain: vi.fn() }));
vi.mock('@/lib/review', async (orig) => ({ ...(await orig<object>()), mentorExplain: vi.fn() }));

const { setAiPolicy, aiPolicyBlock } = await import('@/lib/persist/aiPolicy');
const { POST: extract } = await import('@/app/api/extract/route');
const { POST: explainRoute } = await import('@/app/api/explain/route');
const { POST: review } = await import('@/app/api/review/route');
const { POST: solve } = await import('@/app/api/solve/route');
const { extractWithFallback } = await import('@/lib/ai/vision');
const { explain } = await import('@/lib/explain');
const { mentorExplain, reviewCircuit } = await import('@/lib/review');
const { DIVIDER_10K_1K } = await import('@/lib/circuit/fixtures');

const WS = '10000000-0000-4000-a000-000000000001';
const PROJECT = '20000000-0000-4000-a000-000000000001';
const caller = { user: { id: 'u1' }, db: fakeDb(), requestId: 'req-1' } as unknown as Caller;
const aiOff = () => (results.projects = { data: { workspace: { ai_processing: false } }, error: null });
const postJson = (fn: (r: Request) => Promise<Response>, body: unknown) =>
  fn(new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  writes.length = 0;
  results = {};
  vi.stubEnv('SUPABASE_URL', 'http://sb.invalid');
  vi.stubEnv('SUPABASE_ANON_KEY', 'anon');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
  vi.stubEnv('REQUIRE_AI_CONSENT', '');
});
afterEach(() => vi.unstubAllEnvs());

describe('POST /api/v1/workspaces/:id/ai-policy authz', () => {
  it('owner flips the flag with the service role and it is audited', async () => {
    results = { workspace_members: { data: { role: 'owner' }, error: null }, workspaces: { data: { id: WS, ai_processing: false }, error: null } };
    await expect(setAiPolicy(caller, WS, { aiProcessing: false })).resolves.toEqual({ workspace: { id: WS, ai_processing: false } });
    expect(writes).toEqual([
      { table: 'workspaces', op: 'update', row: { ai_processing: false } },
      { table: 'audit_events', op: 'insert', row: expect.objectContaining({ action: 'workspace.ai_policy', workspace_id: WS, metadata: { aiProcessing: false } }) },
    ]);
  });

  it('editor/viewer get 403, non-member 404, and nothing is written', async () => {
    for (const role of ['editor', 'viewer']) {
      results = { workspace_members: { data: { role }, error: null } };
      await expect(setAiPolicy(caller, WS, { aiProcessing: false })).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    }
    results = { workspace_members: { data: null, error: null } };
    await expect(setAiPolicy(caller, WS, { aiProcessing: false })).rejects.toMatchObject({ status: 404 });
    expect(writes).toEqual([]);
  });
});

describe('AI_DISABLED_FOR_WORKSPACE enforcement', () => {
  it('aiPolicyBlock: no/invalid projectId or AI on = allowed; AI off = 403; lookup error = 503 (fail closed)', async () => {
    expect(await aiPolicyBlock(undefined)).toBeNull();
    expect(await aiPolicyBlock('nope')).toBeNull();
    results.projects = { data: { workspace: { ai_processing: true } }, error: null };
    expect(await aiPolicyBlock(PROJECT)).toBeNull();
    results.projects = { data: null, error: null };
    expect(await aiPolicyBlock(PROJECT)).toBeNull();
    aiOff();
    expect((await aiPolicyBlock(PROJECT))?.status).toBe(403);
    results.projects = { data: null, error: { code: 'x' } };
    expect((await aiPolicyBlock(PROJECT))?.status).toBe(503);
  });

  it('extract, explain and the review mentor refuse before any provider call', async () => {
    aiOff();
    const fd = new FormData();
    fd.set('image', new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1])], 'a.png', { type: 'image/png' }));
    fd.set('projectId', PROJECT);
    const r1 = await extract(new Request('http://x/api/extract', { method: 'POST', body: fd }));
    expect(r1.status).toBe(403);
    expect((await r1.json()).error.code).toBe('AI_DISABLED_FOR_WORKSPACE');

    const r2 = await postJson(explainRoute, { graph: DIVIDER_10K_1K, userConfirmed: true, projectId: PROJECT });
    expect(r2.status).toBe(403);

    const findingId = reviewCircuit(DIVIDER_10K_1K, {}).findings[0]?.id ?? 'none';
    const r3 = await postJson(review, { graph: DIVIDER_10K_1K, userConfirmed: true, projectId: PROJECT, mentor: { findingId, level: 'beginner', mode: 'explain' } });
    expect(r3.status).toBe(403);

    expect(extractWithFallback).not.toHaveBeenCalled();
    expect(explain).not.toHaveBeenCalled();
    expect(mentorExplain).not.toHaveBeenCalled();
  });

  it('deterministic routes are unaffected: review without mentor and solve still answer', async () => {
    aiOff();
    expect((await postJson(review, { graph: DIVIDER_10K_1K, userConfirmed: true, projectId: PROJECT })).status).toBe(200);
    expect((await postJson(solve, { graph: DIVIDER_10K_1K, userConfirmed: true, projectId: PROJECT })).status).toBe(200);
  });
});
