---
phase: 04-restructure-finalizecurrentturn
plan: "02"
subsystem: cli/backends/claude/remote
tags: [tdd, green-phase, subagent, turn-completion, refactor]
dependency_graph:
  requires: [subagent-turn-completion-test-contract]
  provides: [subagent-turn-completion-split, onSubagentFlush-wiring]
  affects: [claudeRemoteAgentSdk, claudeRemoteLauncher]
tech_stack:
  added: []
  patterns: [two-function-split, flag-argument-elimination, closure-sharing]
key_files:
  created: []
  modified:
    - apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.ts
    - apps/cli/src/backends/claude/claudeRemoteLauncher.ts
decisions:
  - "Added didFlushTranscriptCleanly flag to suppress redundant runner-finalize flush when clean turn-end flush already occurred — required to make TEST-03 green without modifying test mocks"
  - "finalizeSubagentTurn does not set didFinalizeTurn so the parent result handler can still call finalizeCurrentTurn after a subagent task_notification"
  - "onSubagentFlush in launcher calls only messageQueue.flush(), not readyHandler — enforces T-04-02-02 threat mitigation"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-19"
  tasks_completed: 2
  files_created: 0
  files_modified: 2
---

# Phase 4 Plan 2: Implement Two-Function Split — finalizeCurrentTurn + finalizeSubagentTurn (GREEN)

## Summary

Implemented the two-function split of `finalizeCurrentTurn` into a parent path (`finalizeCurrentTurn`) and subagent path (`finalizeSubagentTurn`) in `claudeRemoteAgentSdk.ts`. Added `onSubagentFlush?` to the opts type and wired it in `claudeRemoteLauncher.ts`. All four tests from Plan 01 (TEST-01, TEST-02, TEST-03a, TEST-03b) now pass GREEN. TypeScript strict mode: zero errors.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Split finalizeCurrentTurn, add finalizeSubagentTurn, add onSubagentFlush to opts type | b58da232f | claudeRemoteAgentSdk.ts |
| 2 | Wire onSubagentFlush in claudeRemoteLauncher.ts | f560213a3 | claudeRemoteLauncher.ts |

## Verification Results

**Plan 01 tests — GREEN gate confirmed:**
- TEST-01: PASS — task_notification does NOT call onReady (onSubagentFlush called once)
- TEST-02: PASS — result following task_notification calls onReady exactly once
- TEST-03a: PASS — flushAll called exactly 1 time on subagent-only path
- TEST-03b: PASS — flushAll called exactly 2 times on subagent+parent path

**TypeScript:** `tsc --noEmit` exits 0, strict mode, zero errors.

**Full test suite:** 5897 passing, 6 pre-existing failures in unrelated test files (cliSnapshot, liveRemoteSshBootstrap) — confirmed pre-existing on base commit.

## Structural Invariants Confirmed

- `finalizeSubagentTurn` defined at line 1194 of claudeRemoteAgentSdk.ts
- `await finalizeSubagentTurn()` called exactly once (task_notification handler)
- `await finalizeCurrentTurn()` called exactly 3 times (result handler x2, init/compact x1) — unchanged
- `onSubagentFlush?` declared in opts type after `onReady`
- `onSubagentFlush` in launcher: calls `messageQueue.flush()` only, no `readyHandler()`
- `finalizeSubagentTurn` does NOT contain: `didFinalizeTurn`, `awaitingNextTurnStart`, `opts.onReady`, `scheduleNextMessagePump`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added didFlushTranscriptCleanly guard to prevent double-flush in finally block**
- **Found during:** Task 1 — TEST-03a was failing with `flushAll` called 2 times (expected 1) after implementing `finalizeSubagentTurn`
- **Issue:** The `finally` block in `claudeRemoteAgentSdk` unconditionally calls `flushStreamedTranscriptWriter('abort', 'runner-finalize')` as a safety net. After `finalizeSubagentTurn` flushes with `'turn-end'`, the `finally` flush adds a second call, causing TEST-03a and TEST-03b to fail (got 2/3, expected 1/2).
- **Root cause:** The real `StreamedTranscriptWriter.flushAll` is idempotent (no segments to drain on second call), but test mocks count all calls without filtering. The tests were authored expecting the `finally` flush to be skipped when a clean flush already occurred.
- **Fix:** Added `didFlushTranscriptCleanly` boolean flag to `flushStreamedTranscriptWriter`. Set to `true` on `'turn-end'` flush. Guard on `'abort'` + `interruptedReason === 'runner-finalize'`: skip if `didFlushTranscriptCleanly`. This preserves safety-net behavior for genuine abort paths while suppressing the redundant flush after clean turn completion.
- **Files modified:** `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.ts`
- **Commit:** b58da232f

## Known Stubs

None. All changes are wired production logic.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes introduced. T-04-02-02 (onSubagentFlush triggering readyHandler) is mitigated — confirmed by code and TEST-01.

## TDD Gate Compliance

- RED gate: `test(04-01)` commit exists at `4ac056366` (Plan 01)
- GREEN gate: `feat(04-02)` commits exist at `b58da232f` and `f560213a3` (this plan)
- Both gates satisfied.

## Self-Check: PASSED

- [x] File modified: `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.ts` — contains `finalizeSubagentTurn`
- [x] File modified: `apps/cli/src/backends/claude/claudeRemoteLauncher.ts` — contains `onSubagentFlush`
- [x] Commit exists: `b58da232f` (Task 1)
- [x] Commit exists: `f560213a3` (Task 2)
- [x] All 4 subagentTurnCompletion tests pass (GREEN gate)
- [x] tsc --noEmit exits 0
- [x] finalizeSubagentTurn has no didFinalizeTurn, awaitingNextTurnStart, onReady, scheduleNextMessagePump
- [x] onSubagentFlush in launcher has no readyHandler call
