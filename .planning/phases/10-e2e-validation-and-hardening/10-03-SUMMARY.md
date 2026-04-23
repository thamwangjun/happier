---
phase: 10-e2e-validation-and-hardening
plan: "03"
subsystem: testing
tags: [vitest, socket.io, resilience, e2e, prisma, migration]

# Dependency graph
requires:
  - phase: 10-e2e-validation-and-hardening
    plan: "01"
    provides: SocketCollector.on()/off() pass-through methods for custom event capture
  - phase: 09-resilience-wiring
    provides: resilienceHandler.ts reconnect-resume/replay-complete/ack-update protocol, unackedBuffer.ts read/write/ack

provides:
  - E2E test covering VALID-01 protocol assertions (reconnect-resume, replay-complete, dedup)
  - Prisma migration 20260423000000_add_unacked_message_buffer creating UnackedMessage and ClientAckState tables

affects:
  - Verifier: test file covers D-02 assertions (reconnect-resume emitted with correct lastAckedSeq, replay-complete received, no duplicate seqs)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "lastAckedSeq derivation: use outer update-event seq from deviceB.getEvents() (payload.seq), not ack.seq (inner session-message seq) — these differ and the buffer uses outer seq"
    - "REPLAY_COMPLETE as gate event (not REPLAY_START) for reconnect-resume test assertions"

key-files:
  created:
    - packages/tests/suites/core-e2e/reconnect.resilience.e2e.test.ts
    - apps/server/prisma/migrations/20260423000000_add_unacked_message_buffer/migration.sql
  modified: []

key-decisions:
  - "lastAckedSeq must be derived from the outer update-event seq in deviceB.getEvents() — ack.seq from the message handler is the inner session-message seq, which is different from the buffer key used by readBuffer"
  - "Missing Prisma migration created as a Rule 3 fix — UnackedMessage/ClientAckState were added to schema.prisma in Phase 9 but no migration SQL file was created, causing the test server to fail with table-does-not-exist errors"

patterns-established:
  - "Resilience E2E test pattern: register REPLAY_COMPLETE listener before connect(), use waitFor(replayCompleteEvents.length > 0) as gate, assert total events >= PRE_DISCONNECT + BUFFERED to rule out empty-buffer false-pass"

requirements-completed:
  - VALID-01

# Metrics
duration: 11min
completed: 2026-04-23
---

# Phase 10 Plan 03: E2E Resilience Protocol Test Summary

**reconnect.resilience.e2e.test.ts proves the full reconnect-resume loop with D-02 assertions: explicit reconnect-resume emission, replay-complete received, and zero duplicate seqs in Device B's received update stream**

## Performance

- **Duration:** 11 min
- **Started:** 2026-04-23T07:58:00Z
- **Completed:** 2026-04-23T08:09:36Z
- **Tasks:** 1
- **Files created:** 2

## Accomplishments

- Created E2E test file with all three D-02 protocol assertions passing
- Fixed missing Prisma migration so the test server's PGlite database has the UnackedMessage and ClientAckState tables
- Fixed lastAckedSeq derivation bug: server's ack.seq is inner session-message seq; the buffer uses outer update-event seq; using the wrong value caused a one-off duplicate in the replay

## Task Commits

Each task was committed atomically:

1. **Task 1: Create reconnect.resilience.e2e.test.ts** - `512bd014f` (feat)

## Files Created/Modified

- `packages/tests/suites/core-e2e/reconnect.resilience.e2e.test.ts` - New E2E test: Device B disconnects mid-stream, reconnect-resume emitted with tracked lastAckedSeq, replay-complete received, no duplicate seqs
- `apps/server/prisma/migrations/20260423000000_add_unacked_message_buffer/migration.sql` - Creates UnackedMessage and ClientAckState tables (missing migration from Phase 9 schema additions)

## Decisions Made

- `lastAckedSeq` is derived from the maximum outer update-event `seq` in `deviceB.getEvents()` rather than from `ack.seq` returned by the message handler. The `ack.seq` field in `MessageAckResponseSchema` is the inner session-message seq (1-indexed per session), while the UnackedMessage buffer uses the outer update-event seq. Using the wrong value caused the last pre-disconnect event to appear in the replay (off-by-one in the buffer filter).

- The missing Prisma migration was created inline (Rule 3 fix). The UnackedMessage and ClientAckState models were added to `schema.prisma` in Phase 9 but no migration file was ever created. The test server runs `prisma migrate deploy` against a fresh PGlite database, so these tables were absent, causing all `writeToBuffer` calls to fail with "table does not exist" warnings and all `reconnect-resume` handler calls to throw, preventing `replay-complete` from ever being emitted.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added missing Prisma migration for UnackedMessage and ClientAckState**
- **Found during:** Task 1 (Test verification — server logs showed `The table 'public.UnackedMessage' does not exist`)
- **Issue:** Phase 9 added `UnackedMessage` and `ClientAckState` to `schema.prisma` but never created a migration file. The test server uses `prisma migrate deploy` on a fresh PGlite database, so these tables were never created.
- **Fix:** Created `apps/server/prisma/migrations/20260423000000_add_unacked_message_buffer/migration.sql` with `CREATE TABLE` statements for both models matching the schema exactly, including the unique indexes.
- **Files modified:** `apps/server/prisma/migrations/20260423000000_add_unacked_message_buffer/migration.sql`
- **Verification:** Test server now applies migration; `writeToBuffer` calls succeed; `reconnect-resume` handler runs without error; `replay-complete` is emitted.
- **Committed in:** `512bd014f` (Task 1 commit)

**2. [Rule 1 - Bug] Fixed lastAckedSeq derivation: use outer update-event seq, not inner ack seq**
- **Found during:** Task 1 (Second test run — assertion `expect(uniqueSeqs.size).toBe(receivedSeqs.length)` failed: 15 unique out of 16 received)
- **Issue:** The plan's implementation guidance used `ack.seq` from `MessageAckResponseSchema` as `lastAckedSeq`. But `ack.seq` is the inner session-message seq (1-indexed), while the `UnackedMessage` buffer stores and filters by the outer update-event seq. This caused `readBuffer(userId, connectionKey, 5)` when `lastAckedSeq=5` should have been `6` (outer), replaying seq 6 (the last pre-disconnect event) as a duplicate.
- **Fix:** Changed `sendFromA` to return `void` and derived `lastAckedSeq` from the maximum outer `payload.seq` in `deviceB.getEvents()` after the pre-disconnect wait.
- **Files modified:** `packages/tests/suites/core-e2e/reconnect.resilience.e2e.test.ts`
- **Verification:** No duplicate seq 6 in replay; `uniqueSeqs.size === receivedSeqs.length` passes.
- **Committed in:** `512bd014f` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for test correctness. The migration fix was a prerequisite (blocking); the seq derivation fix was a correctness bug in the plan's guidance. No scope creep.

## Issues Encountered

- The test environment in the worktree (`/home/thamw/development/happier/happier/.claude/worktrees/agent-a2ffec2c`) has no `node_modules` and no build tools (tsc not in PATH). Test verification was performed by copying the file to the gsd workspace (`/home/thamw/gsd-workspaces/thamw-request-resilience/happier`) which has the full node_modules installation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- VALID-01 E2E test passes consistently: reconnect-resume, replay-complete, and dedup assertions all verified
- The Prisma migration is committed and will apply cleanly to all test environments

## Self-Check

Checking created files exist and commits are present.

- `packages/tests/suites/core-e2e/reconnect.resilience.e2e.test.ts` — created in worktree at commit `512bd014f`
- `apps/server/prisma/migrations/20260423000000_add_unacked_message_buffer/migration.sql` — created in worktree at commit `512bd014f`

## Self-Check: PASSED

Both files committed at `512bd014f`. Test passed twice consecutively.

---
*Phase: 10-e2e-validation-and-hardening*
*Completed: 2026-04-23*
