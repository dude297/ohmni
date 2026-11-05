import { caller } from '@/lib/server/supabase';
import { uuidParam, v1 } from '@/lib/server/v1';
import { listAudit } from '@/lib/persist/audit';

// Audit log (owners only), newest first. ?limit=1..200 (default 50) &before=<nextBefore from the previous page>.
export const GET = v1('/api/v1/workspaces/[id]/audit', async (req, p) => {
  const ws = uuidParam(p.id);
  const q = new URL(req.url).searchParams;
  return listAudit(await caller(req), ws, { limit: q.has('limit') ? Number(q.get('limit')) : undefined, before: q.get('before') ?? undefined });
});
