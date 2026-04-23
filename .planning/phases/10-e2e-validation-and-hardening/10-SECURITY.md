---
phase: 10
slug: e2e-validation-and-hardening
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-23
---

# Phase 10 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Test process → server subprocess | Tests call startServerLight which spawns server as subprocess; prom-client registries are isolated | Test-generated data only; no real user data |
| Documentation only | android-doze-qa-checklist.md, no code paths | None — static doc file |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-10-01 | Information Disclosure | Prometheus /metrics endpoint | accept | Counters expose buffer operation counts only — no user data, no PII; /metrics endpoint already public in dev/test environments | closed |
| T-10-02 | Denial of Service | dedupDropsTotal db.count() on reconnect | accept | Single COUNT query per reconnect-resume event; indexed on (userId, connectionKey, seq); scope limited to already-validated userId | closed |
| T-10-02-01 | Information Disclosure | android-doze-qa-checklist.md | accept | Documentation file only; contains no credentials, keys, or internal URLs; ADB commands are public Android debugging commands | closed |
| T-10-03-01 | Tampering | reconnect-resume payload in test | accept | Test constructs payload explicitly; only reaches test server instance; no production data involved | closed |
| T-10-04-01 | Denial of Service | Concurrent buffer writes in CI stress test | accept | Stress suite only (explicit yarn test:stress); BURST=200 sized for CI completion within 300s; server subprocess torn down after test | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-10-01 | T-10-01 | /metrics exposes only operation counters (no PII); already public in dev/test; standard observability practice | Tham Wang Jun | 2026-04-23 |
| AR-10-02 | T-10-02 | COUNT query is single, indexed, bounded by validated userId; negligible overhead per reconnect event | Tham Wang Jun | 2026-04-23 |
| AR-10-03 | T-10-02-01 | Documentation only; no credentials or sensitive data; ADB commands are public Android tooling | Tham Wang Jun | 2026-04-23 |
| AR-10-04 | T-10-03-01 | Test-only payload; isolated to test server subprocess; no production data path | Tham Wang Jun | 2026-04-23 |
| AR-10-05 | T-10-04-01 | Stress test gated behind explicit yarn test:stress invocation; not part of CI core-e2e suite | Tham Wang Jun | 2026-04-23 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-23 | 5 | 5 | 0 | /gsd-secure-phase (accepted risks) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-23
