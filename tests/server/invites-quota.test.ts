import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Caller } from '@/lib/server/supabase';

// Network-free: a fake service-role client. No real invite email is ever sent.
let existingUser: string | null;
let rateWait: number;
let rateError: unknown;
let getUser: () => Promise<{ data: { user: { id: string } | null }; error: { status?: number } | null }>;
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
const invites: { email: string; opts: unknown }[] = [];
const upserts: unknown[] = [];
const auditRows: { action: string; target_id: string }[] = [];

function chain(table: string) {
  let upserted: unknown;
  const c: Record<string, unknown> = new Proxy({}, {
    get(_t, k) {
      if (k === 'then') {
        const res =
          table === 'workspace_members' && upserted ? { data: { ...(upserted as object), created_at: 't' }, error: null }
          : table === 'workspace_members' ? { data: [{ user_id: 'owner-1' }], error: null }
          : { data: null, error: null };
        return (r: (v: unknown) => void) => r(res);
      }
      if (k === 'upsert') return (row: unknown) => (upserts.push(row), (upserted = row), c);
      if (k === 'insert') return (row: { action: string; target_id: string }) => (table === 'audit_events' && auditRows.push(row), c);
      return () => c;
    },
  });
  return c;
}
const admin = {
  from: chain,
  rpc: async (fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ fn, args });
    if (fn === 'user_id_by_email') return { data: existingUser, error: null };
    if (fn === 'rate_hit') return rateError ? { data: null, error: rateError } : { data: rateWait, error: null };
    return { data: null, error: null };
  },
  auth: {
    getUser: () => getUser(),
    admin: {
      inviteUserByEmail: async (email: string, opts: unknown) => {
        invites.push({ email, opts });
        return { data: { user: { id: 'new-user' } }, error: null };
      },
    },
  },
};
vi.mock('@/lib/server/supabase', async (orig) => ({ ...(await orig<object>()), adminDb: () => admin }));

const { upsertMember } = await import('@/lib/persist/members');
const { checkShared, userQuota } = await import('@/lib/server/sharedLimit');

const WS = '10000000-0000-4000-a000-000000000001';
const ownerDb = { from: () => new Proxy({}, { get: (_t, k) => (k === 'then' ? (r: (v: unknown) => void) => r({ data: { role: 'owner' }, error: null }) : () => ownerDb.from()) }) };
const c = { user: { id: 'owner-1' }, db: ownerDb, requestId: 'req-1' } as unknown as Caller;

beforeEach(() => {
  existingUser = null;
  rateWait = 0;
  rateError = null;
  getUser = async () => ({ data: { user: { id: 'user-9' } }, error: null });
  for (const a of [rpcCalls, invites, upserts, auditRows]) a.length = 0;
});
afterEach(() => vi.unstubAllEnvs());

describe('workspace invitations', () => {
  it('existing account: adds the membership, no invite, no invite limiter', async () => {
    existingUser = 'user-2';
    const m = await upsertMember(c, WS, { email: 'a@example.com', role: 'editor' }, 'https://ohmni.example');
    expect(m).toMatchObject({ user_id: 'user-2', role: 'editor', invited: false });
    expect(invites).toEqual([]);
    expect(rpcCalls.some((r) => r.fn === 'rate_hit')).toBe(false);
    expect(auditRows.map((r) => r.action)).toEqual(['member.upsert']);
  });

  it('no account: invites with the request origin, then adds the membership for the new user id', async () => {
    const m = await upsertMember(c, WS, { email: 'new@example.com', role: 'viewer' }, 'https://ohmni.example');
    expect(invites).toEqual([{ email: 'new@example.com', opts: { redirectTo: 'https://ohmni.example/account' } }]);
    expect(rpcCalls.find((r) => r.fn === 'rate_hit')?.args).toEqual({ p_key: `invite:${WS}`, p_window_s: 86400, p_max: 20 });
    expect(upserts).toEqual([{ workspace_id: WS, user_id: 'new-user', role: 'viewer' }]);
    expect(m).toMatchObject({ user_id: 'new-user', invited: true });
    expect(auditRows).toMatchObject([{ action: 'member.invite', target_id: 'new-user' }]);
    expect(JSON.stringify(auditRows)).not.toContain('new@example.com');
  });

  it('invite limit hit: 429 INVITE_LIMIT with retryAfter, nothing sent or written', async () => {
    rateWait = 7200;
    await expect(upsertMember(c, WS, { email: 'new@example.com', role: 'viewer' }, 'https://x')).rejects.toMatchObject({ status: 429, code: 'INVITE_LIMIT', retryAfter: 7200 });
    expect(invites).toEqual([]);
    expect(upserts).toEqual([]);
  });

  it('limiter unreachable: fails closed (no email sent)', async () => {
    rateError = { code: 'XX000' };
    await expect(upsertMember(c, WS, { email: 'new@example.com', role: 'viewer' }, 'https://x')).rejects.toMatchObject({ status: 502 });
    expect(invites).toEqual([]);
  });

  it('the v1 wrapper turns INVITE_LIMIT into a 429 with Retry-After', async () => {
    const { v1 } = await import('@/lib/server/v1');
    const { ApiError } = await import('@/lib/server/supabase');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const r = await v1('/t', async () => { throw new ApiError(429, 'INVITE_LIMIT', 'x', undefined, 60); })(new Request('http://x/t', { method: 'POST' }));
    log.mockRestore();
    expect(r.status).toBe(429);
    expect(r.headers.get('retry-after')).toBe('60');
  });
});

describe('per-user model quotas', () => {
  const TOKEN = 'Bearer ' + 'a'.repeat(40);
  const env = () => {
    vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:9');
    vi.stubEnv('SUPABASE_ANON_KEY', 'a');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 's');
  };

  it('anonymous callers are not quota-checked (per-IP limits only)', async () => {
    expect(await userQuota('/api/extract', new Headers())).toBe(0);
    expect(rpcCalls).toEqual([]);
  });

  it('signed-in caller is counted per user per route per day, env-tunable', async () => {
    vi.stubEnv('QUOTA_EXTRACT_PER_DAY', '3');
    expect(await userQuota('/api/extract', new Headers({ authorization: TOKEN }))).toBe(0);
    expect(rpcCalls[0].args).toEqual({ p_key: 'quota:/api/extract:user-9', p_window_s: 86400, p_max: 3 });
  });

  it('invalid token = anonymous; auth outage throws (caller fails open)', async () => {
    getUser = async () => ({ data: { user: null }, error: { status: 403 } });
    expect(await userQuota('/api/review', new Headers({ authorization: TOKEN }))).toBe(0);
    getUser = async () => ({ data: { user: null }, error: { status: 0 } });
    await expect(userQuota('/api/review', new Headers({ authorization: TOKEN }))).rejects.toThrow();
  });

  it('exhausted quota -> 429 QUOTA_EXCEEDED with Retry-After seconds', async () => {
    env();
    rateWait = 0;
    const real = admin.rpc;
    admin.rpc = async (fn, args) => (String(args.p_key).startsWith('quota:') ? { data: 5000, error: null } : real(fn, args));
    try {
      expect(await checkShared('POST', '/api/explain', new Headers({ authorization: TOKEN }))).toMatchObject({ status: 429, code: 'QUOTA_EXCEEDED', retryAfter: 5000 });
    } finally {
      admin.rpc = real;
    }
  });

  it('fails open and logs when the quota store errors', async () => {
    env();
    const real = admin.rpc;
    admin.rpc = async (fn, args) => (String(args.p_key).startsWith('quota:') ? { data: null, error: { code: 'XX000' } } : real(fn, args));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(await checkShared('POST', '/api/extract', new Headers({ authorization: TOKEN }))).toBeNull();
      expect(log.mock.calls.some(([l]) => String(l).includes('shared_rate_limit_unavailable'))).toBe(true);
    } finally {
      admin.rpc = real;
      log.mockRestore();
    }
  });
});
