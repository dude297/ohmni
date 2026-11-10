import { caller } from '@/lib/server/supabase';
import { body, uuidParam, v1 } from '@/lib/server/v1';
import { aiPolicySchema, setAiPolicy } from '@/lib/persist/aiPolicy';

// Turn third-party AI processing on/off for a workspace. Owners only; body { aiProcessing: boolean }. Audited.
export const POST = v1('/api/v1/workspaces/[id]/ai-policy', async (req, p) => {
  const ws = uuidParam(p.id);
  const c = await caller(req);
  return setAiPolicy(c, ws, await body(req, aiPolicySchema));
});
