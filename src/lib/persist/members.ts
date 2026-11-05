import { z } from 'zod';
import { adminDb, ApiError, dbFail, type Caller } from '../server/supabase';
import { audit } from './audit';

// Workspace membership. Clients have no write policy on workspace_members: the server checks the caller's role
// through RLS (their own membership row), then writes with the service role. An email without an account gets a
// Supabase Auth invitation (inviteUserByEmail creates the auth user), and the membership is added for that user id at
// once, so access is ready when they accept. Invites are capped per workspace per day (shared Postgres limiter).
// ponytail: last-owner checks read-then-write without a lock; two owners demoting each other at the same instant
// could leave zero owners. Upgrade path: one SQL function doing the check and write in a single transaction.

export const memberSchemas = {
  add: z.object({ email: z.email().max(320), role: z.enum(['owner', 'editor', 'viewer']) }),
};

async function myRole({ user, db }: Caller, workspaceId: string): Promise<string> {
  const { data, error } = await db.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', user.id).maybeSingle();
  if (error) dbFail(error, 'check membership');
  if (!data) throw new ApiError(404, 'NOT_FOUND', 'workspace: not found.');
  return data.role as string;
}

async function owners(workspaceId: string): Promise<string[]> {
  const { data, error } = await adminDb().from('workspace_members').select('user_id').eq('workspace_id', workspaceId).eq('role', 'owner');
  if (error) dbFail(error, 'count owners');
  return (data ?? []).map((r) => r.user_id as string);
}

export async function listMembers(c: Caller, workspaceId: string) {
  await myRole(c, workspaceId);
  const { data, error } = await adminDb().rpc('workspace_member_list', { p_workspace: workspaceId });
  if (error) dbFail(error, 'list members');
  return data ?? [];
}

const invitesPerDay = () => Number(process.env.INVITES_PER_WORKSPACE_PER_DAY) || 20;

/** Sends a Supabase invitation email; returns the new auth user id. */
async function invite(workspaceId: string, email: string, origin: string): Promise<string> {
  // Unlike the model-route limiter this fails CLOSED: an invite sends email, and the membership write below needs the DB anyway.
  const { data: wait, error } = await adminDb().rpc('rate_hit', { p_key: `invite:${workspaceId}`, p_window_s: 86_400, p_max: invitesPerDay() });
  if (error) dbFail(error, 'check invite limit');
  if (Number(wait) > 0)
    throw new ApiError(429, 'INVITE_LIMIT', `This workspace has sent ${invitesPerDay()} invitations today. Try again in ${Math.ceil(Number(wait) / 3600)}h.`, undefined, Number(wait));
  const { data, error: e2 } = await adminDb().auth.admin.inviteUserByEmail(email, { redirectTo: `${origin}/account` });
  if (e2 || !data?.user) {
    console.error(JSON.stringify({ msg: 'invite_failed', status: e2?.status ?? null, code: e2?.code ?? null }));
    if (e2?.status === 429) throw new ApiError(429, 'INVITE_LIMIT', 'The email service is rate limited. Try again later.');
    throw new ApiError(502, 'INVITE_FAILED', 'Could not send the invitation email.');
  }
  return data.user.id;
}

/** Owner adds a user (inviting them by email if they have no account yet) or changes a member's role. */
export async function upsertMember(c: Caller, workspaceId: string, b: z.infer<typeof memberSchemas.add>, origin: string) {
  if ((await myRole(c, workspaceId)) !== 'owner') throw new ApiError(403, 'FORBIDDEN', 'Only workspace owners can manage members.');
  const { data: found, error } = await adminDb().rpc('user_id_by_email', { p_email: b.email });
  if (error) dbFail(error, 'look up user');
  const invited = !found;
  const userId = (found as string | null) ?? (await invite(workspaceId, b.email, origin));
  const own = await owners(workspaceId);
  if (b.role !== 'owner' && own.length === 1 && own[0] === userId) throw new ApiError(409, 'LAST_OWNER', 'A workspace needs at least one owner.');
  const { data, error: e2 } = await adminDb()
    .from('workspace_members')
    .upsert({ workspace_id: workspaceId, user_id: userId, role: b.role }, { onConflict: 'workspace_id,user_id' })
    .select('user_id, role, created_at')
    .single();
  if (e2) dbFail(e2, 'save member');
  await audit(c, { workspaceId, action: invited ? 'member.invite' : 'member.upsert', targetType: 'user', targetId: userId, metadata: { role: b.role } });
  return { ...data, email: b.email, invited };
}

/** Owners remove anyone; any member may remove themselves (leave). The last owner cannot leave. */
export async function removeMember(c: Caller, workspaceId: string, userId: string) {
  const role = await myRole(c, workspaceId);
  if (role !== 'owner' && userId !== c.user.id) throw new ApiError(403, 'FORBIDDEN', 'Only workspace owners can remove other members.');
  const own = await owners(workspaceId);
  if (own.length === 1 && own[0] === userId) throw new ApiError(409, 'LAST_OWNER', 'A workspace needs at least one owner.');
  const { data, error } = await adminDb().from('workspace_members').delete().eq('workspace_id', workspaceId).eq('user_id', userId).select('user_id');
  if (error) dbFail(error, 'remove member');
  if (!data?.length) throw new ApiError(404, 'NOT_FOUND', 'member: not found.');
  await audit(c, { workspaceId, action: 'member.remove', targetType: 'user', targetId: userId, metadata: { self: userId === c.user.id } });
  return { removed: userId };
}
