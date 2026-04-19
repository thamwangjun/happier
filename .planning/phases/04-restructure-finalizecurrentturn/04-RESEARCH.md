# Phase 4: Restructure finalizeCurrentTurn() - Research

**Researched:** 2026-04-19
**Domain:** TypeScript closure refactoring + Vitest unit test authoring (CLI backend)
**Confidence:** HIGH

## Summary

Phase 4 is a pure TypeScript refactor within a single file (`claudeRemoteAgentSdk.ts`) plus one wiring change in `claudeRemoteLauncher.ts` and a new test file. No new libraries are needed. The existing Vitest 3.x infrastructure, `claudeRemoteAgentSdk.testkit.ts` helpers, and the `createQuery` mock pattern are sufficient to implement all three required tests.

The key implementation detail is that `finalizeCurrentTurn()` is currently a single closure with shared access to all local state variables (`didFinalizeTurn`, `awaitingNextTurnStart`, `activeTaskId`, `deferredInterruptedReason`, etc.). The refactor splits it into two closures that share the same captured state — no architectural change to the enclosing function is needed.

The CONTEXT.md decisions are locked and fully resolve all design ambiguities. This research validates that the decisions are correct relative to the actual code.

**Primary recommendation:** Follow CONTEXT.md decisions verbatim. The codebase fully supports the two-function split pattern. The only non-trivial implementation risk is correctly partitioning which state variables belong to each function — this document maps all of them.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Replace the single `finalizeCurrentTurn(params?)` with two named functions:
  - `finalizeCurrentTurn()` — parent path only. Runs all bookkeeping + turn-ready notification. No params needed.
  - `finalizeSubagentTurn()` — subagent path only. Runs bookkeeping + flush, no ready notification. No params needed.
- **D-02:** `task_notification` handler calls `finalizeSubagentTurn()`; `result` and compact handlers call `finalizeCurrentTurn()`. Call sites are unambiguous — no flag to interpret.
- **D-03:** Rationale: eliminates the Flag Argument anti-pattern. Matches the Codex `finalizeSyntheticSubagentThread` pattern already in the codebase.
- **D-04:** `finalizeCurrentTurn()` contains all existing logic unchanged: `didFinalizeTurn` guard, `didFinalizeTurn = true`, `awaitingNextTurnStart = true`, `activeTaskId = null`, `updateThinking(false)`, transcript flush, diagnostics log + reset, `opts.onCompletionEvent?.(...)`, `await opts.onReady()`, `scheduleNextMessagePump()`.
- **D-05:** `completionEvent` parameter stays on `finalizeCurrentTurn({ completionEvent? })` — only parent/compact paths ever pass it.
- **D-06:** `finalizeSubagentTurn()` runs bookkeeping only: `activeTaskId = null`, `updateThinking(false)`, consume and clear `deferredInterruptedReason`, `flushStreamedTranscriptWriter('turn-end')`, `logger.debug(...)`, `resetTurnDiagnostics()`. Then calls `await opts.onSubagentFlush?.()`.
- **D-07:** No `didFinalizeTurn` guard in `finalizeSubagentTurn()` — subagent turns are independent of parent turn state. Upstream `task_id === activeTaskId` check is the only deduplication needed.
- **D-08:** `deferredInterruptedReason` and `resetTurnDiagnostics()` both run unconditionally in `finalizeSubagentTurn()`.
- **D-09:** Add `onSubagentFlush?: () => Promise<void>` to the opts object. Called by `finalizeSubagentTurn()`. Optional — existing call sites compile without it.
- **D-10:** `onSubagentFlush` called every time `finalizeSubagentTurn()` runs — no additional guard.
- **D-11:** Accepted trade-off: one optional property added to opts (interface bloat concern noted, accepted).
- **D-12:** Wire `onSubagentFlush` in the live launcher: `onSubagentFlush: async () => { await messageQueue.flush(); }`. The existing `onReady` lambda is unchanged.
- **D-13:** Update test harnesses that build mock opts to add `onSubagentFlush` stub (prevents type errors).
- **D-14:** New file: `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.subagentTurnCompletion.test.ts`. Contains TEST-01, TEST-02, TEST-03.
- **D-15:** TDD order: write failing tests first, then implement.

### Claude's Discretion

- Whether to extract shared bookkeeping into a private helper called by both functions — not required; Phase A code is short enough to inline in each.

### Deferred Ideas (OUT OF SCOPE)

- Extract shared bookkeeping into a private helper (e.g. `runTurnBookkeeping()`) to eliminate any duplication between `finalizeCurrentTurn` and `finalizeSubagentTurn` — deferred; Phase A code is short enough to inline.
- Gate `resetTurnDiagnostics()` behind `!isSubagent` for full-turn diagnostics — flagged in Future Requirements, not in scope for Phase 4.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TURN-01 | `finalizeCurrentTurn()` accepts `isSubagent?: boolean` in params bag | **Superseded by D-01/D-02**: CONTEXT.md replaces the single-function flag approach with two separate functions. TURN-01 as written in REQUIREMENTS.md is the pre-discussion spec; the locked implementation is D-01. |
| TURN-02 | Phase A bookkeeping runs for both parent and subagent completions | Satisfied by D-04 (parent) and D-06 (subagent): `activeTaskId = null`, `updateThinking(false)`, transcript flush, diagnostics reset appear in both functions. |
| TURN-03 | Phase B notification runs only when `!isSubagent` | Satisfied by two-function split: `finalizeCurrentTurn()` contains Phase B (D-04); `finalizeSubagentTurn()` does not. |
| TURN-05 | `messageQueue.flush()` in `onReady` lambda still runs unconditionally | Satisfied by D-12: `onReady` in launcher is unchanged; `onSubagentFlush` calls `messageQueue.flush()` separately for subagent path. Both paths flush. |
| TEST-01 | Test: subagent `task_notification` does not emit a `ready` event | New test file D-14. Assert `onReady` not called when `task_notification` is the terminal message. |
| TEST-02 | Test: parent `result` after subagent completion emits exactly one `ready` event | New test file D-14. Sequence: `task_notification` → `result`; assert `onReady` called exactly once. |
| TEST-03 | Test: transcript flush (Phase A bookkeeping) runs on both subagent and parent paths | New test file D-14. Assert `streamedTranscriptWriter.flushAll` called on both paths. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Turn finalization logic | CLI daemon (closure in claudeRemoteAgentSdk.ts) | — | All state vars are local to the `claudeRemoteAgentSdk` closure; the functions must live there |
| Subagent flush callback | CLI daemon (opts interface) | Launcher wiring | The callback is threaded through opts per established project pattern |
| Message queue flush | CLI daemon (OutgoingMessageQueue) | — | `messageQueue` lives in `claudeRemoteLauncher.ts`; accessed via the `onSubagentFlush` callback |
| Ready notification | CLI daemon → relay server | — | `readyHandler()` fires push notifications to the server; must only run on parent completion |
| Unit test coverage | Test file (co-located with source) | Vitest runner | All SDK tests are co-located `.test.ts` files run by `vitest` in fork pool |

## Standard Stack

### Core (no new dependencies needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vitest | 3.x [VERIFIED: vitest.config.ts in repo] | Unit test runner | Already used for all CLI tests |
| TypeScript | 5.9.3 [VERIFIED: CLAUDE.md] | Language | Monorepo standard |

### Supporting (already in codebase)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vi.fn()` | Vitest built-in | Mock callbacks | Assert call count / call args in tests |
| `makeMode()` | testkit helper [VERIFIED: claudeRemoteAgentSdk.testkit.ts] | Build `EnhancedMode` for tests | All SDK test files import this |
| `claudeRemoteAgentSdk` | internal | The function under test | Imported directly in test files |

**Installation:** None required. All dependencies already present.

## Architecture Patterns

### Current Implementation (before refactor)

```
claudeRemoteAgentSdk() {
  // local state (closure vars)
  let didFinalizeTurn = false;       // line 857
  let awaitingNextTurnStart = false; // line 858
  let activeTaskId = null;           // line 768
  let deferredInterruptedReason = null; // line 769

  const finalizeCurrentTurn = async (params?) => {
    if (didFinalizeTurn) return;           // guard
    didFinalizeTurn = true;                // Phase B state
    awaitingNextTurnStart = true;          // Phase B state
    activeTaskId = null;                   // Phase A
    updateThinking(false);                 // Phase A
    // consume deferredInterruptedReason   // Phase A
    // flushStreamedTranscriptWriter(...)  // Phase A
    // logger.debug(turnDiagnostics)       // Phase A
    resetTurnDiagnostics();                // Phase A
    opts.onCompletionEvent?.(...)          // Phase B (conditional)
    await opts.onReady();                  // Phase B
    scheduleNextMessagePump();             // Phase B
  };

  // call sites:
  // task_notification handler -> finalizeCurrentTurn()    [subagent path]
  // result handler            -> finalizeCurrentTurn()    [parent path]
  // compact/init handler      -> finalizeCurrentTurn({completionEvent}) [parent path]
}
```

### Target Implementation (after refactor)

```
claudeRemoteAgentSdk() {
  // same local state — no change

  // PARENT PATH: all bookkeeping + ready notification
  const finalizeCurrentTurn = async (params?: { completionEvent?: string }) => {
    if (didFinalizeTurn) return;
    didFinalizeTurn = true;
    awaitingNextTurnStart = true;
    activeTaskId = null;
    updateThinking(false);
    const interruptedReason = deferredInterruptedReason;
    deferredInterruptedReason = null;
    await flushStreamedTranscriptWriter(interruptedReason ? 'abort' : 'turn-end', interruptedReason ?? undefined);
    logger.debug('[claudeRemoteAgentSdk] Turn summary', { ...turnDiagnostics, didPublishAssistantTextThisTurn });
    resetTurnDiagnostics();
    if (params?.completionEvent) opts.onCompletionEvent?.(params.completionEvent);
    await opts.onReady();
    scheduleNextMessagePump();
  };

  // SUBAGENT PATH: bookkeeping + flush, no ready notification
  const finalizeSubagentTurn = async () => {
    activeTaskId = null;
    updateThinking(false);
    const interruptedReason = deferredInterruptedReason;
    deferredInterruptedReason = null;
    await flushStreamedTranscriptWriter('turn-end');
    logger.debug('[claudeRemoteAgentSdk] Subagent turn summary', { ...turnDiagnostics, didPublishAssistantTextThisTurn });
    resetTurnDiagnostics();
    await opts.onSubagentFlush?.();
  };

  // updated call sites:
  // task_notification handler -> finalizeSubagentTurn()
  // result handler            -> finalizeCurrentTurn()
  // compact/init handler      -> finalizeCurrentTurn({completionEvent})
}
```

### Opts Interface Addition

```typescript
// In claudeRemoteAgentSdk opts type (line ~104):
onReady: () => void | Promise<void>;
onSubagentFlush?: () => Promise<void>;  // ADD: called by finalizeSubagentTurn() instead of onReady
```

### Launcher Wiring (claudeRemoteLauncher.ts ~line 992)

```typescript
// EXISTING (unchanged):
onReady: async () => {
    await messageQueue.flush();
    readyHandler();
},

// ADD alongside onReady:
onSubagentFlush: async () => {
    await messageQueue.flush();
},
```

### Recommended Project Structure
No structural changes. Files modified:
```
apps/cli/src/backends/claude/remote/
├── claudeRemoteAgentSdk.ts                              # modify: split finalizeCurrentTurn; add finalizeSubagentTurn; update call sites
├── claudeRemoteAgentSdk.subagentTurnCompletion.test.ts  # CREATE: TEST-01, TEST-02, TEST-03
└── claudeRemoteAgentSdk.testkit.ts                      # read-only: provides makeMode()

apps/cli/src/backends/claude/
└── claudeRemoteLauncher.ts                              # modify: add onSubagentFlush alongside onReady
```

### Test Pattern (from existing test files)

All existing SDK tests follow this structure — the new test file must match it exactly:

```typescript
// Source: claudeRemoteAgentSdk.optionsAndHooks.test.ts (verified)
import { afterEach, describe, expect, it, vi } from 'vitest';
import { claudeRemoteAgentSdk } from './claudeRemoteAgentSdk';
import { makeMode } from './claudeRemoteAgentSdk.testkit';

describe('claudeRemoteAgentSdk subagent turn completion', () => {
    it('TEST-01: does not call onReady when task_notification is the terminal event', async () => {
        const onReady = vi.fn(async () => {});
        const onSubagentFlush = vi.fn(async () => {});

        const createQuery = vi.fn(() => ({
            async *[Symbol.asyncIterator]() {
                yield { type: 'system', subtype: 'task_started', task_id: 'task_1' } as any;
                yield { type: 'system', subtype: 'task_notification', task_id: 'task_1', status: 'completed' } as any;
                // no 'result' — subagent-only sequence
            },
            close: vi.fn(),
            setPermissionMode: vi.fn(),
            setModel: vi.fn(),
            setMaxThinkingTokens: vi.fn(),
            supportedCommands: vi.fn(async () => []),
            supportedModels: vi.fn(async () => []),
        }));

        let didSendFirst = false;
        const nextMessage = vi.fn(async () => {
            if (didSendFirst) return null;
            didSendFirst = true;
            return { message: 'hello', mode: makeMode({ permissionMode: 'default' } as any) };
        });

        await claudeRemoteAgentSdk({
            sessionId: null,
            transcriptPath: null,
            path: '/tmp',
            claudeArgs: [],
            claudeExecutablePath: '/tmp/claude',
            canCallTool: async () => ({ behavior: 'allow', updatedInput: {} }),
            isAborted: () => false,
            nextMessage,
            onReady,
            onSubagentFlush,
            onSessionFound: () => {},
            onMessage: () => {},
            createQuery,
        } as any);

        expect(onReady).not.toHaveBeenCalled();
        expect(onSubagentFlush).toHaveBeenCalledTimes(1);
    });
});
```

**Critical test sequence for TEST-02 (subagent then parent):**
```typescript
// createQuery yields:
yield { type: 'system', subtype: 'task_started', task_id: 'task_1' } as any;
yield { type: 'system', subtype: 'task_notification', task_id: 'task_1', status: 'completed' } as any;
yield { type: 'result' } as any;
// expect: onReady called exactly once, onSubagentFlush called exactly once
```

**Critical test setup for TEST-03 (transcript flush on both paths):**
```typescript
const streamedTranscriptWriter = {
    appendAssistantDelta: vi.fn(async () => {}),
    appendThinkingDelta: vi.fn(async () => {}),
    overrideAssistantText: vi.fn(() => false),
    overrideThinkingText: vi.fn(() => false),
    flushAll: vi.fn(async () => {}),
};
// After subagent-only sequence: expect flushAll called once
// After subagent + parent sequence: expect flushAll called twice
```

### Anti-Patterns to Avoid

- **Placing `didFinalizeTurn = true` in `finalizeSubagentTurn()`:** The `didFinalizeTurn` flag guards the parent path only (D-07). Adding it to the subagent path would silently prevent `opts.onReady()` from ever running when a `result` message follows.
- **Calling `opts.onReady()` from `finalizeSubagentTurn()`:** This is the bug being fixed. Do not call `readyHandler` on the subagent path.
- **Adding a guard like `if (opts.onSubagentFlush)` before defining `finalizeSubagentTurn()`:** The optional chaining `opts.onSubagentFlush?.()` is the correct pattern (D-10).
- **Importing mid-code:** CLAUDE.md prohibits this. All imports at top of new test file.
- **Using `console.error` or `console.log` in test code:** CLAUDE.md prohibits console in CLI code. Vitest assertions and `vi.fn()` only.

## Solved Problems

| Problem | Build Nothing — Use Instead | Why |
|---------|-----------------------------|-----|
| Mocking async callbacks | `vi.fn(async () => {})` from Vitest | Standard pattern in all existing SDK tests |
| Building EnhancedMode for tests | `makeMode()` from testkit | Already handles all defaults; tests should not construct EnhancedMode directly |
| Verifying call count | `expect(fn).toHaveBeenCalledTimes(N)` | Vitest built-in; used throughout existing test suite |
| Mocking the query stream | `createQuery = vi.fn(...)` returning async iterator | Established pattern in optionsAndHooks.test.ts |

**Key insight:** The `createQuery` test seam is already built into `claudeRemoteAgentSdk`. Tests control exactly which messages the SDK processes by providing a custom async iterator. This is the correct mechanism for testing specific message sequences without spawning a real Claude process.

## Common Pitfalls

### Pitfall 1: `task_notification` guard: `task_id === activeTaskId`
**What goes wrong:** If a test does not yield `task_started` before `task_notification`, `activeTaskId` is null and the `task_id === activeTaskId` check fails — `finalizeSubagentTurn()` never runs, the test hangs or exits prematurely.
**Root cause:** Line 1532 in `claudeRemoteAgentSdk.ts`: `if (typeof taskId === 'string' && taskId === activeTaskId)`. The `activeTaskId` must be set first.
**Prevention:** All test sequences that test `task_notification` must yield `task_started` with the same `task_id` first.
**Warning signs:** Test passes with `onReady` uncalled, but also `onSubagentFlush` uncalled — means `finalizeSubagentTurn()` was never reached.

### Pitfall 2: `didFinalizeTurn` persists across the `result` handler
**What goes wrong:** The existing `result` handler has `if (didFinalizeTurn) { continue; }` at line 1597. If `finalizeSubagentTurn()` incorrectly sets `didFinalizeTurn = true`, the subsequent `result` message is silently skipped — `opts.onReady()` never fires.
**Root cause:** `didFinalizeTurn` is a shared closure variable. It must only be written by `finalizeCurrentTurn()`.
**Prevention:** `finalizeSubagentTurn()` must NOT touch `didFinalizeTurn` or `awaitingNextTurnStart` (D-07).
**Warning signs:** TEST-02 fails with `onReady` call count = 0.

### Pitfall 3: `task_notification` sets `activeTaskId = null` before the status check
**What goes wrong:** In the current code (lines 1532-1537), `activeTaskId = null` is set unconditionally when `task_id === activeTaskId`, then the `status` check fires `finalizeCurrentTurn()`. After refactor, `finalizeSubagentTurn()` also sets `activeTaskId = null` — there may be double-clearing but this is safe.
**Root cause:** The `task_notification` block at line 1532-1538 already clears `activeTaskId` before calling `finalizeCurrentTurn()`. After refactor, `finalizeSubagentTurn()` clears it again inside — this is harmless (null = null).
**Prevention:** Leave the `activeTaskId = null` on line 1533 in place. `finalizeSubagentTurn()` sets it again for correctness in case the outer block is refactored later.

### Pitfall 4: Test file naming
**What goes wrong:** File named with wrong suffix gets excluded by vitest config.
**Root cause:** `vitest.config.ts` includes `src/**/*.test.ts` and excludes `*.integration.test.ts`, `*.slow.test.ts`, `*.e2e.test.ts`.
**Prevention:** Use the name `claudeRemoteAgentSdk.subagentTurnCompletion.test.ts` exactly as specified in D-14.

### Pitfall 5: D-13 — missing `onSubagentFlush` stub in existing test harnesses
**What goes wrong:** After adding `onSubagentFlush?` to opts type, TypeScript strict mode may flag existing test files that construct `claudeRemoteAgentSdk` opts objects without `onSubagentFlush` — depending on whether they use `as any` cast.
**Root cause:** The field is optional (`?`), so TypeScript should not flag absence. However, test files that assert the full opts shape or validate against the type explicitly may need updating.
**Prevention:** Check all existing test files in `remote/` that call `claudeRemoteAgentSdk(...)`. Since they all use `as any` casts (verified in optionsAndHooks.test.ts), TypeScript errors are unlikely. Still, D-13 says to add the stub where relevant.

## Code Examples

### Full current `finalizeCurrentTurn` (lines 1158-1181, verified)

```typescript
// Source: apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.ts ~line 1158
const finalizeCurrentTurn = async (params?: { completionEvent?: string }) => {
    if (didFinalizeTurn) return;
    didFinalizeTurn = true;
    awaitingNextTurnStart = true;
    activeTaskId = null;
    updateThinking(false);
    const interruptedReason = deferredInterruptedReason;
    deferredInterruptedReason = null;
    if (typeof interruptedReason === 'string' && interruptedReason.trim().length > 0) {
        await flushStreamedTranscriptWriter('abort', interruptedReason);
    } else {
        await flushStreamedTranscriptWriter('turn-end');
    }
    logger.debug('[claudeRemoteAgentSdk] Turn summary', {
        ...turnDiagnostics,
        didPublishAssistantTextThisTurn,
    });
    resetTurnDiagnostics();
    if (params?.completionEvent) {
        opts.onCompletionEvent?.(params.completionEvent);
    }
    await opts.onReady();
    scheduleNextMessagePump();
};
```

### Current `onReady` wiring in launcher (lines 992-995, verified)

```typescript
// Source: apps/cli/src/backends/claude/claudeRemoteLauncher.ts ~line 992
onReady: async () => {
    await messageQueue.flush();
    readyHandler();
},
```

### Current `task_notification` call site (lines 1529-1537, verified)

```typescript
// Source: apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.ts ~line 1529
} else if (subtype === 'task_notification') {
    const taskId = (system as any).task_id;
    const status = (system as any).status;
    if (typeof taskId === 'string' && taskId === activeTaskId) {
        activeTaskId = null;
    }
    if (status === 'stopped' || status === 'failed' || status === 'completed') {
        await finalizeCurrentTurn();  // CHANGE: -> finalizeSubagentTurn()
    }
}
```

### Codex reference pattern (verified)

```typescript
// Source: apps/cli/src/backends/codex/appServer/runtime.ts ~line 397
const finalizeSyntheticSubagentThread = async (threadId: string, status: 'completed' | 'interrupted'): Promise<void> => {
    await ensureSyntheticSubagentThread(threadId);
    await itemTranscriptBridge.flushAll({ reason: 'tool-call-boundary' });
    syntheticSubagentTracker.finalize({ threadId, status });
};
// Note: Does NOT call any ready/notify handler — subagent-path flush only
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Flag argument `finalizeCurrentTurn({ isSubagent: true })` | Two named functions (D-01) | Phase 4 (this work) | Eliminates flag argument anti-pattern; matches Codex pattern |

**Deprecated/outdated:**
- `finalizeCurrentTurn(params?)` with optional `isSubagent`: The pre-discussion spec in REQUIREMENTS.md (TURN-01, TURN-04) described a flag-argument approach. CONTEXT.md superseded it with the two-function split. The flag approach is out of scope.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `task_notification` with any status other than `stopped`, `failed`, or `completed` does not trigger finalization | Code Examples (call site) | If a new status is added in future SDK, it would silently bypass finalization — LOW risk for Phase 4 |
| A2 | All existing `claudeRemoteAgentSdk` test call sites use `as any` cast, so adding optional `onSubagentFlush?` to opts won't cause TypeScript errors in existing tests | Pitfall 5 | If any test constructs opts with explicit typing, it may produce a TS error — LOW risk; easily fixed |

## Open Questions

1. **`deferredInterruptedReason` in `finalizeSubagentTurn()`**
   - What we know: D-08 says it runs unconditionally.
   - What is unclear: The current `finalizeCurrentTurn()` branches on `interruptedReason` to choose `'abort'` vs `'turn-end'` for `flushStreamedTranscriptWriter`. D-06 specifies `flushStreamedTranscriptWriter('turn-end')` for the subagent path unconditionally. This means if a subagent turn was interrupted, the flush reason will be `'turn-end'` not `'abort'`. This appears intentional (subagent aborts are not surfaced the same way).
   - Recommendation: Follow D-06 exactly — always `'turn-end'` in `finalizeSubagentTurn()`, but still consume and clear `deferredInterruptedReason` to prevent it from leaking into the parent turn.

## Environment Availability

Step 2.6: SKIPPED — Phase 4 is a pure code/config change with no external dependencies beyond the existing Node.js + Vitest infrastructure.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x [VERIFIED: vitest.config.ts] |
| Config file | `apps/cli/vitest.config.ts` |
| Quick run command | `cd apps/cli && yarn vitest run src/backends/claude/remote/claudeRemoteAgentSdk.subagentTurnCompletion.test.ts` |
| Full suite command | `cd apps/cli && yarn vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TURN-01 | Two functions compile without TypeScript errors | type-check | `cd apps/cli && yarn tsc --noEmit` | yes (tsc) |
| TURN-02 | Phase A bookkeeping runs on subagent path | unit | `yarn vitest run ...subagentTurnCompletion.test.ts` | no — Wave 0 |
| TURN-03 | Phase B notification skipped on subagent path | unit | `yarn vitest run ...subagentTurnCompletion.test.ts` | no — Wave 0 |
| TURN-05 | `messageQueue.flush()` still runs on subagent path | unit | `yarn vitest run ...subagentTurnCompletion.test.ts` | no — Wave 0 |
| TEST-01 | Subagent `task_notification` → no `ready` event | unit | `yarn vitest run ...subagentTurnCompletion.test.ts` | no — Wave 0 |
| TEST-02 | Parent `result` after subagent → exactly one `ready` | unit | `yarn vitest run ...subagentTurnCompletion.test.ts` | no — Wave 0 |
| TEST-03 | Transcript flush runs on both paths | unit | `yarn vitest run ...subagentTurnCompletion.test.ts` | no — Wave 0 |

### Sampling Rate
- **Per task commit:** `cd apps/cli && yarn vitest run src/backends/claude/remote/claudeRemoteAgentSdk.subagentTurnCompletion.test.ts`
- **Per wave merge:** `cd apps/cli && yarn vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.subagentTurnCompletion.test.ts` — covers TEST-01, TEST-02, TEST-03, TURN-02, TURN-03, TURN-05

*(All other infrastructure exists — no additional Wave 0 items)*

## Security Domain

Step 2.6 security: This phase contains no authentication, session management, input validation, cryptography, or access control changes. The refactor moves code between closures within a single file and adds one optional callback to an internal opts interface. No ASVS categories apply.

## Sources

### Primary (HIGH confidence)
- [VERIFIED: direct file read] `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.ts` lines 857-858, 768-769, 1158-1181, 1529-1538, 1597-1607 — exact current implementation
- [VERIFIED: direct file read] `apps/cli/src/backends/claude/claudeRemoteLauncher.ts` lines 351-353, 847-860, 992-995 — messageQueue construction, readyHandler, onReady wiring
- [VERIFIED: direct file read] `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.optionsAndHooks.test.ts` lines 1-130, 300-412 — established test patterns, createQuery mock pattern, task_notification sequence
- [VERIFIED: direct file read] `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.testkit.ts` — `makeMode()` helper
- [VERIFIED: direct file read] `apps/cli/src/backends/codex/appServer/runtime.ts` lines 397-401 — `finalizeSyntheticSubagentThread` reference pattern
- [VERIFIED: direct file read] `apps/cli/vitest.config.ts` — test runner config, include/exclude patterns

### Secondary (MEDIUM confidence)
- [VERIFIED: CONTEXT.md] All locked decisions (D-01 through D-15) verified against actual code — decisions are correct and implementable as specified

### Flagged for Validation (LOW confidence)
None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; all existing tooling verified
- Architecture: HIGH — implementation targets verified line-by-line against source
- Pitfalls: HIGH — identified from actual code flow, not speculation
- Test patterns: HIGH — copied from verified existing test files

**Research date:** 2026-04-19
**Valid until:** 2026-05-19 (stable internal codebase; no external library churn)
