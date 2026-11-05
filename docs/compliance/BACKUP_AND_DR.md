# Backup and disaster recovery

## What exists

| Asset | Where | Backup | Status |
|---|---|---|---|
| Application code and config | GitHub `dude297/ohmni` | Git history; every deployment is an immutable Vercel build | implemented |
| Production deployments | Vercel project `ohmni` | Previous deployments kept and promotable (instant rollback) | implemented, **never rehearsed** |
| Database (all tenant data, audit log) | Supabase project `ohmni` (`oyiwnfcbdiakzmqpufaf`, us-west-2) | Supabase daily backups, retention depends on plan; PITR is a Pro-plan add-on | **unverified** (plan, retention and PITR not checked; never restored) |
| Storage bucket `artifacts` (saved schematic images) | Supabase Storage | Not covered by database backups as far as the repo shows; no separate copy | **gap / unverified** |
| Auth users | Supabase Auth (`auth` schema) | Part of the database backup | unverified |
| Secrets (provider keys, service-role key) | Vercel env, owner's `.env.local` | Re-issuable from each provider console; not backed up | by design |
| Schema | `supabase/migrations/*.sql` | In Git; reproducible on an empty project | implemented |

## Targets (proposal)

| Tier | RTO | RPO | Basis |
|---|---|---|---|
| Stateless app (core analysis routes) | 15 min | 0 (no state) | Vercel promote of previous deployment |
| Saved investigations (Postgres) | 4 h | 24 h on daily backups; ≤ 5 min if PITR is enabled | Supabase restore |
| Saved images (Storage) | 24 h | Not recoverable today | Gap: needs object versioning or a scheduled copy |
| Region loss (us-west-2) | Not defined | Not defined | Single region; GA gate requires multi-region or documented RTO/RPO (`docs/PRODUCTION_PHASE1.md` §F) |

## Monthly restore drill (proposal; first run required before paid beta)

1. Record date, operator, source project and backup timestamp.
2. Create a **scratch** Supabase project (never restore over production).
3. Restore: on plans with downloadable backups, download the latest daily backup and restore into scratch with `psql`; on Pro, use the dashboard restore-to-new-project option if offered. Note which method the plan allowed (**unverified** today).
4. Verify: `supabase db query -f supabase/tests/rls_matrix.sql` → `RLS MATRIX: ALL PASS`; row counts per table vs production (`select count(*)` per table in `public`); latest `created_at` in `measurements` and `audit_events` ≥ backup time minus RPO.
5. App check: point a local build at scratch (`.env.local`), run `node --env-file=.env.local scripts/persistence-e2e.mjs http://localhost:3000`.
6. Measure elapsed time from step 2 to step 5 = observed RTO. Delete the scratch project (it contains production personal data).
7. Log the result (date, method, RTO, RPO observed, issues) in [../OPERATIONS.md](../OPERATIONS.md) "Backups and deletion".

## Migration policy

- Forward-only files in `supabase/migrations/`; never edit an applied file; undo = a new forward migration (`docs/OPERATIONS.md`).
- Before applying: `node scripts/rls-check.mjs` runs pending migrations + RLS matrix in one rolled-back transaction. CI (`.github/workflows/rls.yml`) runs it on schema PRs **once the owner sets `SUPABASE_ACCESS_TOKEN` / `SUPABASE_PROJECT_REF`** (skipped until then).
- Apply with `supabase db push --linked` from the merged commit, then re-run `rls-check` and `supabase db advisors --linked`.
- Proposal: take a manual backup (or note the PITR timestamp) immediately before any destructive migration (drop/alter column, data rewrite).

## Rollback procedures

| Failure | Procedure |
|---|---|
| Bad app deploy | Vercel promote previous deployment; confirm `/api/health` build; revert by PR (`docs/OPERATIONS.md` "Rollback") |
| Bad migration, no data loss | New forward migration reverting the change; `rls-check`; push |
| Bad migration with data loss / corruption | Stop writes (unset `SUPABASE_*` or `OHMNI_DISABLED_TIERS=experimental`, redeploy); restore backup/PITR into a scratch project; copy affected rows back or promote per Supabase guidance; re-enable |
| Accidental workspace deletion by a customer | Permanent by design (typed-name confirmation, export offered first). Recovery only from backup into scratch, then manual re-insert; best-effort, no commitment |
| Supabase outage | Core analysis unaffected; shared limits fail open; `/api/v1` returns 502/503; post status, wait |
| Vercel outage | No secondary host in production; Netlify/Anbaric are not maintained as failover (`docs/PRODUCTION_PHASE1.md` §E) |

## Gaps

1. Backups never restored; PITR and retention not verified.
2. Storage objects have no backup.
3. App rollback never rehearsed (private-alpha gate).
4. Single region, no failover host.
5. Deleted data persists in backups until they age out (period unverified); disclose in DPA.
