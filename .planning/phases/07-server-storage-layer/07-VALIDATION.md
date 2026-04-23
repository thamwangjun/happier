---
phase: 7
slug: server-storage-layer
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-22
audited: 2026-04-23
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `apps/server/vitest.config.ts` |
| **Quick run command** | `cd apps/server && yarn test --run sources/app/resilience` |
| **Full suite command** | `cd apps/server && yarn test --run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/server && yarn test --run sources/app/resilience`
- **After every plan wave:** Run `cd apps/server && yarn test --run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 7-01-01 | 01 | 0 | STORE-01 | — | N/A | unit stub | `cd apps/server && yarn test --run sources/app/resilience/unackedBuffer.spec.ts` | ✅ | ✅ green |
| 7-01-02 | 01 | 1 | STORE-01 | — | N/A | unit | `cd apps/server && yarn test --run sources/app/resilience/unackedBuffer.spec.ts` | ✅ | ✅ green |
| 7-02-01 | 01 | 1 | STORE-02 | — | N/A | unit | `cd apps/server && yarn test --run sources/app/resilience/unackedBuffer.spec.ts` | ✅ | ✅ green |
| 7-03-01 | 01 | 1 | STORE-03 | — | N/A | unit | `cd apps/server && yarn test --run sources/app/resilience/unackedMessageRetentionRule.spec.ts` | ✅ | ✅ green |
| 7-04-01 | 01 | 1 | STORE-04 | — | N/A | unit | `cd apps/server && yarn test --run sources/app/resilience/unackedBuffer.spec.ts` | ✅ | ✅ green |
| 7-05-01 | 01 | 1 | STORE-05 | — | N/A | unit | `cd apps/server && yarn test --run sources/app/resilience/unackedBuffer.spec.ts` | ✅ | ✅ green |
| 7-06-01 | 02 | 1 | STORE-06 | — | N/A | unit | `cd apps/server && yarn test --run sources/app/resilience/unackedMessageRetentionRule.spec.ts` | ✅ | ✅ green |
| 7-07-01 | 02 | 1 | STORE-07 | — | N/A | unit | `cd apps/server && yarn test --run sources/app/resilience/unackedBuffer.spec.ts` | ✅ | ✅ green |
| 7-08-01 | 02 | 2 | STORE-06 | — | N/A | unit | `cd apps/server && yarn test --run sources/app/resilience` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `apps/server/sources/app/resilience/unackedBuffer.spec.ts` — failing stubs for STORE-01 through STORE-07 (RED phase)

*All other infrastructure (vitest, createDbMocks, installDbModuleMock) exists.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CLI connection entries never appear in UnackedMessage table | STORE-07 | Requires live DB inspection | After running server with test data, query `SELECT DISTINCT connectionKey FROM "UnackedMessage"` — all rows must start with `user-scoped:` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved

---

## Validation Audit 2026-04-23

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

Test run result: **8 tests passed (2 files)** in 2.72s — all requirements COVERED.

Coverage summary:
- STORE-01: `readBuffer returns entries in seq order after writes`
- STORE-02 + STORE-05: `enforces cap: returns { overflow: true } when count exceeds cap after insert`
- STORE-03 + STORE-06: `deletes entries older than RELAY_BUFFER_TTL_MS via findMany + deleteMany` (+ dryRun and empty-candidates paths)
- STORE-04: `ackBuffer calls deleteMany with seq <= ackedSeq`
- STORE-07: `returns { overflow: false } without DB call for non-user-scoped connectionKey` (machine-scoped + session-scoped)
