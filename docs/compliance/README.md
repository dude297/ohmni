# Ohmni — Compliance pack

Readiness documents for scaling and selling Ohmni. Written 2026-11-05 against `main` `9300c3a`. Everything here is grounded in files in this repo; where a fact depends on a vendor account, a dashboard or a contract that the repo cannot show, it says **unverified**. Nothing in this pack is a certification, an audit opinion or legal advice.

| Doc | Purpose |
|---|---|
| [SOC2_READINESS.md](SOC2_READINESS.md) | Trust Services Criteria mapped to actual controls, evidence pointers and a ranked gap list |
| [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md) | Severity levels, roles, detection, containment playbooks, notification clocks, post-incident template |
| [BACKUP_AND_DR.md](BACKUP_AND_DR.md) | What is backed up, proposed RTO/RPO, restore drill, migration and rollback policy |
| [SLO.md](SLO.md) | Proposed SLOs, error budget policy, how to measure today and what is missing |
| [DATA_RETENTION.md](DATA_RETENTION.md) | Every data category: where, how long, how it is deleted |
| [VENDOR_RISK.md](VENDOR_RISK.md) | Subprocessor register with risk ratings and mitigations |
| [DPA_TEMPLATE.md](DPA_TEMPLATE.md) | Customer Data Processing Addendum skeleton (DRAFT, for counsel) |

Related source docs: [../SECURITY.md](../SECURITY.md), [../PRIVACY.md](../PRIVACY.md), [../OPERATIONS.md](../OPERATIONS.md), [../PERSISTENCE.md](../PERSISTENCE.md), [../PRODUCTION_PHASE1.md](../PRODUCTION_PHASE1.md) (sections E, F), [../../.github/SECURITY.md](../../.github/SECURITY.md).

## Status legend

| Label | Meaning |
|---|---|
| **implemented** | Control exists and the repo shows evidence (code, migration, test, workflow or a dated run recorded in docs) |
| **partial** | Exists but incomplete, not enforced, not scheduled, or only documented |
| **gap** | Not present |
| **proposal** | A target or procedure this pack proposes; not yet adopted or measured |
| **unverified** | Depends on a vendor plan, dashboard setting or contract the repo cannot show; must be checked by the owner |

## Maintenance

Update the affected doc in the same PR that changes a control (new table, new provider, new env switch, new retention period). [../PRIVACY.md](../PRIVACY.md) and the user-facing `/privacy` and `/subprocessors` pages stay the source of truth for what users are told; this pack must not contradict them.
