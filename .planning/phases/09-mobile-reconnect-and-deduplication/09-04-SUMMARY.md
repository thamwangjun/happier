---
phase: 09-mobile-reconnect-and-deduplication
plan: "04"
subsystem: sync
tags: [gap-closure, MOB-02, MOB-03, dedup, ack-cursor]
dependency_graph:
  requires: [09-03]
  provides: [MOB-02-active, MOB-03-active]
  affects: [apps/ui/sources/sync/sync.ts]
tech_stack:
  added: []
  patterns: [early-return guard, debounced flush wiring]
key_files:
  modified:
    - apps/ui/sources/sync/sync.ts
decisions:
  - "shouldApplyUpdate guard placed as first statement in handleUpdate before handleSocketUpdate call, ensuring zero-cost dedup on seq=0 legacy updates"
  - "MOB-03 block appended at end of markSessionMaterializedMaxSeq after existing flush call, preserving existing guard logic unchanged"
metrics:
  duration: "~16 minutes"
  completed: "2026-04-23"
  tasks_completed: 2
  files_modified: 1
---

# Phase 9 Plan 04: Wire MOB-02/MOB-03 Gap Closure into sync.ts Summary

**One-liner:** Wired shouldApplyUpdate dedup gate and scheduleAckUpdateFlush ack-cursor tracking into sync.ts, activating MOB-02 and MOB-03 in the production message pipeline.

## What Was Built

Both `shouldApplyUpdate` (dedupFilter, MOB-02) and `scheduleAckUpdateFlush` (ackCursorManager, MOB-03) were implemented and unit-tested in plans 01-03 but were never imported into sync.ts. This plan closed the gap with two targeted additions:

1. **Task 1 (MOB-02):** Added import for `shouldApplyUpdate` and an early-return guard as the first statement in `handleUpdate`. When `container.seq > 0` and `!shouldApplyUpdate(container.seq, this.lastAckedSeq)`, the handler returns early without calling `handleSocketUpdate`. Legacy seq=0 updates bypass the guard.

2. **Task 2 (MOB-03):** Extended the `ackCursorManager` import to include `scheduleAckUpdateFlush`, and added a block at the end of `markSessionMaterializedMaxSeq` that updates `this.lastAckedSeq` and schedules a debounced ACK_UPDATE emission whenever a new seq materializes.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | 9d4fe47b2 | feat(09-04): wire shouldApplyUpdate dedup gate into handleUpdate (MOB-02) |
| Task 2 | e9d568e10 | feat(09-04): wire scheduleAckUpdateFlush + lastAckedSeq into markSessionMaterializedMaxSeq (MOB-03) |

## Verification Results

| Check | Result |
|-------|--------|
| `grep -c "shouldApplyUpdate" sync.ts` | 2 (import + call) |
| `grep -n "return; // MOB-02"` | Line 3516 match |
| `grep -c "scheduleAckUpdateFlush" sync.ts` | 2 (import + call) |
| `grep -n "this.lastAckedSeq = seq"` | Line 3684 match |
| `grep -n "MOB-03"` | Line 3682 match in markSessionMaterializedMaxSeq |
| Resilience tests (36 total) | All 36 PASS |
| New typecheck errors from this plan | 0 |

## Deviations from Plan

### Rule 3 - Worktree Environment Setup

**Found during:** Task 1 verification (running resilience tests)
**Issue:** The worktree's `apps/ui` directory had no `node_modules` symlink to the main repo's installed packages. `vitest` and `react-test-renderer` were not found; running `yarn test --run` failed with ENOENT.
**Fix:** Created symlinks for `.bin`, `react-test-renderer` in worktree's `apps/ui/node_modules/`; symlinked main repo's `packages/protocol/node_modules` into worktree; rebuilt the protocol package's `dist/` in the worktree to include the phase 09 socket resilience exports; added `@happier-dev/protocol` symlink at worktree root `node_modules/` so TypeScript module resolution picks up the worktree-built dist.
**Files modified:** Filesystem symlinks only (not committed to git — runtime worktree setup)

### Pre-existing Typecheck Errors (Out of Scope)

The full `tsc --noEmit` run produces errors in unrelated files (`voice/`, `sync.optimisticThinking.test.ts`, `react-native` type stubs). These are pre-existing across the branch and not introduced by this plan. All resilience module files and sync.ts changes from this plan typecheck cleanly (zero new errors attributable to plan 09-04).

## Known Stubs

None — all wired code calls real implementations (shouldApplyUpdate, scheduleAckUpdateFlush) that were implemented in plans 09-01 through 09-03.

## Threat Surface Scan

The dedup gate (`shouldApplyUpdate`) includes the T-09-04-01 mitigation: `container.seq > 0` guard ensures legacy seq=0 sharing updates bypass deduplication. Forged seq values from a compromised server are bounded by the existing encryption layer. No new trust boundary or network endpoint introduced.

## Self-Check

- [x] `apps/ui/sources/sync/sync.ts` modified and committed
- [x] Commit `9d4fe47b2` exists (Task 1)
- [x] Commit `e9d568e10` exists (Task 2)
- [x] 36 resilience tests pass
- [x] No new typecheck errors from this plan's changes

## Self-Check: PASSED
