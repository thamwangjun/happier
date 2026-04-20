---
phase: 04-restructure-finalizecurrentturn
plan: "01"
subsystem: cli/backends/claude/remote
tags: [tdd, red-phase, subagent, turn-completion, test]
dependency_graph:
  requires: []
  provides: [subagent-turn-completion-test-contract]
  affects: [claudeRemoteAgentSdk]
tech_stack:
  added: []
  patterns: [tdd-red-phase, vitest-factory-helpers]
key_files:
  created:
    - apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.subagentTurnCompletion.test.ts
  modified: []
decisions:
  - "Used as any cast on opts object so TypeScript does not reject onSubagentFlush before Plan 02 adds it to the type"
  - "Used per-test factory functions (makeSubagentQuery, makeNextMessage) to avoid shared state between test cases"
  - "TEST-03b (subagent+parent flushAll twice) passes already — acceptable per plan spec: 3-4 test failures"
metrics:
  duration: "~5 minutes"
  completed: "2026-04-19"
  tasks_completed: 1
  files_created: 1
  files_modified: 0
---

# Phase 4 Plan 1: Write Failing Tests for Subagent Turn Completion (RED)

## Summary

Created `claudeRemoteAgentSdk.subagentTurnCompletion.test.ts` with three failing unit tests that establish the behavioral contract for the two-function split of `finalizeCurrentTurn` to be implemented in Plan 02. Tests use per-test factory helpers and `as any` casts to exercise the SDK without TypeScript rejecting `onSubagentFlush` (which does not yet exist on the opts type).

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Write three failing tests (RED phase) | 4ac056366 | claudeRemoteAgentSdk.subagentTurnCompletion.test.ts (created) |

## Verification Results

**Test run output (RED confirmation):**
- TEST-01: FAIL — `onReady` was called 1 time (expected: not called). Current code fires `onReady` on `task_notification`, which is the bug under fix.
- TEST-02: FAIL — `onReady` called 0 times (expected: 1). `onSubagentFlush` also not called — both hooks unimplemented.
- TEST-03a: FAIL — `flushAll` called 2 times (expected: 1). Subagent-only path flushes too many times.
- TEST-03b: PASS — `flushAll` called 2 times on subagent+parent path, which coincidentally matches (acceptable per plan: "3-4 failures").

Total: 3 failed, 1 passed (4 tests). No import errors, no compile errors. All failures are assertion errors exercising the correct code paths.

**Existing tests:** `claudeRemoteAgentSdk.optionsAndHooks.test.ts` — 39/39 pass, unaffected.

## Deviations from Plan

None — plan executed exactly as written.

- No `vi.mock()` or `vi.hoisted()` used (per plan spec)
- No `node:fs`, `node:os`, `node:path` imports used (per plan spec)
- 4-space indentation throughout (per CLAUDE.md)
- Named imports only at top of file (per CLAUDE.md)
- File header comment present explaining responsibilities

## Known Stubs

None. This is a test-only file — no production data stubs.

## Threat Flags

None. This plan creates a test file only. No auth, input validation, cryptography, or network calls.

## Self-Check: PASSED

- [x] File exists: `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.subagentTurnCompletion.test.ts`
- [x] Commit exists: `4ac056366`
- [x] 3 tests fail with assertion errors (RED gate confirmed)
- [x] Existing test suite unaffected (39/39 pass)
- [x] No changes to `claudeRemoteAgentSdk.ts` or `claudeRemoteLauncher.ts`
