---
phase: 10
slug: e2e-validation-and-hardening
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-23
audited: 2026-04-23
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (packages/tests) |
| **Config file** | packages/tests/vitest.core.config.ts |
| **Quick run command** | `cd packages/tests && node scripts/run-vitest-with-heartbeat.mjs --config vitest.core.config.ts suites/core-e2e/reconnect.resilience.e2e.test.ts` |
| **Full suite command** | `cd packages/tests && node scripts/run-vitest-with-heartbeat.mjs --config vitest.core.config.ts` |
| **Stress suite command** | `cd packages/tests && node scripts/run-vitest-with-heartbeat.mjs --config vitest.stress.config.ts suites/stress/buffer.walContention.stress.test.ts` |
| **Estimated runtime** | ~10–20 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd packages/tests && node scripts/run-vitest-with-heartbeat.mjs --config vitest.core.config.ts suites/core-e2e/reconnect.resilience.e2e.test.ts`
- **After every plan wave:** Run `cd packages/tests && node scripts/run-vitest-with-heartbeat.mjs --config vitest.core.config.ts`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | VALID-02 | — | N/A | unit | `grep -c "buffer_writes_total" apps/server/sources/app/monitoring/metrics2.ts` | ✅ | ✅ green |
| 10-02-01 | 02 | 1 | VALID-04 | — | N/A | manual | `ls docs/android-doze-qa-checklist.md` | ✅ | ✅ green |
| 10-03-01 | 03 | 2 | VALID-01 | — | N/A | e2e | `cd packages/tests && node scripts/run-vitest-with-heartbeat.mjs --config vitest.core.config.ts suites/core-e2e/reconnect.resilience.e2e.test.ts` | ✅ | ✅ green |
| 10-04-01 | 04 | 2 | VALID-03 | — | N/A | stress | `cd packages/tests && node scripts/run-vitest-with-heartbeat.mjs --config vitest.stress.config.ts suites/stress/buffer.walContention.stress.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `packages/tests/suites/core-e2e/reconnect.resilience.e2e.test.ts` — stub for VALID-01
- [x] `packages/tests/suites/stress/buffer.walContention.stress.test.ts` — stub for VALID-03

*Existing test infrastructure (vitest, testkit, startServerLight) covers the phase — no new framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Android Doze QA: background ack-flush, foreground reconnect, Doze socket resurrection | VALID-04 | Requires physical Android device; ADB/emulator cannot fully replicate OS Doze mode | Follow steps in docs/android-doze-qa-checklist.md on a physical device |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** complete

---

## Validation Audit 2026-04-23

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

**Notes:**
- VALID-01 (reconnect.resilience.e2e.test.ts): ✅ passed (6.5s) with vitest.core.config.ts (180s timeout)
- VALID-02 (metrics2.ts counters): ✅ all 4 counter names confirmed present (grep returns 4 matches)
- VALID-03 (buffer.walContention.stress.test.ts): ✅ passed (2.9s), 200 concurrent writes all ok:true
- VALID-04 (android-doze-qa-checklist.md): ✅ file exists; physical device testing remains manual-only
- Run command fix: direct `npx vitest run` times out at 5000ms (default); must use `node scripts/run-vitest-with-heartbeat.mjs --config vitest.core.config.ts` (180s timeout)
