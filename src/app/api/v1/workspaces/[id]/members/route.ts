import { caller } from '@/lib/server/supabase';
import { body, uuidParam, v1 } from '@/lib/server/v1';
import { listMembers, memberSchemas, upsertMember } from '@/lib/persist/members';

export const GET = v1('/api/v1/workspaces/[id]/members', async (req, p) => ({ members: await listMembers(await caller(req), uuidParam(p.id)) }));
// Owner adds a member by email (inviting them if they have no account yet), or changes a member's role.
// The invite link returns to this deployment's own origin (must be in Supabase Auth's redirect allowlist).
export const POST = v1('/api/v1/workspaces/[id]/members', async (req, p) => {
  const c = await caller(req);
  const { invited, ...member } = await upsertMember(c, uuidParam(p.id), await body(req, memberSchemas.add), new URL(req.url).origin);
  return { member, invited };
});
