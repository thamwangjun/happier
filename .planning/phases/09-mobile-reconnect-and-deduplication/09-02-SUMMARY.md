---
phase: 09-mobile-reconnect-and-deduplication
plan: "02"
subsystem: sync-resilience
tags: [vitest, tdd, green-phase, resilience, dedup, ack, replay-gate, mmkv, persistence]

# Dependency graph
requires:
  - phase: 09-01
    provides: RED phase test contract (dedupFilter.spec.ts, ackCursorManager.spec.ts, replayGate.spec.ts, reconnectResume.spec.ts)
  - phase: 06-protocol-contract
    provides: ACK_DEBOUNCE_MS from @happier-dev/protocol

provides:
  - shouldApplyUpdate — seq > lastAckedSeq comparison in dedupFilter.ts
  - scheduleAckUpdateFlush / flushAckUpdateNow — 500ms debounce manager in ackCursorManager.ts
  - shouldHoldServerCommit — replay gate boolean check in replayGate.ts
  - loadLastAckedSeq / saveLastAckedSeq — MMKV per-account persistence in persistence.ts

affects:
  - 09-03 (wiring phase — integrates resilience module into sync.ts socket handlers)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - seq > lastAckedSeq comparison (zero-allocation dedup — no Set, no module-level state)
    - Dirty flag + setTimeout debounce pattern (matches scheduleChangesCursorFlush in sync.ts)
    - Merge-write pattern for per-account MMKV blob (read-existing, salvage valid, merge, write)
    - Math.floor on all seq values at MMKV boundary (safe integer storage)

key-files:
  created: []
  modified:
    - apps/ui/sources/sync/engine/resilience/dedupFilter.ts
    - apps/ui/sources/sync/engine/resilience/ackCursorManager.ts
    - apps/ui/sources/sync/engine/resilience/replayGate.ts
    - apps/ui/sources/sync/domains/state/persistence.ts

key-decisions:
  - "shouldApplyUpdate uses seq > lastAckedSeq (strict greater-than) — equal seq means already applied (idempotent replay), less-than means stale"
  - "scheduleAckUpdateFlush early-returns if timer already set (idempotent) — matches dirty flag pattern from sync.ts scheduleChangesCursorFlush"
  - "saveLastAckedSeq uses merge-write (not replace) — preserves other accounts' data in the shared MMKV blob"
  - "loadLastAckedSeq returns 0 for absent/invalid data — safe default triggers full replay rather than silently dropping messages (T-09B-04 mitigation)"

requirements-completed:
  - MOB-04

# Metrics
duration: 15min
completed: 2026-04-22
---

# Phase 09 Plan 02: Mobile Reconnect and Deduplication GREEN Phase Summary

**GREEN phase: implemented shouldApplyUpdate, scheduleAckUpdateFlush/flushAckUpdateNow, shouldHoldServerCommit, and MMKV persistence helpers — all 36 resilience unit tests now GREEN**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-22T13:24:29Z
- **Completed:** 2026-04-22T13:39:21Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Replaced three `throw new Error('not implemented')` stubs in dedupFilter.ts, ackCursorManager.ts, replayGate.ts with working implementations
- Extended persistence.ts with `loadLastAckedSeq` and `saveLastAckedSeq` using the established key function + getPersistenceStorage() singleton pattern
- All 36 resilience tests GREEN (dedupFilter: 5, ackCursorManager: 7, replayGate: 4, reconnectResume: 20)
- Existing 46 persistence.test.ts tests still pass
- `yarn typecheck` exits 0

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement dedupFilter.ts, ackCursorManager.ts, replayGate.ts (GREEN core)** - `e54daf67f` (feat)
2. **Task 2: Extend persistence.ts with loadLastAckedSeq and saveLastAckedSeq (GREEN MOB-04)** - `5c931bfd6` (feat)

## Files Modified

- `apps/ui/sources/sync/engine/resilience/dedupFilter.ts` — replaced throw with `return seq > lastAckedSeq`
- `apps/ui/sources/sync/engine/resilience/ackCursorManager.ts` — replaced two throwing stubs with dirty-flag debounce and synchronous flush implementations; removed `void ACK_DEBOUNCE_MS` stub line
- `apps/ui/sources/sync/engine/resilience/replayGate.ts` — replaced throw with `return gate.isReplaying`
- `apps/ui/sources/sync/domains/state/persistence.ts` — appended `lastAckedSeqByAccountIdKey()`, `loadLastAckedSeq()`, `saveLastAckedSeq()` after existing exports

## Decisions Made

- `shouldApplyUpdate` uses strict greater-than (`seq > lastAckedSeq`) — equal seq means already applied (T-09B-01 mitigation: `shouldApplyUpdate(4, 4)` returns false)
- `scheduleAckUpdateFlush` early-returns if `state.timer` is already set — idempotent, matches the `scheduleChangesCursorFlush` pattern from sync.ts lines 3340-3363
- `saveLastAckedSeq` uses merge-write pattern (not replace) — salvages existing per-account entries before merging in the new value
- `loadLastAckedSeq` returns 0 for absent/invalid/corrupt data — T-09B-04 mitigation: attacker who corrupts MMKV gets 0 (full replay) not elevated seq that drops messages

## Deviations from Plan

None — plan executed exactly as written. Implementation matched the `<action>` specifications precisely.

## Threat Mitigations Applied

| Threat ID | Component | Mitigation |
|-----------|-----------|------------|
| T-09B-01 | dedupFilter.ts | `shouldApplyUpdate(4, 4)` returns false (equal seq rejected), `shouldApplyUpdate(3, 4)` returns false (stale rejected) |
| T-09B-02 | persistence.ts | `saveLastAckedSeq` uses MMKV synchronous C++ API — completes before AppState background handler returns |
| T-09B-03 | ackCursorManager.ts | dirty flag + early return limits to one timer per ACK_DEBOUNCE_MS=500ms period |
| T-09B-04 | persistence.ts | `loadLastAckedSeq` returns 0 for non-numeric, negative, Infinity, NaN, or corrupt data |

## Known Stubs

None — all stubs from the RED phase (09-01) have been replaced with working implementations.

## Threat Flags

None — no new security-relevant surface introduced beyond what is specified in the plan's threat model.

## Next Phase Readiness

- 09-03 (wiring phase) can begin immediately — all pure-logic functions are implemented and tested
- `AckFlushState`, `ReplayGate`, `createAckFlushState()`, `createReplayGate()` types and factories are ready for sync.ts integration
- `loadLastAckedSeq` / `saveLastAckedSeq` are ready for use in reconnect handlers in sync.ts

## Self-Check: PASSED

- `e54daf67f` — found in git log
- `5c931bfd6` — found in git log
- `apps/ui/sources/sync/engine/resilience/dedupFilter.ts` — exists, no 'not implemented' throws
- `apps/ui/sources/sync/engine/resilience/ackCursorManager.ts` — exists, no 'not implemented' throws
- `apps/ui/sources/sync/engine/resilience/replayGate.ts` — exists, no 'not implemented' throws
- `apps/ui/sources/sync/domains/state/persistence.ts` — exports loadLastAckedSeq and saveLastAckedSeq
- All 36 resilience tests GREEN, all 46 persistence tests GREEN, typecheck exits 0

---
*Phase: 09-mobile-reconnect-and-deduplication*
*Completed: 2026-04-22*
