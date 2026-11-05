import { caller } from '@/lib/server/supabase';
import { body, uuidParam, v1 } from '@/lib/server/v1';
import * as persist from '@/lib/persist';

// Owner-only: grant or withdraw benchmark consent for a resolved case; body { consent: boolean }. Audited.
export const POST = v1('/api/v1/investigations/[id]/resolution/consent', async (req, p) => {
  const c = await caller(req);
  return { resolution: await persist.setBenchmarkConsent(c, uuidParam(p.id), await body(req, persist.consentSchema)) };
});
