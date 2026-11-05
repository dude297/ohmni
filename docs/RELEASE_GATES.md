# Ohmni — Release Gate Status (evidence ledger)

Audit of every gate in [PRODUCTION_PHASE1.md section F](PRODUCTION_PHASE1.md) (lines 100-119). Taken 2026-11-05 ~05:50 PST on main `c788689` (#113), production https://multimodal-hackathon-sage.vercel.app reporting build `c788689`. Read-only audit: no settings changed, no database writes, 0 model calls.

Status: **MET** = evidence produced or pointed to below. **PARTIAL** = some of the gate has evidence, the rest is missing. **NOT MET** = evidence says it fails or does not exist. **UNVERIFIED** = could not be checked from here; stays unknown until someone checks.

## Scoreboard

| Stage | MET | PARTIAL | NOT MET | UNVERIFIED |
|---|---|---|---|---|
| Private alpha (5 gates, 9 rows) | 2 | 5 | 2 | 0 |
| Paid beta (4 gates + plan, 9 rows) | 2 | 3 | 3 | 1 |
| General availability (4 gates, 9 rows) | 2 | 3 | 4 | 0 |

Verdict: **not ready for private alpha** on two counts: rollback has never been rehearsed, and out-of-model confident-wrong is 6.19 % (target < 5 %) in the default voltage-only mode. Both are cheap to close or to accept explicitly. Paid beta and GA are mostly owner and vendor actions (plans, contracts, counsel, real cases), not code.

## Evidence I produced (commands and output)

| Check | Command | Result |
|---|---|---|
| Unit/integration tests | `npm ci && npm test` on `c788689` | `Test Files 67 passed \| 1 skipped (68)`, `Tests 776 passed \| 7 expected fail \| 3 skipped (786)`. On `67317fe`: 758 passed / 7 expected fail / 3 skipped (768). |
| Diagnosis benchmark, tuning seed | `BENCH=1 BENCH_LABEL=tune npx vitest run bench/run.test.ts` | seed 20261012; numbers in table below |
| Diagnosis benchmark, held-out | `BENCH=1 BENCH_SEED=777 BENCH_LABEL=heldout npx vitest run bench/run.test.ts` | seed 777 (never used for tuning) |
| Held-out, ohmmeter mode | `BENCH=1 BENCH_SEED=777 BENCH_OHM=1 BENCH_LABEL=heldout-ohm npx vitest run bench/run.test.ts` | opt-in power-off resistance readings |
| Post-deploy smoke vs prod | `SMOKE_TIMEOUT_S=30 node scripts/postdeploy-smoke.mjs https://multimodal-hackathon-sage.vercel.app c788689` | 7/7 PASS (health build, solve, bad JSON 400, probe R6 open, repair + server-judged verify incl. off-by-1 V rejected, `/api/v1/workspaces` 401, `/probe` core tier + headers). Same 7/7 at `67317fe` before #113 merged. Exit 0. |
| Health | `curl /api/health` | `{"status":"ok","build":"c788689","visionPrimary":"groq","providers":{gemini flash-lite, groq qwen3.8-27b, jev-1.13-free all configured},"persistence":{"configured":true,"browserAuth":true}}` |
| Security headers on `/` | `curl -sI /` | enforcing CSP (`default-src 'self'; script-src 'self' 'unsafe-inline'; ... connect-src 'self' https://*.supabase.co; object-src 'none'; frame-ancestors 'none'`), HSTS `max-age=63072000; includeSubDomains`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: microphone=(self), camera=(), ...` |
| Tiering | `curl -D - /twin` | `X-Ohmni-Tier: experimental` |
| Legal pages | `curl /privacy /terms /subprocessors /.well-known/security.txt` | all 200; privacy page banner: "Draft for beta — to be reviewed by counsel before commercial launch"; terms: "[contact email]. Governing law and venue: [to be determined by counsel]" (`src/app/terms/page.tsx:74`) |
| CSP browser smoke | `node scripts/csp-smoke.mjs <prod>` | **not run**: Playwright is not installed in this worktree (`import('playwright')` fails). Last recorded result: #83 "all 14 routes clean". |
| CI on main | `gh run list --branch main` | `c788689` ci success, postdeploy success (2026-11-05 12:51 UTC); `67317fe` same |
| RLS CI | `gh run view 42029891364 --log` (rls-matrix on PR #112) | "SUPABASE_ACCESS_TOKEN secret / SUPABASE_PROJECT_REF variable not set; RLS matrix skipped." The workflow exists but never runs in CI. |
| Repo security | `gh api repos/dude297/ohmni`, `.../branches/main/protection`, `.../rulesets`, `.../private-vulnerability-reporting`, `.../vulnerability-alerts` | public repo; secret scanning + push protection **enabled**; Dependabot security updates **disabled**; Dependabot alerts **404 (disabled)**; private vulnerability reporting **enabled**; main **not protected** (404), 0 rulesets |

### Diagnosis benchmark numbers (deterministic, no network, no models)

| Metric (sessions n) | Tuning seed 20261012 | Held-out seed 777 | Held-out + ohmmeter | Target |
|---|---|---|---|---|
| In-model top-1, equivalence-aware (n=900) | 98.44 % | **98.78 %** | 100 % | ≥ 95 % |
| In-model + 5 % parts, equivalence-aware (n=900) | 97.78 % | **98.00 %** | 99.67 % | ≥ 95 % |
| In-model confident-wrong ≥ 0.9 (n=900) | 0.11 % (1) | **0.11 % (1)** | 0 % | < 2 % |
| In-model + parts confident-wrong (n=900) | 0 % | 0 % | 0 % | < 2 % |
| Out-of-model confident-wrong (n=4200) | 6.57 % | **6.19 %** | **3.93 %** | < 5 % |
| of which silent (no warning, fit not poor) | 6.02 % | 5.64 % | 2.33 % | — |
| Loaded bridge out-of-model confident-wrong (n=1500) | 13.40 % | 12.33 % | 3.73 % | (subset of above) |
| Mean readings, in-model | 1.73 | 1.74 | 4.38 | — |
| Grounding corpus false-accepts (50 sentences: 28 accept / 22 reject) | 0 / 22 | 0 / 22 | 0 / 22 | 0 |
| Grounding false-rejects | 0 / 28 | 0 / 28 | 0 / 28 | — |
| Solver stress, 2000 random 6-node nets, 1 mΩ–1 TΩ, seed 4242: KCL violation > 1e-6 | 312, all flagged `ill_conditioned`; **silent 0** | same | same | warn on every ill-conditioned case |
| Solver: R1 = 1e-12 Ω case | 11.2 % KCL violation, warnings `['ill_conditioned']` | | | |

Calibration (ECE / Brier / reliability bins) is **not computed** by the harness today (`grep -i ece bench/` finds nothing), despite PRODUCTION_PHASE1 section D listing it. There are **0 real cases** in the benchmark (`bench/cases/` does not exist; every number above is synthetic).

## Private alpha (invited engineers, no payment)

| Gate | Status | Evidence | What's left / owner action |
|---|---|---|---|
| All P0 closed and merged with tests | PARTIAL | P0-1 server-authoritative verify #73 (smoke: off-by-1 V rejected). P0-2 diagnosis honesty #75/#82/#88. P0-3 workload ceilings #74 (`MAX_COMPONENTS = 60`, `src/lib/circuit/validate.ts:9`). P0-4 trusted IP + bounded limiter #74, shared Postgres limits #87, per-user daily quotas #109 (`src/lib/server/sharedLimit.ts:24-31`). P0-5 consent gate #76, UI sends `aiConsent` #99/#110. P0-6 auth + persistence #80/#81/#99. P0-7 request id / JSON logs #78. 776 tests pass. | P0-5 is code-complete but **not enforced**: `REQUIRE_AI_CONSENT` is unset in Vercel, and `consentMissing` only blocks when it equals `'1'` (`src/lib/server/consent.ts:3`). Owner: set `REQUIRE_AI_CONSENT=1` in Vercel production and redeploy. P0-2 out-of-model part: see benchmark row. |
| P1-1, P1-2, P1-5, P1-6, P1-7 closed | PARTIAL | P1-1 typed grounding: 0/22 false-accepts. P1-2 relative pivot + residual: `tests/circuit/solver-conditioning.test.ts:12,19`. P1-5 registry `src/lib/features.ts`, `X-Ohmni-Tier: experimental` on `/twin`. P1-7 headers present on prod (above). P1-6 Vercel-only production + post-deploy smoke comparing `/api/health` build to SHA: green at `c788689`. | P1-6 leftovers: no committed host config (`vercel.json` absent; headers live in `next.config.ts`), env parity check not automated, main not branch-protected so "deploy only from CI-green commits" is convention, not enforced. PR #112 (security review fixes P1-1..P2-11 from tonight's review) is **open**. |
| Auth + RLS live; RLS matrix passes | PARTIAL | `persistence: {configured: true, browserAuth: true}` on prod; unauthenticated `/api/v1/workspaces` → 401 (smoke). `supabase/tests/rls_matrix.sql` ALL PASS and `scripts/persistence-e2e.mjs` ALL PASS against prod at `67317fe` (recorded tonight, docs/CURRENT_STATE.md). | Migration `20261105000000_audit_log_resolved_cases.sql` and the #112 review-hardening migration are **not applied** to live: `audit_events` and `case_resolutions` do not exist in production. Owner: `supabase db push --linked`, then rerun `node scripts/rls-check.mjs`. RLS CI job always skips: add `SUPABASE_ACCESS_TOKEN` secret + `SUPABASE_PROJECT_REF` variable. |
| Consent + privacy notice shipped; no image reaches a model without recorded consent | PARTIAL | `/privacy` 200 (#100); consent checkbox on every model-calling UI (#99, #110); server checks in `src/app/api/extract/route.ts:29`, `explain/route.ts:39`, `review/route.ts:48`; saved images record `ai_processing_consent` (`src/lib/persist/artifacts.ts:13,22`). | Not enforced server-side until `REQUIRE_AI_CONSENT=1` (above). Anonymous extracts are gated but consent is not *recorded* anywhere unless the image is saved; decide whether a log line/`model_traces` flag is enough. Privacy notice is a counsel-pending draft (acceptable for an invite-only alpha if disclosed). |
| Benchmark: in-model top-1 ≥ 95 % with 5 % tolerance | MET | Held-out 98.00 % (n=900, + 5 % parts), 98.78 % (n=900, nominal parts). | Synthetic fixtures only (3 circuits). |
| Benchmark: confident-wrong < 2 % in-model, < 5 % out-of-model | NOT MET | In-model 0.11 % (n=900) passes. Out-of-model **6.19 %** held-out (n=4200) in the default voltage-only mode; **3.93 %** with opt-in ohmmeter readings. bench/README.md documents a ≈ 4.6 % floor of faults that no voltage probe can distinguish. | Product decision: make ohmmeter mode the default for alpha (passes, costs ≈ 2.6 more power-off readings), or report electrically equivalent alternatives instead of one label, or formally relax the gate. |
| Benchmark: solver error < 1e-6 for 1 mΩ–1 GΩ, warning on every ill-conditioned case; grounding false-accepts 0 | PARTIAL | Warning half MET: 312/2000 random 1 mΩ–1 TΩ nets exceed 1e-6 KCL violation, 0 silent; 1e-12 Ω case flagged. All-1 GΩ divider exact to 1e-9 (`solver-conditioning.test.ts:39`). Grounding 0/22 false-accepts. | The harness measures KCL residual over 1 mΩ–1 TΩ, not *relative error vs an exact rational solver over 1 mΩ–1 GΩ* as the gate states. The original audit measured 4e-7 for voltages, but that is not a repeatable test. Add an exact-rational comparison to `bench/solver-stress.ts` (engineering, ~1 h). |
| Production SHA verified by post-deploy smoke | MET | `postdeploy` workflow success on `c788689` and `67317fe`; my run 7/7 PASS (above). | — |
| Rollback rehearsed once | NOT MET | Procedure exists (`docs/OPERATIONS.md:24-25`, Vercel Promote previous deployment); never rehearsed. | Owner: promote the previous green deployment, confirm `/api/health` build flips, run smoke, promote back. ~10 min. DB migrations are forward-only; note that a rollback after `db push` keeps the new schema. |

## Paid beta

| Gate | Status | Evidence | What's left / owner action |
|---|---|---|---|
| ≥ 100 real resolved cases (≥ 10 designs); metrics on real cases with n | NOT MET | 0 real cases; `bench/cases/` absent. Labelling pipeline: `case_resolutions` table (`supabase/migrations/20261105000000_audit_log_resolved_cases.sql:33`) + resolve-case UI (#110). | Apply the migration; recruit alpha engineers; run `scripts/export-real-cases.mjs` (#98) once cases exist. |
| Paid, no-training AI tiers (or AI disabled per workspace) | NOT MET | All three providers on free tiers (`/api/health`: `gemini-3.5-flash-lite`, `qwen/qwen3.8-27b` Preview, `jev-1.13-free`); free-tier terms carry no no-training guarantee. No per-workspace AI-disable switch in code. | Owner: move Gemini and Groq to paid tiers with no-training terms (Jev paid ids are refused in code today), or ship a per-workspace "AI off" flag. Collect pricing first (cost per analysis is still unknown, PRODUCTION_PHASE1 section E). |
| DPA / subprocessor list | PARTIAL | `/subprocessors` page live (#100). No DPA document in repo. | Counsel: DPA template; signed DPAs with Vercel, Supabase and AI vendors. |
| Retention and deletion (workspace delete removes storage objects) | PARTIAL | Workspace delete removes Storage objects first (`src/lib/persist/lifecycle.ts:49`, `artifacts.ts:58-75`); account deletion #94 verified in persistence-e2e. Retention function `purge_expired()` written. | `purge_expired()` lives in the unapplied migration and is **not scheduled** (`docs/OPERATIONS.md:41`). Owner: `db push`, enable `pg_cron`, schedule it. Retention periods need counsel sign-off. |
| Per-user quotas backed by shared storage | MET | #109: per-user daily quotas via Postgres `rate_hit` (extract 50, explain 200, review 100 per 24 h; `sharedLimit.ts:24-45`); shared per-IP limits #87. | Fails open on DB error by design; acceptable. |
| Error budget defined (e.g. 99.5 %) | NOT MET | No SLO or error budget in docs (`grep -i "error budget\|99.5" docs/OPERATIONS.md` empty). No uptime monitor or log drain. | Write the SLO; add an external uptime check on `/api/health` and a Vercel log drain. |
| On-call runbook | PARTIAL | `docs/OPERATIONS.md` has env table, rollback, backups, incident table (line 56). | No on-call rota, paging, or contact path. Owner decision. |
| Exportable case reproduces the same verdict on re-run | MET | Report reproducibility check #91 (`src/lib/persist/report.ts:23-33`: `reproduced` when top hypothesis matches and max probability delta < 1e-6); live delta 2e-16 recorded 2026-10-14; export is part of persistence-e2e ALL PASS. | — |
| Vercel plan allows commercial use (PRODUCTION_PHASE1 owner decision, not a section F line) | UNVERIFIED | Hobby forbids commercial use (PRODUCTION_PHASE1 owner decisions). Plan not visible to this audit. | Owner: upgrade the Vercel project to Pro before taking money. |

## General availability

| Gate | Status | Evidence | What's left / owner action |
|---|---|---|---|
| Calibration holds on held-out real cases (ECE < 0.05) | NOT MET | No ECE in the harness; 0 real cases. | Add ECE/Brier/reliability bins to `bench/run.test.ts`; needs the real-case corpus first. |
| Documented supported-circuit envelope with refusal outside it | PARTIAL | Validator accepts only `resistor` and `dc_voltage`, ≤ 60 components, and refuses everything else (`validate.ts:9,19,53`); singular circuits throw `SolveError`; out-of-model faults get an `unmodeled` hypothesis / `fit: poor`. Limitations paragraph in PRODUCTION_PHASE1. | No single user-facing "supported circuits" page; out-of-model refusal is probabilistic (6.19 % confident-wrong). |
| External security review / pen test; SOC 2 readiness if selling to companies | NOT MET | Internal agent reviews only (PRODUCTION_PHASE1 audit, PR #112). `.github/SECURITY.md` + private vulnerability reporting enabled. | Owner: commission an external pen test; SOC 2 plan only if selling to companies. Cheap wins now: enable Dependabot alerts + security updates, protect main. |
| Backups with tested point-in-time restore; multi-region or RTO/RPO | NOT MET | `docs/OPERATIONS.md:37`: "Not yet restore-tested". Supabase plan / PITR unverified. No RTO/RPO stated. | Owner: Supabase Pro + PITR add-on, one restore drill into a scratch project, write RTO/RPO. |
| Billing | NOT MET | No billing code in `src/`. | Build (Stripe) after pricing is set. |
| Account management | PARTIAL | `/account` page (#100): sign-in, workspaces, delete account; invitations by email #109. | Custom SMTP not configured, so invite and magic-link email runs on Supabase's rate-limited default sender; Supabase Auth redirect allow-list for the prod origin unverified. |
| Audit log | PARTIAL | `audit_events` table, owner-read only, server-write only (#98, migration `20261105000000`). | **Not applied** to live; no UI to view it. |
| Data export self-service | MET | Workspace export API #86 (persistence-e2e ALL PASS) and the "Export (JSON)" button on each workspace card in /account (`src/app/account/account-client.tsx`, #100). | — |
| Deletion self-service | MET | Account deletion `POST /api/v1/account/delete` #94 (LAST_OWNER 409 guard), workspace owner delete with typed confirmation #86, both in persistence-e2e ALL PASS at `67317fe`; delete-account UI in `src/app/account/account-client.tsx:118`. | — |

## Owner action list for commercialization (priority order)

1. **Apply pending migrations**: `supabase db push --linked` (`20261105000000` audit log / case labels / purge, plus #112's hardening once merged), then `node scripts/rls-check.mjs` and `node scripts/persistence-e2e.mjs` against prod. Unblocks audit log, case labels and retention.
2. **Enforce AI consent**: set `REQUIRE_AI_CONSENT=1` in Vercel production and redeploy (all UI callers already send `aiConsent` since #110). Closes the last P0 enforcement gap.
3. **Rehearse rollback once** (Vercel Promote previous deployment → smoke → promote back) and record the result in docs/CURRENT_STATE.md. Last private-alpha ops gate.
4. **Decide the out-of-model gate**: default the Probe Guide to ohmmeter mode (3.93 % held-out, passes) or report equivalent alternatives; otherwise private alpha stays NOT MET on 6.19 %.
5. **Harden GitHub**: protect main (require ci + rls checks), enable Dependabot alerts and security updates, add `SUPABASE_ACCESS_TOKEN` / `SUPABASE_PROJECT_REF` so the RLS matrix runs in CI. Merge or close PR #112.
6. **Email and auth**: configure custom SMTP in Supabase Auth; verify the redirect allow-list includes `https://multimodal-hackathon-sage.vercel.app` (and the final domain).
7. **Plans before money**: Vercel Pro (Hobby forbids commercial use); Supabase Pro + PITR, then one restore drill and written RTO/RPO.
8. **AI vendor terms**: move Gemini and Groq to paid no-training tiers (or build a per-workspace AI-off switch); collect prices so cost per analysis stops being unknown.
9. **Legal**: counsel review of privacy/terms/subprocessors drafts, fill the terms placeholders (contact, governing law), DPA template, signed vendor DPAs.
10. **Then the paid-beta data work**: ≥ 100 real resolved cases across ≥ 10 designs, ECE in the harness, SLO + uptime monitor, external pen test before GA, billing.
