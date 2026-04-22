---
phase: 09-mobile-reconnect-and-deduplication
plan: "03"
subsystem: sync-resilience
tags: [vitest, tdd, green-phase, resilience, replay-gate, reconnect-resume, ack-flush, mmkv, socket.io, dedup, pending-queue]

# Dependency graph
requires:
  - phase: 09-02
    provides: shouldApplyUpdate, scheduleAckUpdateFlush/flushAckUpdateNow, shouldHoldServerCommit, loadLastAckedSeq/saveLastAckedSeq pure logic implementations
  - phase: 06-protocol-contract
    provides: SOCKET_RESILIENCE_EVENTS, ACK_DEBOUNCE_MS from @happier-dev/protocol

provides:
  - apiSocket.ts wired to emit reconnect-resume with lastAckedSeq on every onReconnected callback
  - sync.ts REPLAY_START listener with gap-detection routing to resumeViaChangesDeduped
  - sync.ts BUFFER_OVERFLOW listener routing to resumeViaChangesDeduped
  - sync.ts REPLAY_COMPLETE listener clearing isReplaying gate and draining waiters
  - sync.ts AppState background handler flushing ack-update and persisting lastAckedSeq synchronously
  - sync.ts AppState foreground handler calling disconnect() before connect() unconditionally
  - resumeViaChangesDeduped via runWithInFlightDedupe (single-in-flight per reconnect cycle)
  - public waitForReplayComplete() gate method on Sync class
  - pendingQueueV2.ts replay gate inside runPendingEnqueueCommitInOrder (holds HTTP POST, not optimistic update)

affects:
  - 09-04 (validation phase — all MOB-01..MOB-10 requirements now wired)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Socket event registration via apiSocket.onMessage for resilience events (REPLAY_START, BUFFER_OVERFLOW, REPLAY_COMPLETE)
    - ReplayGate interface delegation — Sync class exposes public isReplaying getter + waitForReplayComplete() so it satisfies the replayGate interface passed to pendingQueueV2
    - Wait-for-promise gate inside promise chain (NOT early return) — preserves commit ordering in runPendingEnqueueCommitInOrder
    - runWithInFlightDedupe applied to resumeViaChangesDeduped for single-in-flight dedup across buffer-overflow and gap-detection events

key-files:
  created: []
  modified:
    - apps/ui/sources/sync/sync.ts
    - apps/ui/sources/sync/engine/pending/pendingQueueV2.ts

key-decisions:
  - "replayGate.isReplaying set to true in onReconnected BEFORE resumeSync call — ensures pendingQueueV2 gate is armed before any concurrent resume attempt processes commits"
  - "Sync class exposes public isReplaying getter delegating to replayGate.isReplaying — allows passing this as replayGate to enqueuePendingMessageV2 without wrapper object"
  - "apiSocket.send() used for reconnect-resume and ack-update emissions (consistent with other direct socket emissions in sync.ts)"
  - "sessionId passed as empty string '' in reconnect-resume/ack-update — server uses userId from socket connection, not sessionId from payload"
  - "resumeViaChangesInFlight reset to null on REPLAY_COMPLETE (not BUFFER_OVERFLOW) — allows next reconnect cycle while current replay is still draining"
  - "Pre-existing ItemRowActions.test.ts (2 failures) confirmed pre-existing before these changes — not caused by this plan"

patterns-established:
  - "Replay gate pattern: set isReplaying=true on reconnect, clear only on REPLAY_COMPLETE, drain waiters with drainReplayCompleteWaiters()"
  - "Optional replayGate parameter on enqueuePendingMessageV2 — backward-compatible, undefined means no gating"

requirements-completed: [MOB-01, MOB-05, MOB-06, MOB-07, MOB-08, MOB-09, MOB-10]

# Metrics
duration: 25min
completed: 2026-04-22
---

# Phase 09 Plan 03: Mobile Reconnect and Deduplication GREEN Integration Summary

**Full reconnect-resume loop wired into sync.ts and pendingQueueV2.ts: reconnect-resume emitted on socket reconnect, replay gate holds commits during server replay, ack-update flushed synchronously on background, foreground forces fresh disconnect+connect, buffer-overflow and gap-detection route through single-in-flight resumeViaChangesDeduped**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-22T13:44:13Z
- **Completed:** 2026-04-22T14:09:13Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Wired all 7 MOB requirements (MOB-01, MOB-05, MOB-06, MOB-07, MOB-08, MOB-09, MOB-10) into sync.ts and pendingQueueV2.ts
- All 36 resilience tests GREEN (including all 20 reconnectResume.spec.ts integration tests)
- apiSocket.reconnectSemantics.test.ts (6 tests) still GREEN — no regression on socket reconnect semantics
- Full yarn typecheck exits 0
- Pre-existing ItemRowActions.test.ts failures (2) confirmed pre-existing before these changes

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire reconnect-resume, replay listeners, and foreground reconnect in sync.ts** - `ec4566e18` (feat)
2. **Task 2: Wire replay gate into pendingQueueV2.ts and expose isReplaying getter on Sync** - `2741f3df2` (feat)

## Files Created/Modified

- `apps/ui/sources/sync/sync.ts` — Added imports (SOCKET_RESILIENCE_EVENTS, ReplayGate, AckFlushState, loadLastAckedSeq, saveLastAckedSeq); added private fields (replayGate, ackFlushState, lastAckedSeq, resumeViaChangesInFlight, replayCompleteWaiters); extended onReconnected; added REPLAY_START/BUFFER_OVERFLOW/REPLAY_COMPLETE listeners; added resumeViaChangesDeduped, waitForReplayComplete, drainReplayCompleteWaiters methods; updated AppState background+foreground handlers
- `apps/ui/sources/sync/engine/pending/pendingQueueV2.ts` — Added optional replayGate parameter to enqueuePendingMessageV2; added wait-for-promise gate inside runPendingEnqueueCommitInOrder callback

## Decisions Made

- `Sync class exposes public isReplaying getter` — allows passing `this` as the `replayGate` to `enqueuePendingMessageV2` without a wrapper object, satisfying `{ isReplaying: boolean; waitForReplayComplete(): Promise<void> }`
- `sessionId: ''` in reconnect-resume/ack-update payloads — server uses `userId` from socket connection for the buffer key, `sessionId` in the protocol schema is present but not used server-side
- `resumeViaChangesInFlight = null` reset on REPLAY_COMPLETE (not BUFFER_OVERFLOW) — allows the next reconnect cycle to start a fresh deduped call while preserving the current in-flight during replay

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript type error: Sync does not satisfy replayGate interface**
- **Found during:** Task 2 (passing `this` as replayGate to enqueuePendingMessageV2)
- **Issue:** The replayGate interface requires `{ isReplaying: boolean; ... }` but Sync stores `isReplaying` inside `replayGate.isReplaying` — TypeScript rejected passing `this` directly
- **Fix:** Added public getter `get isReplaying(): boolean { return this.replayGate.isReplaying; }` on Sync class — makes `this` structurally compatible with the replayGate interface
- **Files modified:** `apps/ui/sources/sync/sync.ts`
- **Verification:** `yarn typecheck` exits 0
- **Committed in:** `2741f3df2` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — type compatibility bug)
**Impact on plan:** Fix was necessary for TypeScript correctness. No scope creep.

## Issues Encountered

- Pre-existing test failures in `ItemRowActions.test.ts` (2 tests) — confirmed pre-existing before any of these changes via git stash verification. Not caused by this plan. Logged as deferred.

## Known Stubs

None — all wiring is functional. The reconnect-resume loop is fully operational.

## Threat Mitigations Applied

| Threat ID | Component | Mitigation |
|-----------|-----------|------------|
| T-09C-01 | sync.ts — REPLAY_START gap check | `typeof payload?.retentionStart === 'number' && retentionStart > lastAckedSeq + 1` — null/undefined retentionStart does NOT trigger resumeViaChanges |
| T-09C-02 | sync.ts — AppState foreground handler | `apiSocket.disconnect()` called before `apiSocket.connect()` unconditionally (line 409) |
| T-09C-03 | sync.ts — background ack flush | `flushAckUpdateNow` + `saveLastAckedSeq` both in the same try/catch block; MMKV.set is synchronous |
| T-09C-04 | sync.ts — resumeViaChangesDeduped | `runWithInFlightDedupe` prevents concurrent HTTP catch-up requests; `resumeViaChangesInFlight` reset to null on replay-complete |
| T-09C-05 | pendingQueueV2.ts — replay gate | Gate is `await replayGate.waitForReplayComplete()` INSIDE `runPendingEnqueueCommitInOrder` — NOT early return; commits stay in chain |
| T-09C-06 | sync.ts — isReplaying cleared only on REPLAY_COMPLETE | `replayGate.isReplaying = false` only in REPLAY_COMPLETE listener — confirmed by grep: exactly 1 match |

## Threat Flags

None — no new security-relevant surface introduced beyond what is specified in the plan's threat model.

## Next Phase Readiness

- All 10 MOB requirements (MOB-01..MOB-10) are now implemented and tested
- Phase 09 is complete — the full reconnect-resume loop is operational on the mobile client
- `yarn test --run sources/sync/engine/resilience/` exits 0 (36 tests GREEN)
- `yarn typecheck` exits 0
- Validation phase (if planned) can begin immediately

## Self-Check: PASSED

- `ec4566e18` — found in git log
- `2741f3df2` — found in git log
- `apps/ui/sources/sync/sync.ts` — contains SOCKET_RESILIENCE_EVENTS import, replayGate field, waitForReplayComplete method, REPLAY_COMPLETE listener, flushAckUpdateNow call, apiSocket.disconnect() in foreground handler
- `apps/ui/sources/sync/engine/pending/pendingQueueV2.ts` — contains replayGate parameter and gate check inside runPendingEnqueueCommitInOrder
- All 36 resilience tests GREEN, all 6 apiSocket.reconnectSemantics tests GREEN, typecheck exits 0

---
*Phase: 09-mobile-reconnect-and-deduplication*
*Completed: 2026-04-22*
