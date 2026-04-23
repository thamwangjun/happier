---
phase: 10
slug: e2e-validation-and-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-23
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (packages/tests) |
| **Config file** | packages/tests/vitest.config.ts |
| **Quick run command** | `cd packages/tests && npx vitest run suites/core-e2e/reconnect.resilience.e2e.test.ts` |
| **Full suite command** | `cd packages/tests && npx vitest run` |
| **Estimated runtime** | ~30–60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd packages/tests && npx vitest run suites/core-e2e/reconnect.resilience.e2e.test.ts`
- **After every plan wave:** Run `cd packages/tests && npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | VALID-02 | — | N/A | unit | `grep -c "buffer_writes_total" apps/server/sources/app/monitoring/metrics2.ts` | ❌ W0 | ⬜ pending |
| 10-02-01 | 02 | 1 | VALID-04 | — | N/A | manual | `ls docs/android-doze-qa-checklist.md` | ❌ W0 | ⬜ pending |
| 10-03-01 | 03 | 2 | VALID-01 | — | N/A | e2e | `cd packages/tests && yarn test --config vitest.core.config.ts reconnect.resilience.e2e.test.ts` | ❌ W0 | ⬜ pending |
| 10-04-01 | 04 | 2 | VALID-03 | — | N/A | stress | `cd packages/tests && yarn test:stress buffer.walContention.stress.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/tests/suites/core-e2e/reconnect.resilience.e2e.test.ts` — stub for VALID-01
- [ ] `packages/tests/suites/stress/buffer.walContention.stress.test.ts` — stub for VALID-03

*Existing test infrastructure (vitest, testkit, startServerLight) covers the phase — no new framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Android Doze QA: background ack-flush, foreground reconnect, Doze socket resurrection | VALID-04 | Requires physical Android device; ADB/emulator cannot fully replicate OS Doze mode | Follow steps in docs/android-doze-qa-checklist.md on a physical device |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
