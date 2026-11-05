# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub: <https://github.com/dude297/ohmni/security/advisories/new>.
Do not open a public issue, pull request or discussion for a suspected vulnerability.

Include the affected route or file, reproduction steps, and the impact you observed. We aim to acknowledge reports
within 3 business days. Only the latest `main` deployment is supported; there are no maintained release branches.

## Summary of current controls

Full detail lives in [docs/SECURITY.md](../docs/SECURITY.md); production hardening status is in
[docs/PRODUCTION_PHASE1.md](../docs/PRODUCTION_PHASE1.md).

- **Input ceilings:** graphs capped at 60 components, JSON bodies at 256 KB (streamed), image uploads at 6 MB with
  magic-byte sniffing; AC analysis queue and timeouts bound server work.
- **Rate limiting:** per-IP limits keyed only on the edge-overwritten client-IP header; model-calling routes also share
  a per-route global budget, enforced across instances through a Postgres counter when Supabase is configured.
- **Headers:** enforced Content-Security-Policy (no `unsafe-eval`, `frame-ancestors 'none'`), HSTS, `nosniff`,
  `X-Frame-Options: DENY`, restrictive `Permissions-Policy`.
- **Secrets:** provider keys are server-only; the only public env values are the Supabase URL and publishable anon key,
  which grant nothing beyond row-level security.
- **Supply chain:** CI runs with read-only `GITHUB_TOKEN`, third-party actions are pinned to commit SHAs, Dependabot
  tracks npm and GitHub Actions weekly, and CI fails on high/critical `npm audit` findings in production dependencies.
- **Post-deploy checks:** every push to `main` is smoke-tested against production (health, solver, security headers).
