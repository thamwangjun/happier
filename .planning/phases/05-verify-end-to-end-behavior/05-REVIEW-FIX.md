---
phase: 05-verify-end-to-end-behavior
fixed_at: 2026-04-20T07:23:37Z
review_path: .planning/phases/05-verify-end-to-end-behavior/05-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 05: Code Review Fix Report

**Fixed at:** 2026-04-20T07:23:37Z
**Source review:** .planning/phases/05-verify-end-to-end-behavior/05-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 2
- Fixed: 2
- Skipped: 0

## Fixed Issues

### WR-01: `makeNextMessage` closure captures mutable state across reuse

**Files modified:** `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.baselineTurnCompletion.test.ts`
**Commit:** 7198fd9ab
**Applied fix:** Added a two-line comment above `makeNextMessage` explaining that it must be called once per test because the returned function closes over mutable `didSendFirst` state — sharing one instance across tests would silently corrupt the second test.

### WR-02: `TURN-06 multi-subagent` test does not verify `onReady` is called after both `onSubagentFlush` calls

**Files modified:** `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.baselineTurnCompletion.test.ts`
**Commit:** 7198fd9ab
**Applied fix:** Added a `callOrder: string[]` array in the multi-subagent test. `onReady` and `onSubagentFlush` mocks now push their names into `callOrder` when invoked. Added assertion `expect(callOrder).toEqual(['onSubagentFlush', 'onSubagentFlush', 'onReady'])` with a comment "Ordering guarantee: both flushes must precede the ready signal". This enforces the specification intent that all subagent flushes complete before the ready signal fires.

---

_Fixed: 2026-04-20T07:23:37Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
