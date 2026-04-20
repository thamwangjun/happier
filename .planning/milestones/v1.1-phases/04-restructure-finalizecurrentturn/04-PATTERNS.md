# Phase 4: Restructure finalizeCurrentTurn() - Pattern Map

**Mapped:** 2026-04-19
**Files analyzed:** 3 (2 modified, 1 created)
**Analogs found:** 3 / 3

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.ts` | service (closure) | event-driven | `apps/cli/src/backends/codex/appServer/runtime.ts` (`finalizeSyntheticSubagentThread`) | exact-intent |
| `apps/cli/src/backends/claude/claudeRemoteLauncher.ts` | service (wiring) | request-response | itself — `onReady` wiring at line 992 | self-analog |
| `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.subagentTurnCompletion.test.ts` | test | event-driven | `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.optionsAndHooks.test.ts` | exact |

---

## Pattern Assignments

### `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.ts` (service closure, event-driven)

**Change:** Replace `finalizeCurrentTurn(params?)` with two named closures; add `onSubagentFlush?` to opts type; update `task_notification` call site.

**Analog for the subagent function:** `apps/cli/src/backends/codex/appServer/runtime.ts` lines 397–401

**Codex reference — subagent-path flush, no ready notification** (lines 397–401):
```typescript
const finalizeSyntheticSubagentThread = async (threadId: string, status: 'completed' | 'interrupted'): Promise<void> => {
    await ensureSyntheticSubagentThread(threadId);
    await itemTranscriptBridge.flushAll({ reason: 'tool-call-boundary' });
    syntheticSubagentTracker.finalize({ threadId, status });
};
// Note: Does NOT call any ready/notify handler — subagent-path flush only
```

**Current `finalizeCurrentTurn` to split** (lines 1158–1181):
```typescript
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

**Target: `finalizeCurrentTurn` (parent path — all existing logic unchanged, D-04/D-05):**
```typescript
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

**Target: `finalizeSubagentTurn` (subagent path — bookkeeping + flush only, D-06/D-07/D-08):**
```typescript
const finalizeSubagentTurn = async () => {
    activeTaskId = null;
    updateThinking(false);
    const interruptedReason = deferredInterruptedReason;
    deferredInterruptedReason = null;
    await flushStreamedTranscriptWriter('turn-end');
    logger.debug('[claudeRemoteAgentSdk] Subagent turn summary', {
        ...turnDiagnostics,
        didPublishAssistantTextThisTurn,
    });
    resetTurnDiagnostics();
    await opts.onSubagentFlush?.();
};
```

Key differences from `finalizeCurrentTurn`:
- No `didFinalizeTurn` guard (D-07)
- No `didFinalizeTurn = true` or `awaitingNextTurnStart = true` (D-07)
- Always uses `'turn-end'` for flush reason, even if `interruptedReason` was set — still clears `deferredInterruptedReason` to prevent leak into parent turn (D-06, open question resolved)
- Calls `opts.onSubagentFlush?.()` instead of `opts.onReady()` (D-09/D-10)
- No `scheduleNextMessagePump()` (D-06)

**Opts interface addition** (near line 104, after `onReady`):
```typescript
onReady: () => void | Promise<void>;
onSubagentFlush?: () => Promise<void>;  // called by finalizeSubagentTurn(); optional
```

**`task_notification` call site update** (lines 1529–1538 → change line 1536):
```typescript
} else if (subtype === 'task_notification') {
    const taskId = (system as any).task_id;
    const status = (system as any).status;
    if (typeof taskId === 'string' && taskId === activeTaskId) {
        activeTaskId = null;
    }
    if (status === 'stopped' || status === 'failed' || status === 'completed') {
        await finalizeSubagentTurn();  // CHANGED from finalizeCurrentTurn()
    }
}
```

**`result` handler call sites** (lines 1597–1607 — unchanged):
```typescript
if (didFinalizeTurn) {
    continue;
}

if (isCompactCommand) {
    isCompactCommand = false;
    await finalizeCurrentTurn({ completionEvent: 'Compaction completed' });
    continue;
}

await finalizeCurrentTurn();
```

**Anti-patterns to avoid (from RESEARCH.md):**
- Do NOT set `didFinalizeTurn = true` in `finalizeSubagentTurn()` — breaks TEST-02
- Do NOT call `opts.onReady()` from `finalizeSubagentTurn()` — this is the bug being fixed
- Do NOT add a guard `if (opts.onSubagentFlush)` before defining the function — use optional chaining `opts.onSubagentFlush?.()` at the call site (D-10)

---

### `apps/cli/src/backends/claude/claudeRemoteLauncher.ts` (service wiring, request-response)

**Change:** Add `onSubagentFlush` alongside the existing `onReady` in the opts object passed to `claudeRemoteAgentSdk`. No other launcher changes.

**Analog:** The existing `onReady` wiring in the same file, lines 992–995.

**Current `onReady` wiring** (lines 992–995):
```typescript
onReady: async () => {
    await messageQueue.flush();
    readyHandler();
},
```

**Target — add `onSubagentFlush` directly after `onReady` (D-12):**
```typescript
onReady: async () => {
    await messageQueue.flush();
    readyHandler();
},
onSubagentFlush: async () => {
    await messageQueue.flush();
},
```

Pattern notes:
- `onSubagentFlush` has the same shape as `onReady`: `async () => Promise<void>` (D-09)
- Calls `messageQueue.flush()` but does NOT call `readyHandler()` — that is the entire point
- `messageQueue` is already in scope at this call site (line 351 in launcher)
- The existing `onReady` lambda is unchanged (D-12)

---

### `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.subagentTurnCompletion.test.ts` (test, event-driven)

**Analog:** `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.optionsAndHooks.test.ts`

**Imports pattern** (lines 1–8 of analog):
```typescript
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { configuration } from '@/configuration';
import { claudeRemoteAgentSdk } from './claudeRemoteAgentSdk';
import { makeMode } from './claudeRemoteAgentSdk.testkit';
```

New test file needs only a subset — no filesystem helpers or `configuration` are required:
```typescript
import { describe, expect, it, vi } from 'vitest';
import { claudeRemoteAgentSdk } from './claudeRemoteAgentSdk';
import { makeMode } from './claudeRemoteAgentSdk.testkit';
```

**`createQuery` mock factory pattern** (from analog, repeated in every test):
```typescript
const createQuery = vi.fn((_params: any) => {
    return {
        async *[Symbol.asyncIterator]() {
            yield { type: 'result' } as any;
        },
        close: vi.fn(),
        setPermissionMode: vi.fn(),
        setModel: vi.fn(),
        setMaxThinkingTokens: vi.fn(),
        supportedCommands: vi.fn(async () => []),
        supportedModels: vi.fn(async () => []),
    } as any;
});
```

For subagent tests, the iterator must yield `task_started` before `task_notification` (Pitfall 1 in RESEARCH.md):
```typescript
async *[Symbol.asyncIterator]() {
    yield { type: 'system', subtype: 'task_started', task_id: 'task_1' } as any;
    yield { type: 'system', subtype: 'task_notification', task_id: 'task_1', status: 'completed' } as any;
    // no 'result' — subagent-only sequence (TEST-01, TEST-03 subagent half)
},
```

**`nextMessage` mock pattern** (from analog, lines 59–64):
```typescript
let didSendFirst = false;
const nextMessage = vi.fn(async () => {
    if (didSendFirst) return null;
    didSendFirst = true;
    return { message: 'hello', mode: makeMode({ permissionMode: 'default' } as any) };
});
```

**`claudeRemoteAgentSdk` invocation pattern** (minimal opts, from analog lines 66–80):
```typescript
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
    onSubagentFlush,    // ADD for new tests
    onSessionFound: () => {},
    onMessage: () => {},
    createQuery,
} as any);
```

**Assertion patterns** (from analog):
```typescript
expect(fn).not.toHaveBeenCalled();
expect(fn).toHaveBeenCalledTimes(1);
expect(fn).toHaveBeenCalledTimes(2);
```

**`streamedTranscriptWriter` mock for TEST-03** (pattern from analog line 320–329):
```typescript
const streamedTranscriptWriter = {
    appendAssistantDelta: vi.fn(async () => {}),
    appendThinkingDelta: vi.fn(async () => {}),
    overrideAssistantText: vi.fn(() => false),
    overrideThinkingText: vi.fn(() => false),
    flushAll: vi.fn(async () => {}),
};
```
Pass as `streamedTranscriptWriter` in the opts object (not typed strictly — use `as any` cast).

**TEST-01 target behavior:**
- Sequence: `task_started` → `task_notification(completed)` (no `result`)
- Assert: `onReady` not called; `onSubagentFlush` called once

**TEST-02 target behavior:**
- Sequence: `task_started` → `task_notification(completed)` → `result`
- Assert: `onReady` called exactly once; `onSubagentFlush` called exactly once

**TEST-03 target behavior:**
- Run subagent-only sequence: assert `streamedTranscriptWriter.flushAll` called once
- Run subagent + parent sequence: assert `streamedTranscriptWriter.flushAll` called twice

**Critical pitfall for TEST-02:** The `result` handler at line 1597 has `if (didFinalizeTurn) { continue; }`. If `finalizeSubagentTurn()` incorrectly sets `didFinalizeTurn = true`, `onReady` never fires and TEST-02 fails with call count = 0.

**vi.hoisted + vi.mock pattern** (from analog lines 12–18 — only needed if mocking module-level side effects):
```typescript
const { ensureJavaScriptRuntimeExecutableMock } = vi.hoisted(() => ({
    ensureJavaScriptRuntimeExecutableMock: vi.fn(async () => '/managed/js-runtime'),
}));

vi.mock('@/runtime/js/ensureJavaScriptRuntimeExecutable', () => ({
    ensureJavaScriptRuntimeExecutable: ensureJavaScriptRuntimeExecutableMock,
}));
```
The new test file does not need this — it does not test JS runtime resolution. Omit `vi.mock` and `vi.hoisted` unless a test requires a specific module mock.

---

## Shared Patterns

### Opts object / callback threading
**Source:** `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.ts` lines 68–130 (opts type definition); line 104 (`onReady` declaration)
**Apply to:** Both the opts type addition (`onSubagentFlush?`) and the launcher wiring
```typescript
// All async callbacks follow this shape:
onReady: () => void | Promise<void>;
onSubagentFlush?: () => Promise<void>;
```
Optional callbacks use `?.()` at the call site — never a guard `if (opts.onSubagentFlush)`.

### Optional chaining for optional callbacks
**Source:** `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.ts` line 1177
**Apply to:** `finalizeSubagentTurn` implementation
```typescript
opts.onCompletionEvent?.(params.completionEvent);
// Pattern: opts.onSubagentFlush?.()
```

### `vi.fn(async () => {})` for async callback mocks
**Source:** `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.optionsAndHooks.test.ts` (throughout)
**Apply to:** `onReady` and `onSubagentFlush` in all new tests
```typescript
const onReady = vi.fn(async () => {});
const onSubagentFlush = vi.fn(async () => {});
```

### `as any` cast on opts
**Source:** Every `claudeRemoteAgentSdk(...)` call in `claudeRemoteAgentSdk.optionsAndHooks.test.ts` (e.g. line 79)
**Apply to:** All new test invocations
```typescript
} as any);
```
This allows tests to pass partial opts without satisfying the full type, and means adding `onSubagentFlush?` to opts will not break existing tests (Pitfall 5 in RESEARCH.md).

### Closure-local state access
**Source:** `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.ts` — all state variables captured by `finalizeCurrentTurn` closure
**Apply to:** `finalizeSubagentTurn` — it is a sibling closure and shares the same captured vars
Variables shared across both functions: `activeTaskId`, `deferredInterruptedReason`, `updateThinking`, `flushStreamedTranscriptWriter`, `logger`, `turnDiagnostics`, `didPublishAssistantTextThisTurn`, `resetTurnDiagnostics`
Variables used ONLY by `finalizeCurrentTurn` (must NOT appear in `finalizeSubagentTurn`): `didFinalizeTurn`, `awaitingNextTurnStart`, `opts.onReady`, `scheduleNextMessagePump`

---

## No Analog Found

None. All three files have close analogs in the codebase.

---

## Metadata

**Analog search scope:** `apps/cli/src/backends/claude/remote/`, `apps/cli/src/backends/codex/appServer/`, `apps/cli/src/backends/claude/`
**Files scanned:** 5 (claudeRemoteAgentSdk.ts, claudeRemoteAgentSdk.optionsAndHooks.test.ts, claudeRemoteAgentSdk.testkit.ts, claudeRemoteLauncher.ts, codex/appServer/runtime.ts)
**Pattern extraction date:** 2026-04-19
