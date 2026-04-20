---
phase: 05-verify-end-to-end-behavior
reviewed: 2026-04-20T00:00:00Z
depth: standard
files_reviewed: 1
files_reviewed_list:
  - apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.baselineTurnCompletion.test.ts
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 05: Code Review Report

**Reviewed:** 2026-04-20T00:00:00Z
**Depth:** standard
**Files Reviewed:** 1
**Status:** issues_found

## Summary

The single file reviewed is a Vitest test suite covering baseline turn-completion behavior (`TURN-06`) for `claudeRemoteAgentSdk`. The tests are purposely narrow: a "bare result" case and a "two-subagent + result" case. No security issues were found. Two warnings concern missing test reliability guards (no assertion on `onReady` call argument content and a shared mutable closure in `makeNextMessage` that is not reset between invocations). Three info items flag style/quality observations including `as any` casts, a magic-number literal, and a test description inconsistency with the header comment scope.

Cross-referencing with the sibling test file `claudeRemoteAgentSdk.subagentTurnCompletion.test.ts` reveals that `makeNextMessage` and the query factory pattern are duplicated verbatim across both suites — both warnings and the `as any` info item apply there too, but those files are outside this review's scope.

---

## Warnings

### WR-01: `makeNextMessage` closure captures mutable state across reuse — if ever shared, tests would silently interfere

**File:** `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.baselineTurnCompletion.test.ts:36`
**Issue:** `makeNextMessage` returns a vi.fn() whose inner `didSendFirst` flag is closed over by the factory call. Each test correctly calls `makeNextMessage()` separately, so there is no current bug. However the factory is defined at the describe-block scope rather than inside each `it`, meaning a future reader might be tempted to hoist the call and share the instance — which would break the second test silently because `didSendFirst` would already be `true`. The current pattern is fragile: if a test helper is defined at describe scope it should be stateless or explicitly reset.
**Fix:** Either inline the factory call inside each test's `it` block, or make `makeNextMessage` stateless by accepting a `firstMessage` arg and having Vitest's `beforeEach` call it:

```typescript
// Option A: inline (minimal change)
it('TURN-06 baseline: ...', async () => {
    const nextMessage = makeNextMessage();   // <-- call per test, already done correctly
    ...
});

// Option B: make the flag reset-safe by wrapping in beforeEach
let nextMessage: ReturnType<typeof makeNextMessage>;
beforeEach(() => {
    nextMessage = makeNextMessage();
});
```

The code is already safe but the structure should make this explicit. A comment on the helper explaining "must be called once per test" would also be acceptable.

### WR-02: `TURN-06 multi-subagent` test does not verify `onReady` is called after both `onSubagentFlush` calls

**File:** `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.baselineTurnCompletion.test.ts:88`
**Issue:** The test at line 88 checks that `onReady` was called once and `onSubagentFlush` was called twice, but it does not verify ordering. If `onReady` fires before all `onSubagentFlush` invocations complete (or fires concurrently rather than after both flushes), the test still passes. The specification intent (flush all subagents first, then signal ready) is not enforced by the assertion.
**Fix:** Track invocation order with a shared call log:

```typescript
it('TURN-06 multi-subagent: ...', async () => {
    const callOrder: string[] = [];
    const onReady = vi.fn(() => { callOrder.push('onReady'); });
    const onSubagentFlush = vi.fn(async () => { callOrder.push('onSubagentFlush'); });

    await claudeRemoteAgentSdk({ ..., onReady, onSubagentFlush, ... } as any);

    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onSubagentFlush).toHaveBeenCalledTimes(2);
    // Ordering guarantee: both flushes must precede the ready signal
    expect(callOrder).toEqual(['onSubagentFlush', 'onSubagentFlush', 'onReady']);
});
```

---

## Info

### IN-01: Pervasive `as any` casts hide type errors at test boundaries

**File:** `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.baselineTurnCompletion.test.ts:16,62,86`
**Issue:** The query mock (line 16), and the two `claudeRemoteAgentSdk({ ... } as any)` call sites (lines 62, 86) all use `as any`. This suppresses TypeScript's ability to flag mismatches between the mock shape and the real `AgentSdkQueryType`, and between the partial opts object and the real parameter type. If the production signature evolves, these tests will continue to compile and may silently test the wrong contract.
**Fix:** Prefer typed partial mocks. The query mock should match the interface shape — either import and satisfy `AgentSdkQueryType` explicitly, or use `Partial<...>` with a cast only at the boundary. For `claudeRemoteAgentSdk`, the opts cast can be replaced with a typed helper that fills required fields with safe defaults:

```typescript
// Example: typed opts helper
function makeBaselineOpts(overrides: Partial<Parameters<typeof claudeRemoteAgentSdk>[0]>): Parameters<typeof claudeRemoteAgentSdk>[0] {
    return {
        sessionId: null,
        transcriptPath: null,
        path: '/tmp',
        claudeArgs: [],
        claudeExecutablePath: '/tmp/claude',
        canCallTool: async () => ({ behavior: 'allow', updatedInput: {} }),
        isAborted: () => false,
        nextMessage: makeNextMessage(),
        onReady: vi.fn(),
        onSubagentFlush: vi.fn(),
        onSessionFound: () => {},
        onMessage: () => {},
        ...overrides,
    };
}
```

### IN-02: Magic number `2` in `makeBaselineQuery(2, true)` call

**File:** `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.baselineTurnCompletion.test.ts:85`
**Issue:** The literal `2` is the subagent count used to assert `onSubagentFlush` was called twice. The number is meaningful (it is the exact count matched in the assertion on line 89), but there is no named constant tying these two together. If the test intent changes, the reader must update both the call and the assertion independently.
**Fix:** Extract a named constant:

```typescript
const SUBAGENT_COUNT = 2;
// ...
createQuery: makeBaselineQuery(SUBAGENT_COUNT, true),
// ...
expect(onSubagentFlush).toHaveBeenCalledTimes(SUBAGENT_COUNT);
```

### IN-03: Header comment scope mismatch — `TURN-06 multi-subagent` is partially covered by `TEST-02` note

**File:** `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.baselineTurnCompletion.test.ts:4-8`
**Issue:** The file header (lines 4-8) says "SC-2 (1× subagent + parent → onReady exactly once) is covered by TEST-02 in the subagentTurnCompletion test — no duplication here." The `TURN-06 multi-subagent` test in this file uses **two** subagents, so the comment is technically accurate. However, the line "TURN-06 multi-subagent: Verify that two task_notification events + result calls onReady once, onSubagentFlush twice" in the header at line 5 does not call out that the distinction from SC-2 is the **count** of subagents (2 vs 1), making the rationale for this file's second test unclear to a new reader.
**Fix:** Clarify the header to make the distinction explicit:

```typescript
//   - TURN-06 multi-subagent (N=2): Verify that two task_notification events + result calls
//     onReady once and onSubagentFlush twice. This is the multi-subagent variant;
//     SC-2 (1 subagent + parent) is covered separately in subagentTurnCompletion.test.ts.
```

---

_Reviewed: 2026-04-20T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
