import { z } from 'zod';
import { adminDb, ApiError, dbFail, persistenceConfigured, type Caller } from '../server/supabase';
import { audit } from './audit';

// Per-workspace AI switch (workspaces.ai_processing). Owners flip it through the API; model routes check it before
// any provider call when the request names a projectId. Anonymous/unsaved use carries no workspace context and is
// governed by the per-request consent checkbox (REQUIRE_AI_CONSENT) instead.

export const aiPolicySchema = z.object({ aiProcessing: z.boolean() });

/** Owners only. Role proven through the caller's RLS client; the write uses the service role (no client UPDATE grant). */
export async function setAiPolicy(c: Caller, workspaceId: string, b: z.infer<typeof aiPolicySchema>) {
  const { data: me, error } = await c.db.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', c.user.id).maybeSingle();
  if (error) dbFail(error, 'check membership');
  if (!me) throw new ApiError(404, 'NOT_FOUND', 'workspace: not found.');
  if (me.role !== 'owner') throw new ApiError(403, 'FORBIDDEN', 'Only workspace owners can change the AI processing policy.');
  const { data, error: e2 } = await adminDb().from('workspaces').update({ ai_processing: b.aiProcessing }).eq('id', workspaceId).select('id, ai_processing').single();
  if (e2) dbFail(e2, 'update AI policy');
  await audit(c, { workspaceId, action: 'workspace.ai_policy', targetType: 'workspace', targetId: workspaceId, metadata: { aiProcessing: b.aiProcessing } });
  return { workspace: data };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const deny = (status: number, code: string, message: string) => Response.json({ error: { code, message } }, { status });

/**
 * Call before any model provider call. Returns a 403 Response when the projectId belongs to a workspace with AI off,
 * otherwise null. Looked up by project id alone (service role): naming a project of an AI-off workspace is refused
 * whoever sends it. Fails closed (503) if the lookup itself errors.
 */
export async function aiPolicyBlock(projectId: unknown): Promise<Response | null> {
  if (typeof projectId !== 'string' || !UUID.test(projectId) || !persistenceConfigured()) return null;
  try {
    const { data, error } = await adminDb().from('projects').select('workspace:workspaces (ai_processing)').eq('id', projectId).maybeSingle();
    if (error) throw error;
    const ws = (Array.isArray(data?.workspace) ? data.workspace[0] : data?.workspace) as { ai_processing?: boolean } | null | undefined;
    if (ws?.ai_processing === false)
      return deny(403, 'AI_DISABLED_FOR_WORKSPACE', 'AI processing is turned off for this workspace by an owner. Deterministic tools (solve, probe, repair) still work.');
    return null;
  } catch {
    return deny(503, 'AI_POLICY_UNAVAILABLE', 'Could not check the workspace AI policy; try again.');
  }
}
