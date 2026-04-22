---
phase: 9
slug: mobile-reconnect-and-deduplication
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-22
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (confirmed in `apps/ui/vitest.config.ts`) |
| **Config file** | `apps/ui/vitest.config.ts` |
| **Quick run command** | `yarn test --run sources/sync/engine/resilience/` (from `apps/ui/`) |
| **Full suite command** | `yarn test --run` (from `apps/ui/`) |
| **Estimated runtime** | ~30 seconds (resilience suite); ~120 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `yarn test --run sources/sync/engine/resilience/` (from `apps/ui/`)
- **After every plan wave:** Run `yarn test --run` (full suite from `apps/ui/`)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 9-01-01 | 01 | 1 | MOB-02 | — | N/A | unit | `yarn test --run sources/sync/engine/resilience/dedupFilter.spec.ts` | ❌ W0 | ⬜ pending |
| 9-01-02 | 01 | 1 | MOB-03 | — | N/A | unit | `yarn test --run sources/sync/engine/resilience/ackCursorManager.spec.ts` | ❌ W0 | ⬜ pending |
| 9-01-03 | 01 | 1 | MOB-07 | — | N/A | unit | `yarn test --run sources/sync/engine/resilience/replayGate.spec.ts` | ❌ W0 | ⬜ pending |
| 9-01-04 | 01 | 1 | MOB-01, MOB-04, MOB-05, MOB-06, MOB-08, MOB-09, MOB-10 | — | N/A | unit | `yarn test --run sources/sync/engine/resilience/reconnectResume.spec.ts` | ❌ W0 | ⬜ pending |
| 9-02-01 | 02 | 2 | MOB-02 | — | dedup filter drops seq ≤ lastAckedSeq | unit | `yarn test --run sources/sync/engine/resilience/dedupFilter.spec.ts` | ❌ W0 | ⬜ pending |
| 9-02-02 | 02 | 2 | MOB-03 | — | ack emit uses ACK_DEBOUNCE_MS=500 | unit | `yarn test --run sources/sync/engine/resilience/ackCursorManager.spec.ts` | ❌ W0 | ⬜ pending |
| 9-02-03 | 02 | 2 | MOB-07 | — | commits held during isReplaying=true | unit | `yarn test --run sources/sync/engine/resilience/replayGate.spec.ts` | ❌ W0 | ⬜ pending |
| 9-02-04 | 02 | 2 | MOB-10 | — | single in-flight resumeViaChanges | unit | `yarn test --run sources/sync/engine/resilience/` | ❌ W0 | ⬜ pending |
| 9-03-01 | 03 | 3 | MOB-01 | — | reconnect-resume emitted with lastAckedSeq | unit | `yarn test --run sources/sync/api/session/apiSocket.reconnectSemantics.test.ts` | ✅ extend | ⬜ pending |
| 9-03-02 | 03 | 3 | MOB-04 | — | MMKV key persists across restart simulation | unit | `yarn test --run sources/sync/engine/resilience/` | ❌ W0 | ⬜ pending |
| 9-03-03 | 03 | 3 | MOB-05 | — | background transition flushes ack synchronously | unit | `yarn test --run sources/sync/engine/resilience/` | ❌ W0 | ⬜ pending |
| 9-03-04 | 03 | 3 | MOB-06 | — | foreground forces disconnect+reconnect | unit | `yarn test --run sources/sync/api/session/apiSocket.reconnectSemantics.test.ts` | ✅ extend | ⬜ pending |
| 9-03-05 | 03 | 3 | MOB-08 | — | buffer-overflow triggers resumeViaChanges immediately | unit | `yarn test --run sources/sync/engine/resilience/reconnectResume.spec.ts` | ❌ W0 | ⬜ pending |
| 9-03-06 | 03 | 3 | MOB-09 | — | retentionStart gap triggers resumeViaChanges proactively | unit | `yarn test --run sources/sync/engine/resilience/reconnectResume.spec.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `sources/sync/engine/resilience/dedupFilter.spec.ts` — RED tests for MOB-02 (dedup filter)
- [ ] `sources/sync/engine/resilience/dedupFilter.ts` — stub (exported but throws "not implemented")
- [ ] `sources/sync/engine/resilience/ackCursorManager.spec.ts` — RED tests for MOB-03 (debounced ack-update)
- [ ] `sources/sync/engine/resilience/ackCursorManager.ts` — stub
- [ ] `sources/sync/engine/resilience/replayGate.spec.ts` — RED tests for MOB-07 (replay gate / pending queue hold)
- [ ] `sources/sync/engine/resilience/replayGate.ts` — stub
- [ ] `sources/sync/engine/resilience/reconnectResume.spec.ts` — integration-level RED tests covering MOB-01, MOB-04, MOB-05, MOB-06, MOB-08, MOB-09, MOB-10

*(No framework install needed — Vitest already configured in `apps/ui/vitest.config.ts`)*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| iOS background ack flush reaches server before socket kill | MOB-05 | Requires physical iOS device + Charles Proxy to observe socket traffic during backgrounding | Run app, trigger a session update, background the app immediately, confirm `ack-update` event appears in Charles Proxy before socket closes |
| Android Doze mode reconnect | (Phase 10 VALID-04) | Requires physical Android device in Doze mode | Deferred to Phase 10 — out of scope for Phase 9 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
