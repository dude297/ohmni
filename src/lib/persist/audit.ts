import { adminDb, ApiError, dbFail, type Caller } from '../server/supabase';

// Append-only audit trail (public.audit_events). Server-written with the service role after the action succeeded;
// owners read it through RLS. Metadata carries ids, roles, statuses and counts only: never names, emails, titles,
// bodies, graphs or readings. A failed audit write is logged and swallowed: it never undoes or fails the action.
// ponytail: best-effort, not transactional with the action; move to a DB trigger or outbox if audits must be lossless.

export type AuditAction =
  | 'workspace.create'
  | 'workspace.delete'
  | 'workspace.export'
  | 'member.upsert'
  | 'member.invite'
  | 'member.remove'
  | 'project.create'
  | 'revision.confirm'
  | 'investigation.open'
  | 'investigation.close'
  | 'artifact.upload'
  | 'account.delete';

type Meta = Record<string, string | number | boolean | null>;
export type AuditEvent = { workspaceId: string | null; action: AuditAction; targetType: string; targetId?: string | null; metadata?: Meta };

/** Never throws. actor = the caller, unless null is passed explicitly (e.g. after the account was deleted). */
export async function audit(c: Pick<Caller, 'user' | 'requestId'>, e: AuditEvent, actor: string | null = c.user.id) {
  try {
    const { error } = await adminDb()
      .from('audit_events')
      .insert({ workspace_id: e.workspaceId, actor_id: actor, action: e.action, target_type: e.targetType, target_id: e.targetId ?? null, metadata: e.metadata ?? {}, request_id: c.requestId ?? null });
    if (error) console.error(JSON.stringify({ audit: 'write_failed', action: e.action, requestId: c.requestId, code: error.code }));
  } catch (err) {
    console.error(JSON.stringify({ audit: 'write_failed', action: e.action, requestId: c.requestId, error: err instanceof Error ? err.name : typeof err }));
  }
}

const MAX = 200;
/** Owners only, newest first. Cursor: pass the previous page's `nextBefore` as `before` (created_at, exclusive). */
export async function listAudit(c: Caller, workspaceId: string, q: { limit?: number; before?: string } = {}) {
  const { data: me, error } = await c.db.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', c.user.id).maybeSingle();
  if (error) dbFail(error, 'check membership');
  if (!me) throw new ApiError(404, 'NOT_FOUND', 'workspace: not found.');
  if (me.role !== 'owner') throw new ApiError(403, 'FORBIDDEN', 'Only workspace owners can read the audit log.');
  const limit = Math.min(MAX, Math.max(1, Math.floor(q.limit ?? 50) || 50));
  if (q.before !== undefined && Number.isNaN(Date.parse(q.before))) throw new ApiError(422, 'INVALID_REQUEST', 'before must be an ISO timestamp.');
  let query = c.db
    .from('audit_events')
    .select('id, actor_id, action, target_type, target_id, metadata, request_id, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);
  // ponytail: created_at keyset; events sharing one microsecond across a page boundary could be skipped. Add (created_at, id) if that matters.
  if (q.before) query = query.lt('created_at', q.before);
  const { data, error: e2 } = await query;
  if (e2) dbFail(e2, 'read audit log');
  const events = data ?? [];
  return { events, nextBefore: events.length === limit ? events[events.length - 1].created_at : null };
}
