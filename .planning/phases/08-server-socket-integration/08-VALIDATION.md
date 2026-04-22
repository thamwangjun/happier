---
phase: 8
slug: server-socket-integration
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-22
validated: 2026-04-22
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `apps/server/vitest.integration.config.ts` |
| **Quick run command** | `cd apps/server && yarn vitest --config vitest.integration.config.ts --reporter verbose sources/app/api/socket/resilienceHandler.integration.spec.ts` |
| **Full suite command** | `cd apps/server && yarn vitest --config vitest.integration.config.ts && cd ../cli && yarn test src/api/session/sessionClient.startupCatchUpRetry.test.ts` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/server && yarn vitest --config vitest.integration.config.ts --reporter verbose sources/app/api/socket/resilienceHandler.integration.spec.ts`
- **After every plan wave:** Run `cd apps/server && yarn vitest --config vitest.integration.config.ts && cd ../cli && yarn test src/api/session/sessionClient.startupCatchUpRetry.test.ts`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 8 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 8-01-01 | 01 | 1 | SRVR-01 through SRVR-10 | T-8-01, T-8-02, T-8-03 | Validates `reconnect-resume` and `ack-update` schemas; uses server-derived connectionKey | tdd (RED gate) | `cd apps/server && yarn vitest --config vitest.integration.config.ts --reporter verbose sources/app/api/socket/resilienceHandler.integration.spec.ts` | ✅ exists | ✅ green |
| 8-02-01 | 02 | 2 | SRVR-02, SRVR-03, SRVR-04, SRVR-06, SRVR-08, SRVR-09, SRVR-10 | T-8-01, T-8-02, T-8-03, T-8-05 | connectionKey derived from JWT userId; schema validation rejects malformed payloads | integration (GREEN gate) | `cd apps/server && yarn vitest --config vitest.integration.config.ts --reporter verbose sources/app/api/socket/resilienceHandler.integration.spec.ts` | ✅ exists | ✅ green |
| 8-02-02 | 02 | 2 | SRVR-01 | T-8-06 | writeToBuffer called with user-scoped key; fire-and-forget never blocks emitUpdate | integration (GREEN gate) | `cd apps/server && yarn vitest --config vitest.integration.config.ts --reporter verbose sources/app/api/socket/resilienceHandler.integration.spec.ts` | ✅ exists | ✅ green |
| 8-02-03 | 02 | 2 | SRVR-07 | — | N/A — existing CLI test unchanged | unit (existing) | `cd apps/cli && yarn test src/api/session/sessionClient.startupCatchUpRetry.test.ts` | ✅ existing | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `apps/server/sources/app/api/socket/resilienceHandler.integration.spec.ts` — RED test suite covering SRVR-01 through SRVR-10 (created by Plan 01 Task 1)
- [x] No framework install needed — vitest already configured in `apps/server/vitest.config.ts`
- [x] No fixtures needed — `createDbMocks`, `createFakeSocket`, `triggerSocketHandler` already in `apps/server/sources/app/api/testkit/`

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (resilienceHandler.integration.spec.ts)
- [x] No watch-mode flags
- [x] Feedback latency < 8s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved — 2026-04-22

---

## Validation Audit 2026-04-22

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

**Notes:**
- All 9 runnable tests GREEN (9 passed, 1 skipped SRVR-05/no REDIS_URL — by-design conditional skip)
- SRVR-01 "calls writeToBuffer" test — marked failing in 08-02-SUMMARY.md due to vi.mock intercept issue; now passes GREEN with correct integration config
- SRVR-07: it.todo in spec; `sessionClient.startupCatchUpRetry.test.ts` 2/2 PASS (CLI gate confirmed)
- Root cause of original "pending" state: VALIDATION.md was written pre-execution as a draft; commands used wrong vitest config (`vitest.config.ts` excludes `*.integration.spec.ts`); correct config is `vitest.integration.config.ts`
- 5 unrelated CLI failures in `liveRemoteSshBootstrap.test.ts` — pre-existing, not introduced by Phase 8
