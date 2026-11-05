# Incident response plan

Status: **proposal** (adopted when the owner signs off; never exercised yet). Complements the symptom table in [../OPERATIONS.md](../OPERATIONS.md#incidents).

## Severity levels

| Sev | Definition | Examples | Response target (proposal) |
|---|---|---|---|
| SEV1 | Confirmed or likely exposure of customer data, credential compromise, or full outage of core routes | Cross-tenant read; leaked `SUPABASE_SERVICE_ROLE_KEY`; production down | Start within 1 h of detection; contain same day |
| SEV2 | Core route degraded or a security control disabled, no known data exposure | `/api/solve` or `/api/probe` errors > 5 %; CSP header missing (postdeploy red); RLS check failing on a pending migration | Start within 4 h; fix or roll back within 1 business day |
| SEV3 | Non-core degradation or provider outage with working fallback | Gemini 429 with Groq fallback; experimental route broken; Jev skipped | Next business day |
| SEV4 | Cosmetic or single-user issue, no security impact | Copy error, one report export failing | Backlog |

When unsure, pick the higher severity; downgrade later in the timeline.

## Roles

| Role | Who (today) | Duties |
|---|---|---|
| Incident commander (IC) | Owner | Declares severity, decides containment and customer/authority notification, owns the timeline |
| Operator | Owner (agents may assist under IC instruction) | Runs playbooks, collects evidence |
| Counsel | External, to be engaged | Decides legal notification duties and wording |
| Communications | Owner | Customer and status updates |

Development agents never decide notification, never rotate production keys or change production env without the owner's explicit instruction.

## Detection sources

| Source | What it catches | Where |
|---|---|---|
| `postdeploy` workflow (every push to `main`) | Wrong/stale deploy, solver broken, bad-JSON handling, missing tier/security headers incl. enforcing CSP | `.github/workflows/postdeploy.yml`, `scripts/postdeploy-smoke.mjs` |
| `/api/health` | Build SHA, provider and persistence configuration | `curl <prod>/api/health` |
| Vercel runtime logs | One JSON line per API request: `requestId, route, method, status, ms, code, error` (no bodies, IPs, keys) | `src/lib/server/observe.ts`; a user-quoted `error.requestId` maps to one line |
| Audit log | Who did what in a workspace via `/api/v1/*` (ids only) | `public.audit_events`, `GET /api/v1/workspaces/:id/audit`; service role for deleted-workspace rows |
| Supabase advisors and logs | Security/performance findings, auth and Postgres errors | `supabase db advisors --linked`; Supabase dashboard |
| RLS matrix | Tenant-isolation regressions | `supabase db query --linked -f supabase/tests/rls_matrix.sql`, `scripts/rls-check.mjs` |
| Vulnerability reports | External researchers | GitHub private advisories (`.github/SECURITY.md`), `public/.well-known/security.txt` |
| Provider dashboards | Quota exhaustion, key abuse | Google AI Studio, Groq console, BeatAPI |
| **Missing** | Alerting, uptime monitor, log drain/retention, error-rate dashboards | See [SLO.md](SLO.md) |

## Containment playbooks

Vercel env changes take effect on the **next deployment**: after changing a variable, redeploy (Deployments → latest → Redeploy) and confirm with `/api/health`.

| Situation | Action | Verify |
|---|---|---|
| Bad deploy | Vercel → Deployments → previous green production deployment → **Promote** (instant rollback). Then revert the commit by PR. | `/api/health` `build` = old SHA; re-run `postdeploy` against it |
| Service-role key leaked or suspected | Supabase dashboard → Project Settings → API keys: rotate/regenerate the secret (service-role) key; update `SUPABASE_SERVICE_ROLE_KEY` in Vercel; redeploy. Review Postgres/Auth logs for use of the old key. | `scripts/persistence-e2e.mjs <prod>` passes; old key rejected |
| Provider key leaked or abused (Groq, Gemini, BeatAPI) | Revoke/regenerate in the provider console; update `GROQ_API_KEY` / `GEMINI_API_KEY` / `BEATAPI_API_KEY`; redeploy. Unsetting a key disables that provider (fallbacks apply). | `/api/health` provider `configured` as intended |
| Experimental feature leaking data or abused | Set `OHMNI_DISABLED_TIERS=experimental` (or `experimental,demo`); redeploy. This 404s all experimental routes **including `/api/v1/*` saved investigations**, except `/api/v1/account` (account deletion stays available). Core analysis routes, including `/api/extract`, stay up. | Experimental route returns 404 `FEATURE_DISABLED` |
| Persistence must stop entirely (suspected DB exposure) | Unset `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; redeploy. `/api/v1/*` → 503 `PERSISTENCE_DISABLED`; shared rate limits fall back to in-memory; core analysis unaffected. | `/api/health` `persistence.configured: false` |
| Cross-tenant access suspected | Disable persistence or experimental tier (above); run RLS matrix against live schema; identify affected workspaces from audit log and request ids | `RLS MATRIX: ALL PASS` after fix |
| Uploaded content sent to AI without consent | Set `REQUIRE_AI_CONSENT=1` (if not already), redeploy; unset provider keys to stop all AI calls | `/api/extract` without `aiConsent` → 422 `CONSENT_REQUIRED` |
| Abuse / traffic flood | Lower `RATE_*`; Vercel firewall rule; `OHMNI_DISABLED_TIERS` | 429 rate in logs |
| Compromised owner account (GitHub/Vercel/Supabase) | Reset password, revoke sessions and tokens (incl. `SUPABASE_ACCESS_TOKEN`, Vercel tokens, GitHub PATs), enable MFA, review audit/activity logs of each platform | Platform activity logs clean |

Preserve evidence before destroying it: export relevant Vercel log lines, audit events and Supabase logs to a dated folder outside the repo.

## Breach notification

Counsel decides whether, whom and how to notify. Clocks start when Ohmni becomes **aware** of a personal-data breach.

| Regime | Duty (summary, to confirm with counsel) | Clock |
|---|---|---|
| GDPR / UK GDPR, Ohmni as **controller** | Notify supervisory authority unless unlikely to result in risk; notify individuals if high risk | 72 h to authority |
| GDPR, Ohmni as **processor** (customer DPA) | Notify the customer (controller) | Without undue delay; DPA may set a fixed time ([DPA_TEMPLATE.md](DPA_TEMPLATE.md)) |
| US state breach laws | Vary by state in scope (which data elements count, deadlines, AG notice) | Counsel decides per state |
| Contracts | Customer agreements may impose shorter windows | Per contract |

Ohmni's stored personal data today: account emails (Supabase Auth), user ids in rows and audit events, salted-hash IPs in rate counters, plus anything users type into names, titles or measurement provenance (e.g. voice transcripts). See [DATA_RETENTION.md](DATA_RETENTION.md).

## Post-incident review template

Due within 5 business days of resolution for SEV1/SEV2 (proposal). Blameless; store in `docs/incidents/YYYY-MM-DD-<slug>.md` or outside the repo if it contains customer data.

```
# Incident YYYY-MM-DD <title>
Severity: SEV_   IC: ___   Status: resolved
## Summary (3 lines)
## Impact: users/workspaces affected, data involved, duration, SLO budget consumed
## Timeline (UTC): detected / declared / contained / resolved, with request ids and SHAs
## Detection: how we found out; how we should have found out
## Root cause
## What went well / what went badly
## Notifications: who, when, decided by (counsel ref)
## Action items: | action | owner | due | PR/issue |
```
