import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Caller } from '@/lib/server/supabase';

// Network-free: a chainable fake stands in for supabase-js. Each from(table) resolves to results[table]; inserts are captured.
const inserts: { table: string; row: unknown }[] = [];
let results: Record<string, { data: unknown; error: unknown }> = {};
let adminThrows = false;
function fakeDb() {
  return {
    from(table: string) {
      const q: Record<string, unknown> = {};
      const chain = new Proxy(q, {
        get(_t, k) {
          if (k === 'then') return (res: (v: unknown) => void) => res(results[table] ?? { data: null, error: null });
          if (k === 'insert')
            return (row: unknown) => {
              if (adminThrows) throw new Error('network down');
              inserts.push({ table, row });
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

const { audit, listAudit } = await import('@/lib/persist/audit');
const { caseResolution, closeInvestigation, schemas } = await import('@/lib/persist');

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
const caller = { user: { id: 'u1' }, db: fakeDb(), requestId: 'req-1' } as unknown as Caller;

beforeEach(() => {
  inserts.length = 0;
  results = {};
  adminThrows = false;
});

describe('resolved-case capture', () => {
  it('a case is benchmark-eligible only with a passing server-side verification', () => {
    const fault = { componentId: 'R2', faultClass: 'open' as const, measuredOhms: 1e9 };
    expect(caseResolution(INV, GRAPH, fault, true, 'ver-1', 'u1')).toMatchObject({ benchmark_eligible: true, benchmark_consent: true, verification_id: 'ver-1', component_id: 'R2', fault_class: 'open', measured_ohms: 1e9 });
    expect(caseResolution(INV, GRAPH, fault, true, null, 'u1')).toMatchObject({ benchmark_eligible: false, verification_id: null });
  });

  it('rejects a component that is not in the stored circuit, and no_fault_found with a component', () => {
    expect(() => caseResolution(INV, GRAPH, { componentId: 'R9', faultClass: 'short' }, false, null, 'u1')).toThrow(/not part of this circuit/);
    expect(() => caseResolution(INV, GRAPH, { faultClass: 'open' }, false, null, 'u1')).toThrow(/not part of this circuit/);
    expect(() => caseResolution(INV, GRAPH, { componentId: 'R1', faultClass: 'no_fault_found' }, false, null, 'u1')).toThrow(/no componentId/);
    expect(caseResolution(INV, GRAPH, { faultClass: 'no_fault_found' }, false, null, 'u1')).toMatchObject({ component_id: null, benchmark_eligible: false });
  });

  it('close schema stays backward compatible and validates the fault', () => {
    expect(schemas.close.safeParse({ status: 'abandoned' }).success).toBe(true);
    expect(schemas.close.safeParse({ status: 'resolved', confirmedFault: { componentId: 'R1', faultClass: 'x10' }, benchmarkConsent: true }).success).toBe(true);
    expect(schemas.close.safeParse({ status: 'resolved', confirmedFault: { componentId: 'R1', faultClass: 'melted' } }).success).toBe(false);
    expect(schemas.close.safeParse({ status: 'resolved', confirmedFault: { componentId: 'R1', faultClass: 'open', measuredOhms: -1 } }).success).toBe(false);
  });

  it('confirmedFault on an abandoned investigation is refused before any write', async () => {
    await expect(closeInvestigation(caller, INV.id, { status: 'abandoned', confirmedFault: { componentId: 'R1', faultClass: 'open' } })).rejects.toMatchObject({ status: 422 });
    expect(inserts).toEqual([]);
  });

  it('close with a confirmed fault stores the label (eligible from the stored verification) and an audit event', async () => {
    results = {
      investigations: { data: { ...INV, project_id: 'p', revision_id: 'r', title: 't', status: 'resolved', opened_at: 'x', closed_at: 'y', revision: { graph: GRAPH, revision_hash: 'rev_x' } }, error: null },
      measurements: { data: [], error: null },
      repair_proposals: { data: [{ id: 'prop-1' }], error: null },
      verifications: { data: [{ id: 'ver-9' }], error: null },
      case_resolutions: { data: { fault_class: 'open', benchmark_eligible: true, benchmark_consent: true }, error: null },
      audit_events: { data: null, error: null },
    };
    const out = await closeInvestigation(caller, INV.id, { status: 'resolved', confirmedFault: { componentId: 'R2', faultClass: 'open' }, benchmarkConsent: true });
    expect(out.resolution).toMatchObject({ benchmark_eligible: true });
    expect(inserts.find((i) => i.table === 'case_resolutions')?.row).toMatchObject({ benchmark_eligible: true, verification_id: 'ver-9', resolved_by: 'u1' });
    const ev = inserts.find((i) => i.table === 'audit_events')?.row as Record<string, unknown>;
    expect(ev).toMatchObject({ action: 'investigation.close', actor_id: 'u1', request_id: 'req-1', target_id: INV.id, metadata: { status: 'resolved', benchmarkEligible: true } });
  });

  it('no stored passing verification: case is recorded but not eligible', async () => {
    results = {
      investigations: { data: { ...INV, revision: { graph: GRAPH, revision_hash: 'rev_x' } }, error: null },
      measurements: { data: [], error: null },
      repair_proposals: { data: [], error: null },
      case_resolutions: { data: { benchmark_eligible: false }, error: null },
    };
    await closeInvestigation(caller, INV.id, { status: 'resolved', confirmedFault: { componentId: 'R2', faultClass: 'open' }, benchmarkConsent: true });
    expect(inserts.find((i) => i.table === 'case_resolutions')?.row).toMatchObject({ benchmark_eligible: false, verification_id: null });
  });
});

describe('audit log', () => {
  it('never throws: a failed or thrown write is logged and swallowed', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    results = { audit_events: { data: null, error: { code: '42501' } } };
    await expect(audit(caller, { workspaceId: INV.workspace_id, action: 'project.create', targetType: 'project' })).resolves.toBeUndefined();
    adminThrows = true;
    await expect(audit(caller, { workspaceId: INV.workspace_id, action: 'project.create', targetType: 'project' })).resolves.toBeUndefined();
    expect(err).toHaveBeenCalledTimes(2);
    expect(String(err.mock.calls[0][0])).not.toMatch(/u1/); // no actor/user data in logs
    err.mockRestore();
  });

  it('explicit null actor (account deletion)', async () => {
    await audit(caller, { workspaceId: null, action: 'account.delete', targetType: 'user', targetId: 'u1' }, null);
    expect(inserts[0].row).toMatchObject({ actor_id: null, workspace_id: null, action: 'account.delete' });
  });

  it('owners only; pages newest first with a cursor', async () => {
    results = { workspace_members: { data: null, error: null } };
    await expect(listAudit(caller, INV.workspace_id)).rejects.toMatchObject({ status: 404 });
    results = { workspace_members: { data: { role: 'editor' }, error: null } };
    await expect(listAudit(caller, INV.workspace_id)).rejects.toMatchObject({ status: 403 });
    results = { workspace_members: { data: { role: 'owner' }, error: null }, audit_events: { data: [{ created_at: 't2' }, { created_at: 't1' }], error: null } };
    expect(await listAudit(caller, INV.workspace_id, { limit: 2 })).toMatchObject({ nextBefore: 't1' });
    expect(await listAudit(caller, INV.workspace_id, { limit: 5 })).toMatchObject({ nextBefore: null });
    await expect(listAudit(caller, INV.workspace_id, { before: 'yesterday' })).rejects.toMatchObject({ status: 422 });
  });
});
