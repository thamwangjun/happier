---
phase: 7
slug: server-storage-layer
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-22
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `apps/server/vitest.config.ts` |
| **Quick run command** | `yarn workspace happier-server test --run sources/app/resilience` |
| **Full suite command** | `yarn workspace happier-server test --run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `yarn workspace happier-server test --run sources/app/resilience`
- **After every plan wave:** Run `yarn workspace happier-server test --run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 7-01-01 | 01 | 0 | STORE-01 | — | N/A | unit stub | `yarn workspace happier-server test --run sources/app/resilience/unackedBuffer.spec.ts` | ❌ W0 | ⬜ pending |
| 7-01-02 | 01 | 1 | STORE-01 | — | N/A | unit | `yarn workspace happier-server test --run sources/app/resilience/unackedBuffer.spec.ts` | ✅ | ⬜ pending |
| 7-02-01 | 01 | 1 | STORE-02 | — | N/A | unit | `yarn workspace happier-server test --run sources/app/resilience/unackedBuffer.spec.ts` | ✅ | ⬜ pending |
| 7-03-01 | 01 | 1 | STORE-03 | — | N/A | unit | `yarn workspace happier-server test --run sources/app/resilience/unackedBuffer.spec.ts` | ✅ | ⬜ pending |
| 7-04-01 | 01 | 1 | STORE-04 | — | N/A | unit | `yarn workspace happier-server test --run sources/app/resilience/unackedBuffer.spec.ts` | ✅ | ⬜ pending |
| 7-05-01 | 01 | 1 | STORE-05 | — | N/A | unit | `yarn workspace happier-server test --run sources/app/resilience/unackedBuffer.spec.ts` | ✅ | ⬜ pending |
| 7-06-01 | 02 | 1 | STORE-06 | — | N/A | unit | `yarn workspace happier-server test --run sources/app/resilience/unackedBuffer.spec.ts` | ✅ | ⬜ pending |
| 7-07-01 | 02 | 1 | STORE-07 | — | N/A | unit | `yarn workspace happier-server test --run sources/app/resilience/unackedBuffer.spec.ts` | ✅ | ⬜ pending |
| 7-08-01 | 02 | 2 | STORE-06 | — | N/A | unit | `yarn workspace happier-server test --run sources/app/resilience` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/server/sources/app/resilience/unackedBuffer.spec.ts` — failing stubs for STORE-01 through STORE-07 (RED phase)

*All other infrastructure (vitest, createDbMocks, installDbModuleMock) exists.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CLI connection entries never appear in UnackedMessage table | STORE-07 | Requires live DB inspection | After running server with test data, query `SELECT DISTINCT connectionKey FROM "UnackedMessage"` — all rows must start with `user-scoped:` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
