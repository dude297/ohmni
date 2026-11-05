-- Per-workspace AI processing switch (docs/PRODUCTION_PHASE1.md F, paid beta). Our model providers run on free tiers
-- whose terms may allow training on inputs, so an owner can turn third-party AI off for a whole workspace. When off,
-- /api/extract, /api/explain and the /api/review mentor refuse requests that carry one of the workspace's projectIds
-- (403 AI_DISABLED_FOR_WORKSPACE) before any provider call. Deterministic features (solve, probe, repair) are unaffected.
--
-- Write path: owners only, through POST /api/v1/workspaces/:id/ai-policy (role proven via RLS, then service role).
-- workspaces never had a client UPDATE policy, so PostgREST updates already matched 0 rows; revoking the UPDATE
-- privilege makes that an explicit 42501 for every column (name included: nothing in the app renames workspaces),
-- consistent with the column-level revokes in 20261105010000_review_hardening.
alter table public.workspaces add column ai_processing boolean not null default true;
revoke update on public.workspaces from anon, authenticated;
