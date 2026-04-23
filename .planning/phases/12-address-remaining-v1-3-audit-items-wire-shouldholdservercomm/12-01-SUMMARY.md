---
phase: 12-address-remaining-v1-3-audit-items-wire-shouldholdservercomm
plan: "01"
subsystem: ui
tags: [sync, resilience, replay-gate, pending-queue, typescript]

# Dependency graph
requires:
  - phase: 09-resilience-client-side
    provides: shouldHoldServerCommit export in replayGate.ts
provides:
  - shouldHoldServerCommit wired into production call site (pendingQueueV2.ts)
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: ["Gate predicate centralisation: use shouldHoldServerCommit(gate) instead of direct gate.isReplaying field access"]

key-files:
  created: []
  modified:
    - apps/ui/sources/sync/engine/pending/pendingQueueV2.ts

key-decisions:
  - "Replace replayGate?.isReplaying with replayGate && shouldHoldServerCommit(replayGate) — eliminates direct field access, centralises gate logic in replayGate.ts"

patterns-established:
  - "Gate predicate: call shouldHoldServerCommit(gate) at all commit-hold decision points rather than accessing isReplaying directly"

requirements-completed:
  - MOB-07

# Metrics
duration: 5min
completed: 2026-04-23
---

# Phase 12 Plan 01: Wire shouldHoldServerCommit Summary

**`shouldHoldServerCommit` wired into `pendingQueueV2.ts` commit-hold path, closing MOB-07 dead-export tech debt**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-23T13:49:00Z
- **Completed:** 2026-04-23T13:54:34Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added `import { shouldHoldServerCommit } from '../resilience/replayGate'` to `pendingQueueV2.ts`
- Replaced `replayGate?.isReplaying` with `replayGate && shouldHoldServerCommit(replayGate)` at the commit-hold decision point (line ~348)
- `waitForReplayComplete()` call preserved unchanged immediately after the condition
- TypeScript typecheck passes cleanly with zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace direct isReplaying access with shouldHoldServerCommit call** - `95ed67810` (feat)

**Plan metadata:** (pending final docs commit)

## Files Created/Modified
- `apps/ui/sources/sync/engine/pending/pendingQueueV2.ts` - Import added, if-condition updated to use shouldHoldServerCommit predicate

## Decisions Made
None - followed plan as specified. The change is a pure refactor: `gate.isReplaying === shouldHoldServerCommit(gate)` so behavior is identical, but gate logic is now centralised.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Self-Check: PASSED

- `apps/ui/sources/sync/engine/pending/pendingQueueV2.ts` — FOUND
- Commit `95ed67810` — FOUND

## Next Phase Readiness
- MOB-07 is closed — `shouldHoldServerCommit` is no longer dead code
- Ready for Phase 12 remaining plans (writeToBuffer guard, ackSeq comment cleanup, VALID-04 docs)

---
*Phase: 12-address-remaining-v1-3-audit-items-wire-shouldholdservercomm*
*Completed: 2026-04-23*
