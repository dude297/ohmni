# Data retention schedule

Source of truth for what users are told: [../PRIVACY.md](../PRIVACY.md) and `/privacy`. Schema: `supabase/migrations/`. "Workspace delete" = `POST /api/v1/workspaces/:id/delete` (owner, typed name; removes Storage objects then cascades, `src/lib/persist/lifecycle.ts`, `20261014010000_cascade_intra_workspace_fks.sql`). "Account delete" = `POST /api/v1/account/delete` (deletes solo workspaces, refuses while sole owner of a shared one, nulls authorship elsewhere, deletes the Auth user; `20261015000000_account_deletion.sql`).

## Schedule

| Data category | Where stored | Retention | Deletion mechanism |
|---|---|---|---|
| Uploaded image for analysis (`/api/extract`) | Server memory, request only; sent to Groq and/or Gemini | Not stored by Ohmni | n/a; provider retention **unverified** ([VENDOR_RISK.md](VENDOR_RISK.md)) |
| Circuit graph / solver results sent for explanation, mentor, Jev routing | Request memory; sent to Gemini or BeatAPI | Not stored by Ohmni | n/a; provider retention **unverified** |
| Account: email, auth identities, sessions | Supabase Auth (`auth.users`), us-west-2 | Life of account | Account delete (`auth.admin.deleteUser`) |
| Pending invitation accounts | Supabase Auth | Until accepted or deleted | Owner removes member; no automatic expiry of the account (**gap**) |
| Workspaces, members, projects | Postgres `workspaces`, `workspace_members`, `projects` | Life of workspace | Workspace delete; member removal |
| Confirmed designs | `design_revisions` | Life of workspace | Workspace delete (cascade) |
| Investigations, measurements (incl. client provenance such as voice transcripts) | `investigations`, `measurements` (append-only) | Life of workspace | Workspace delete; no per-row delete (corrections supersede) |
| Hypotheses, repair proposals, verifications | `hypotheses`, `repair_proposals`, `verifications` (server-written) | Life of workspace | Workspace delete |
| Resolved-case labels and benchmark consent | `case_resolutions` | Life of workspace | Workspace delete |
| Exported benchmark cases (consented, verified; no names/ids/images) | Operator's machine via `scripts/export-real-cases.mjs` | **Undefined** (proposal: until consent withdrawn or benchmark retired) | Manual; no withdrawal flow (**gap**) |
| Saved schematic images | Private Storage bucket `artifacts` + `artifacts` row | Life of workspace | Workspace delete removes objects first |
| `reports` table | Postgres | Unused (reports generated on demand) | Workspace delete |
| Model-call metadata (provider, model, status, ms, tokens, request id; no content) | `model_traces` | **90 days** | `public.purge_expired()` — **not scheduled yet**; until then kept until workspace delete |
| Audit events (ids, action, request id; no names/content) | `audit_events` | **400 days**; survives workspace/account delete with links nulled | `purge_expired()` — **not scheduled yet** |
| Shared rate-limit / per-user quota counters (salted IP hash or user id, count, window) | `private.rate_counters` | ≤ 1 day after window | Opportunistic delete inside the limiter function (`20261014030000_shared_rate_limit.sql`) |
| In-memory rate limits, Jev pacing timestamp | Server instance memory | Window / process lifetime | Automatic |
| Application request logs (request id, route, status, ms, code; no bodies/IPs/keys) | Vercel runtime logs | Vercel plan default, **unverified** | Platform expiry |
| Platform request logs (path, status, IP, timing) | Vercel | Plan default, **unverified** | Platform expiry |
| Browser evidence packet `ohmni.evidence.v1` | User's browser `sessionStorage` | Tab session | Closing the tab |
| Workspace export files | User's device | User-controlled | User |
| Database backups (contain all of the above Postgres data) | Supabase | Plan-dependent, **unverified** | Age-out only; deleted data persists in backups until expiry |
| GitHub, CI logs | GitHub | Default GitHub retention | Contain no customer data by design (smoke uses synthetic circuits) |

## Actions to make this schedule true

1. Schedule `purge_expired()` daily with `pg_cron` (`docs/OPERATIONS.md` "Retention job"); verify with `cron.job_run_details`.
2. Verify and record Supabase backup retention and Vercel log retention for the actual plans; update this table and `/privacy`.
3. Define retention and a withdrawal path for exported benchmark cases.
4. Decide expiry for unaccepted invitations.
5. Proposal: inactive-account policy (e.g. notify then delete after N months of inactivity) before GA — owner/counsel decision.
