# SOC 2 readiness map

Scope: the Ohmni web app (Next.js on Vercel), its Supabase project `ohmni` (Postgres, Auth, Storage, us-west-2) and the AI providers it calls (Groq, Google Gemini, BeatAPI/Jev). Status labels: [README](README.md#status-legend). No SOC 2 audit has been performed or scheduled; this is a self-assessment to plan a Type I.

Organisation context that drives most gaps: a single owner operates the service, assisted by development agents. There is no staff, HR process, device fleet or formal policy set.

## Security — Common Criteria

| Ref | Criterion (short) | Ohmni control | Evidence | Status |
|---|---|---|---|---|
| CC1.1–1.2 | Integrity, ethics, board oversight | None formal; single owner | — | gap |
| CC1.3 | Structure, authority, responsibility | Roles described for agents/orchestrator only | `CLAUDE.md`, `docs/CLAUDE_ORCHESTRATOR.md`, `docs/PR_WORKFLOW.md` | partial |
| CC1.4–1.5 | Competence, accountability, HR (hiring, background checks, training) | None | — | gap |
| CC2.1 | Information for internal control | Runbook, security, privacy and state docs kept in repo | `docs/OPERATIONS.md`, `docs/SECURITY.md`, `docs/CURRENT_STATE.md` | partial |
| CC2.2 | Internal communication of responsibilities | PR template, PR workflow | `.github/pull_request_template.md`, `docs/PR_WORKFLOW.md` | partial |
| CC2.3 | External communication | Privacy, terms, subprocessors, security pages (drafts pending counsel); vulnerability reporting route; `security.txt` | `src/app/privacy`, `src/app/terms`, `src/app/subprocessors`, `src/app/security`, `public/.well-known/security.txt`, `.github/SECURITY.md` | partial |
| CC3.1–3.4 | Risk assessment, fraud risk, change in risk | Ranked production audit with confirmed/suspected findings | `docs/PRODUCTION_PHASE1.md` §A; this pack | partial (no recurring cadence) |
| CC4.1–4.2 | Monitoring of controls, deficiency remediation | Post-deploy smoke on every push to `main`; CI on every push/PR; findings tracked as PRs | `.github/workflows/postdeploy.yml`, `.github/workflows/ci.yml` | partial (no periodic control review) |
| CC5.1–5.3 | Control activities, technology controls, policies | Controls exist in code; no written policy set (access, change, acceptable use) | — | partial |
| CC6.1 | Logical access: tenant isolation | Supabase Auth; RLS on every table via `is_member` / `can_edit`; composite FKs pin rows to their workspace; server-only tables have no client insert policy | `supabase/migrations/20261012000000_core_investigation_model.sql`, `20261014000000_private_rls_helpers.sql`, `supabase/tests/rls_matrix.sql` (owner/editor/viewer/outsider/anon × all tables) | implemented |
| CC6.1 | Logical access: secrets | Provider and service-role keys server-only; only `NEXT_PUBLIC_SUPABASE_URL` / publishable anon key are public | `docs/PRODUCTION_PHASE1.md` "Checked clean"; `docs/OPERATIONS.md` env table | implemented |
| CC6.1 | Encryption at rest | Provided by Supabase/Vercel platforms; not configured or evidenced in repo | — | unverified |
| CC6.2–6.3 | User provisioning, roles, de-provisioning (customers) | Owner/editor/viewer roles; owner-managed members; last-owner protection; account deletion | `src/lib/persist/members.ts`, `src/lib/persist/lifecycle.ts`, `supabase/migrations/20261015000000_account_deletion.sql`, `scripts/persistence-e2e.mjs` | implemented |
| CC6.2–6.3 | Workforce access to Vercel, Supabase, GitHub, provider consoles | No inventory, no MFA evidence, no periodic access review | — | gap |
| CC6.4 | Physical access | Inherited from Vercel / Supabase (AWS) | Vendor reports not collected | unverified |
| CC6.5 | Disposal of data | Workspace delete removes Storage objects then cascades; account delete; retention purge function | `src/lib/persist/lifecycle.ts`, `20261014010000_cascade_intra_workspace_fks.sql`, `20261105000000_audit_log_resolved_cases.sql` (`purge_expired`) | partial (purge **not scheduled**; backups not purged) |
| CC6.6 | Boundary protection, transport | HSTS, enforced CSP, `frame-ancestors 'none'`, nosniff; trusted client-IP header only | `next.config.ts`, `docs/SECURITY.md`, `scripts/csp-smoke.mjs`, postdeploy header check | implemented |
| CC6.6 | Abuse / DoS | Per-IP limits, global model budget, shared Postgres counters (fail-open), per-user daily quotas, invite cap, workload ceilings | `src/lib/server/rateLimit.ts`, `src/lib/server/sharedLimit.ts`, `src/lib/server/readBody.ts`, `tests/server/ceilings.test.ts`, `tests/server/rateLimit.test.ts`, `tests/server/invites-quota.test.ts` | implemented (per-instance for non-model routes) |
| CC6.7 | Restrict data transmission to third parties | AI consent gate (`REQUIRE_AI_CONSENT`), consent checkbox in UI, subprocessor disclosure | `src/lib/server/consent.ts`, `src/components/ohmni/ai-consent.tsx`, `tests/server/consent.test.ts`, `docs/PRIVACY.md` | partial (gate is env-switched; production value unverified; free-tier providers may train) |
| CC6.8 | Malicious / unauthorised software | `npm audit` high/critical blocks CI; Dependabot weekly; SHA-pinned actions; least-privilege `permissions:`; pinned WASM | `.github/workflows/ci.yml`, `.github/dependabot.yml` | implemented |
| CC7.1 | Vulnerability detection | Dependency audit; Supabase advisors run manually after migrations; private vulnerability reporting | `docs/OPERATIONS.md` "Database changes", `.github/SECURITY.md` | partial (no SAST, no pentest, advisors not automated) |
| CC7.2 | Monitoring for anomalies | One JSON log line per request with request id (no bodies/IPs/keys); postdeploy smoke | `src/lib/server/observe.ts`, `tests/server/observe.test.ts` | partial (no alerting, no log drain, no uptime monitor) |
| CC7.3–7.5 | Incident evaluation, response, recovery | Incident table in runbook; this pack's IR plan | `docs/OPERATIONS.md` "Incidents", [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md) | partial (never exercised) |
| CC8.1 | Change management | All changes by PR to `main`; CI (audit, lint, typecheck, test, build); RLS check on schema PRs; forward-only migrations; postdeploy verifies deployed SHA | `.github/workflows/*`, `scripts/rls-check.mjs`, `docs/OPERATIONS.md` | partial: **`main` has no branch protection** (GitHub API 404, no rulesets, checked 2026-11-05); RLS CI skips until `SUPABASE_ACCESS_TOKEN` is set; migrations applied manually |
| CC9.1 | Business continuity, risk mitigation | Vercel instant rollback documented; Supabase plan backups | `docs/OPERATIONS.md` "Rollback", [BACKUP_AND_DR.md](BACKUP_AND_DR.md) | partial (rollback and restore never rehearsed) |
| CC9.2 | Vendor and business-partner risk | Subprocessor list; this pack's vendor register | `src/app/subprocessors`, [VENDOR_RISK.md](VENDOR_RISK.md) | partial (no DPAs signed, no vendor SOC reports collected) |

## Other categories (brief)

| Category | Ohmni position | Status |
|---|---|---|
| Availability (A1) | Single region (Vercel default + Supabase us-west-2); free-tier AI with quota exhaustion observed 2026-10-11; SLOs proposed in [SLO.md](SLO.md); no uptime monitor; backups plan-dependent | partial |
| Confidentiality (C1) | Workspace isolation by RLS; private Storage bucket with 60 s signed URLs after membership check; logs exclude bodies; but AI providers on free tiers may retain/train | partial |
| Processing integrity (PI1) | Server-authoritative verification; deterministic solver with residual checks; append-only evidence; report reproducibility check (#91) | implemented for core engine (not in requested scope; listed for completeness) |
| Privacy (P1–P8) | Notice (`/privacy`), consent gate, export (`/workspaces/:id/export`), deletion (workspace, account), retention periods defined, audit log of access-relevant actions; no DSAR procedure, no records of processing, policies pending counsel | partial |

## Gaps, ranked (fix order for a Type I)

1. **No branch protection on `main`** — anyone with write access can push unreviewed, un-CI'd code to production. Enable a ruleset: PR required, `ci` check required, no force push.
2. **AI providers on free tiers with unverified training/retention terms** — the largest confidentiality risk for paying customers. Paid no-training tiers or per-workspace AI disable before beta ([VENDOR_RISK.md](VENDOR_RISK.md)).
3. **No vendor DPAs or SOC reports collected** (Vercel, Supabase, Google, Groq, BeatAPI, GitHub).
4. **No alerting or uptime monitoring** — incidents are discovered by users or by a red `postdeploy` run.
5. **Backups/restore and rollback never tested**; PITR status unverified ([BACKUP_AND_DR.md](BACKUP_AND_DR.md)).
6. **Retention purge not scheduled** (`purge_expired()` exists, `pg_cron` not enabled).
7. **Workforce access controls absent**: no account inventory, MFA evidence or quarterly access review for GitHub, Vercel, Supabase, Google AI Studio, Groq, BeatAPI.
8. **RLS CI skipped** until `SUPABASE_ACCESS_TOKEN` / `SUPABASE_PROJECT_REF` are configured; migrations applied by hand.
9. **No penetration test or external security review** (GA gate in `docs/PRODUCTION_PHASE1.md` §F).
10. **No written policies** (information security, access control, change management, incident response approval, vendor management, data classification), no HR controls (background checks, security training, onboarding/offboarding), no MDM/endpoint controls on the owner's machine.
11. **Audit log is best-effort** (failed writes are logged and swallowed, `src/lib/persist/audit.ts`) and covers `/api/v1/*` mutations only, not operator/dashboard actions.
12. **Custom SMTP not configured** — invitation/magic-link email on Supabase's built-in mailer (`docs/PERSISTENCE.md` "Known gaps").

## Suggested next evidence to collect (owner)

Screenshots/exports dated and stored outside the repo: Vercel and Supabase plan pages, MFA status for each admin account, Supabase backup settings, `REQUIRE_AI_CONSENT` / `OHMNI_DISABLED_TIERS` production values, vendor SOC 2 reports and DPAs.
