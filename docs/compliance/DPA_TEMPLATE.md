# Data Processing Addendum — template

> **DRAFT — for counsel review; not legal advice.** This skeleton was written by an engineering agent from the repository's documented controls. It has not been reviewed by a lawyer, is not offered to any customer, and must not be signed in this form. Bracketed text is a placeholder.

**Parties.** This Data Processing Addendum ("DPA") forms part of the agreement between [Customer legal entity name], [Customer address] ("Customer") and [Ohmni legal entity name], [Ohmni registered address] ("Ohmni") for the Ohmni service (the "Agreement"). Effective date: [date].

## 1. Roles

| Data | Customer role | Ohmni role |
|---|---|---|
| Customer content in workspaces (designs, measurements, images, labels) and Customer users' account data | Controller | Processor |
| Account administration, security logs, audit events, billing [if applicable] | — | [Controller or processor — counsel to decide] |

## 2. Processing scope (Annex 1)

| Item | Description |
|---|---|
| Subject matter | Hosting and analysis of hardware-debugging investigations |
| Duration | Term of the Agreement plus the deletion period in §6 |
| Nature and purpose | Storage, circuit simulation and fault diagnosis, optional AI-assisted schematic reading and explanation, export |
| Data subjects | Customer's authorised users; [any persons named in content Customer uploads] |
| Personal data | Email address, user id, workspace roles, activity records (audit events: ids, actions, timestamps, request ids), salted-hash IP in rate counters, any personal data Customer places in names, titles, measurement provenance or images |
| Special categories | None intended; Customer shall not upload them |

## 3. Customer instructions

Ohmni processes personal data only on Customer's documented instructions, which are the Agreement, this DPA and Customer's use and configuration of the service (including AI consent and [per-workspace AI settings]).

## 4. Subprocessors

Current list: [URL of `/subprocessors`]. Customer gives general authorisation to these subprocessors. Ohmni will give [30] days' notice of a new subprocessor via [notification channel]; Customer may object on reasonable data-protection grounds, [remedy]. Ohmni imposes data-protection terms on each subprocessor no less protective than this DPA [status per vendor: see internal vendor register].

AI processing: images and circuit data are sent to AI providers only for the features listed on the subprocessor page and [only after the user's explicit consent / only where AI is enabled for the workspace]. [Statement on provider training use — must match the AI tiers in force at signature.]

## 5. Security measures (Annex 2)

Measures in place at the date of this draft, as documented in Ohmni's repository:

| Area | Measure |
|---|---|
| Tenant isolation | Postgres row-level security restricting every table to workspace members; database-enforced composite keys preventing cross-workspace linkage; tested by an automated owner/editor/viewer/outsider/anonymous access matrix |
| Access control | Authenticated access via the hosting database's auth service; owner/editor/viewer roles; owner-only member management; at least one owner always retained |
| Secrets | Service credentials held server-side only; no secret exposed to browsers |
| Transport and browser security | HTTPS with HSTS; enforced Content-Security-Policy; clickjacking protection; restrictive permissions policy |
| Storage of files | Private bucket with no public access; downloads by short-lived (60 s) signed URLs after a membership check |
| Integrity of evidence | Measurements append-only; diagnostic results computed and written by the server only |
| Abuse protection | Request size and workload limits; per-IP and per-user rate limits and daily quotas |
| Logging | Per-request metadata logs with request ids, excluding request bodies, images, keys and IP addresses; audit log of workspace changes readable by workspace owners |
| Change management | Changes via pull request with automated lint, type-check, tests, build and dependency vulnerability audit; post-deploy verification of production |
| Vulnerability management | Weekly dependency updates; private vulnerability reporting channel |
| Backups | [Daily backups / point-in-time recovery — insert only once verified for the plan in force] |
| [Gaps to resolve or disclose before signing] | [e.g. penetration test, branch protection, monitoring, restore test — see internal SOC 2 readiness map] |

## 6. Deletion and return

- During the term, Customer can export a workspace and delete workspaces and accounts self-service.
- On termination, Ohmni will delete Customer data within [30] days unless Customer exports it first [or requests return in [format]].
- Residual copies: database backups expire on the provider's backup schedule ([N] days — to verify); audit events (ids only, no content) are retained up to 400 days; operational metadata of AI calls up to 90 days.
- Consented, de-identified benchmark cases: [counsel to decide treatment and withdrawal].

## 7. Assistance

Ohmni will, taking into account the nature of processing, assist Customer with data-subject requests (export and deletion tools are self-service), security, breach notification, data-protection impact assessments and prior consultation, [at Customer's cost beyond reasonable effort].

## 8. Personal data breach

Ohmni will notify Customer without undue delay and in any case within [48/72] hours of becoming aware of a personal data breach affecting Customer data, with the information then available, and will update it as it becomes available. Internal procedure: incident response plan (internal).

## 9. Audits

Ohmni will make available information necessary to demonstrate compliance, [in the form of its current security documentation and, when available, third-party audit reports]. On-site audits: [once per year, [30] days' notice, at Customer's cost, subject to confidentiality].

## 10. International transfers

Primary storage region: United States (us-west-2). [Transfer mechanism, e.g. Standard Contractual Clauses module 2/3, UK addendum — counsel to complete.] AI subprocessor processing locations: [to verify].

## 11. Confidentiality of personnel

Persons authorised to process Customer data are bound by confidentiality. [Ohmni to confirm before signing.]

## 12. Liability and precedence

[Per Agreement.] In case of conflict on data protection, this DPA prevails.

Signatures: [Customer] [Ohmni] — name, title, date.
