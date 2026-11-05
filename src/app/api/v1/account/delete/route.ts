import { caller } from '@/lib/server/supabase';
import { body, v1 } from '@/lib/server/v1';
import { accountDeleteSchema, deleteAccount, sessionAuthTime } from '@/lib/persist/lifecycle';

// Permanent deletion of the caller's account; body { confirm: "<account email>" }. See deleteAccount for the rules.
// Requires a recent sign-in (401 REAUTH_REQUIRED otherwise).
export const POST = v1('/api/v1/account/delete', async (req) => {
  const c = await caller(req);
  return deleteAccount(c, await body(req, accountDeleteSchema), sessionAuthTime(req, c.user));
});
