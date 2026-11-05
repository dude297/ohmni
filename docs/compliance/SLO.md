# Service level objectives

Status: **proposal**. No SLO is measured today; nothing here is a customer-facing SLA. Paid-beta gate: "error budget defined (e.g. 99.5 % monthly availability for core routes)" (`docs/PRODUCTION_PHASE1.md` §F).

## Proposed SLOs (rolling 30 days)

| Service | SLI | Objective | Notes |
|---|---|---|---|
| Core availability | Share of requests to core routes (`/lab`, `/probe`, `/build`, `/api/solve`, `/api/probe`, `/api/repair`, `/api/repair/verify`, `/api/health`) answered with status < 500 | **99.5 %** (≈ 3 h 36 min budget / 30 d) | 4xx (validation, 429) count as good |
| `/api/solve` latency | p95 server time (`ms` in the request log) | **≤ 300 ms** | Local MNA solver, 60-component cap |
| `/api/probe` latency | p95 server time | **≤ 500 ms** | Ceiling test asserts < 250 ms at the cap on a dev machine (`tests/server/ceilings.test.ts`); target leaves room for cold starts |
| Saved investigations `/api/v1/*` | Status < 500 | **99.0 %** | Depends on Supabase single region |
| Model routes `/api/extract`, `/api/explain`, `/api/review` (mentor) | — | **Best effort, no SLO** | Free tiers: Gemini quota exhausted 2026-10-11, Jev 1 call/min (`docs/UNIT_ECONOMICS.md`). Revisit when paid tiers are adopted |
| Experimental and demo routes | — | No SLO | Badged `x-ohmni-tier` |

## Error budget policy (proposal)

| Budget consumed in window | Action |
|---|---|
| < 50 % | Normal shipping |
| 50–100 % | Reliability work takes priority in the next PRs; no risky migrations |
| > 100 % | Feature freeze on core paths until back within budget; post-incident review for the largest contributor ([INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md)) |

Planned maintenance counts against the budget unless announced 48 h ahead (proposal).

## How to measure with current tooling

| Need | Today | How |
|---|---|---|
| Request outcomes and latency | Vercel runtime logs: one JSON line per API request (`route, status, ms, code`) from `src/lib/server/observe.ts` | Export/query logs per route; compute 5xx ratio and p95 `ms`. Retention of Vercel logs is plan-dependent and **unverified**, so measure within that window |
| Deploy correctness | `postdeploy` per push to `main` | GitHub Actions history = deploy-health record |
| Synthetic check | `scripts/postdeploy-smoke.mjs` (solver, bad JSON, headers; no model calls) | Can be run on a schedule against prod to approximate uptime |
| Model usage and provider status | `model_traces` (signed-in calls with `projectId`: status, ms, tokens) | `GET /api/v1/workspaces/:id/usage`; SQL by `status` |

## Missing (in priority order)

1. **Uptime monitor / scheduled synthetic** hitting `/api/health` and one `/api/solve` canary every few minutes with alerting (cheapest: a scheduled GitHub Actions run of the smoke script, or an external monitor).
2. **Log drain with retention ≥ 30 days** to compute monthly SLIs (Vercel drain to a log store, or a Supabase table).
3. **Alerting** on 5xx rate and p95 breaches.
4. **Page SLI (`/lab`, `/probe`, `/build`)**: page requests are not logged by `observe()`; only API routes are.
5. Public status page.
