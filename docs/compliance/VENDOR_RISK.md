# Vendor (subprocessor) risk register

User-facing list: `/subprocessors` (`src/app/subprocessors/page.tsx`). Data flows: [../PRIVACY.md](../PRIVACY.md). Plan tiers below are what the repo documents; account-level settings are **unverified** until the owner checks each console. No vendor DPA has been signed and no vendor SOC report has been collected.

| Vendor | Role | Data shared | Region | Plan tier | Training / retention terms | DPA | Risk | Mitigation |
|---|---|---|---|---|---|---|---|---|
| **Vercel** | Hosting, serverless functions, logs | All requests in transit (uploads in memory), request logs incl. IP | Function region not pinned in repo (no `vercel.json`); **unverified** | Hobby/Pro **unverified**; Hobby forbids commercial use, Pro required before paid beta (`docs/PRODUCTION_PHASE1.md`) | No training; log retention plan-dependent, **unverified** | Public DPA page: https://vercel.com/legal/dpa (acceptance **to verify**) | Medium | Upgrade to Pro; pin function region near us-west-2; collect SOC 2 report |
| **Supabase** | Postgres, Auth, Storage | All saved customer data, account emails, saved images, audit log, rate counters | us-west-2 (`docs/PERSISTENCE.md`) | Free → Pro planned; current plan **unverified** | No training; backup retention plan-dependent, **unverified** | Public DPA page: https://supabase.com/legal/dpa (signature **to verify**) | High (system of record) | RLS matrix; service key server-only; Pro + PITR before beta; restore drill ([BACKUP_AND_DR.md](BACKUP_AND_DR.md)); collect SOC 2 report |
| **Google (Gemini API)** | Vision fallback reader, explanations, review mentor | Uploaded schematic image (when used as reader); confirmed circuit graph + solver results; graph + finding for mentor | **Unverified** | Free tier (`docs/UNIT_ECONOMICS.md`) | Free-tier ("unpaid services") terms permit Google to use content to improve products, with human review possible: see https://ai.google.dev/gemini-api/terms — applicability to this key **to verify** | To verify (paid tier only) | **High** | Consent gate `REQUIRE_AI_CONSENT=1` + UI checkbox; "do not upload confidential designs" notice; paid tier before beta; per-workspace AI disable (parallel PR) |
| **Groq** | Primary vision reader, `verify_topology` second reader | Uploaded schematic image | **Unverified** | Free plan (30 RPM / 1K RPD, `docs/UNIT_ECONOMICS.md`) | **To verify** | To verify | **High** | Same as Gemini |
| **BeatAPI (Jev `jev-1.13-free`)** | Routing the next step after extraction | Text summary of the extracted circuit (ids, kinds, values, node names, warnings); not the image | **Unverified** | Free model; paid model refused in code | **To verify** (pricing page only reviewed: https://beatapi.io/jev-api) | To verify | Medium (no image, but design data; smallest/least-known vendor) | Consent gate covers `/api/extract`; Jev is optional (paced, may be skipped): can be disabled by unsetting `BEATAPI_API_KEY` |
| **GitHub** | Source, CI, vulnerability reports | Source code, CI logs (synthetic data only) | US | **Unverified** | n/a for customer data | n/a (no customer data) | Low | Branch protection (missing), MFA on owner account (unverified) |
| **Browser speech services** (demo Voice Lab only) | Browser vendor speech recognition | Microphone audio, by the user's browser, not Ohmni | Browser vendor | n/a | Browser vendor's terms | n/a | Low (demo tier, not paid product) | Disable with `OHMNI_DISABLED_TIERS=demo` |

## Risk rating method

High = vendor holds or may retain customer design data or personal data and terms are unverified or permit training. Medium = sees data in transit or metadata only, or holds data under known terms but without a signed DPA. Low = no customer data.

## Before paid beta (from `docs/PRODUCTION_PHASE1.md` §F)

| Item | Status |
|---|---|
| Paid, no-training AI tiers **or** AI disabled per workspace | gap (per-workspace disable in progress in a parallel PR) |
| Consent recorded before any image reaches a model | partial: gate exists; production `REQUIRE_AI_CONSENT` value **unverified** |
| DPAs accepted/signed with Vercel, Supabase, AI providers | gap |
| Vendor SOC 2 / ISO reports collected and reviewed | gap |
| Vercel Pro (commercial use) | unverified |
| Region documented per vendor; transfer mechanism for non-US customers (e.g. SCCs) | gap; counsel |
| Annual vendor review (proposal) | gap |
