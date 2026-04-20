# Phase 5: Verify End-to-End Behavior - Pattern Map

**Mapped:** 2026-04-20
**Files analyzed:** 1 new file (+ 1 planning artifact)
**Analogs found:** 1 / 1

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.baselineTurnCompletion.test.ts` | test | event-driven | `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.subagentTurnCompletion.test.ts` | exact |
| `.planning/phases/05-verify-end-to-end-behavior/05-VERIFICATION.md` | planning artifact | — | `.planning/phases/04-two-function-split/04-VERIFICATION.md` | role-match |

---

## Pattern Assignments

### `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.baselineTurnCompletion.test.ts` (test, event-driven)

**Analog:** `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.subagentTurnCompletion.test.ts`

**Imports pattern** (lines 1-13 of analog):
```typescript
// File header comment block explaining responsibilities and test IDs
// Tests for <X> behavior in claudeRemoteAgentSdk.
//
// Responsibilities:
//   - TEST-XX: ...
//
// These tests are RED (failing) until ...

import { describe, expect, it, vi } from 'vitest';
import { claudeRemoteAgentSdk } from './claudeRemoteAgentSdk';
import { makeMode } from './claudeRemoteAgentSdk.testkit';
```

**Query factory pattern** (lines 15-31 of analog — `makeSubagentQuery`):
```typescript
function makeSubagentQuery(includeResult: boolean) {
    return vi.fn((_params: any) => ({
        async *[Symbol.asyncIterator]() {
            yield { type: 'system', subtype: 'task_started', task_id: 'task_1' } as any;
            yield { type: 'system', subtype: 'task_notification', task_id: 'task_1', status: 'completed' } as any;
            if (includeResult) {
                yield { type: 'result' } as any;
            }
        },
        close: vi.fn(),
        setPermissionMode: vi.fn(),
        setModel: vi.fn(),
        setMaxThinkingTokens: vi.fn(),
        supportedCommands: vi.fn(async () => []),
        supportedModels: vi.fn(async () => []),
    } as any));
}
```

For the new file, the factory is parameterised by `taskCount` (integer) and `includeResult` (boolean). The loop runs `for (let i = 1; i <= taskCount; i++)` so `taskCount: 0` produces zero task events — correct for the SC-3 baseline test.

**New factory shape** (from RESEARCH.md §Pattern 1):
```typescript
function makeBaselineQuery(taskCount: number, includeResult: boolean) {
    return vi.fn((_params: any) => ({
        async *[Symbol.asyncIterator]() {
            for (let i = 1; i <= taskCount; i++) {
                yield { type: 'system', subtype: 'task_started', task_id: `task_${i}` } as any;
                yield { type: 'system', subtype: 'task_notification', task_id: `task_${i}`, status: 'completed' } as any;
            }
            if (includeResult) {
                yield { type: 'result' } as any;
            }
        },
        close: vi.fn(),
        setPermissionMode: vi.fn(),
        setModel: vi.fn(),
        setMaxThinkingTokens: vi.fn(),
        supportedCommands: vi.fn(async () => []),
        supportedModels: vi.fn(async () => []),
    } as any));
}
```

**`makeNextMessage` single-pump factory** (lines 33-40 of analog):
```typescript
function makeNextMessage() {
    let didSendFirst = false;
    return vi.fn(async () => {
        if (didSendFirst) return null;
        didSendFirst = true;
        return { message: 'hello', mode: makeMode({ permissionMode: 'default' } as any) };
    });
}
```

**SDK invocation pattern with `as any` cast** (lines 47-61 of analog):
```typescript
await claudeRemoteAgentSdk({
    sessionId: null,
    transcriptPath: null,
    path: '/tmp',
    claudeArgs: [],
    claudeExecutablePath: '/tmp/claude',
    canCallTool: async () => ({ behavior: 'allow', updatedInput: {} }),
    isAborted: () => false,
    nextMessage: makeNextMessage(),
    onReady,
    onSubagentFlush,
    onSessionFound: () => {},
    onMessage: () => {},
    createQuery,
} as any);
```

**Assertion pattern** (lines 63-64 and 88-89 of analog):
```typescript
// For baseline (no subagent):
expect(onReady).toHaveBeenCalledTimes(1);
expect(onSubagentFlush).not.toHaveBeenCalled();

// For multi-subagent (two subagents + parent result):
expect(onReady).toHaveBeenCalledTimes(1);
expect(onSubagentFlush).toHaveBeenCalledTimes(2);
```

**Test block structure for the two it() blocks:**

- `it('TURN-06 baseline: bare result event (no subagent) calls onReady exactly once', ...)`
  - Call: `makeBaselineQuery(0, true)` — zero task loops, then `result`
  - Assert: `onReady` called 1×, `onSubagentFlush` not called

- `it('TURN-06 multi-subagent: two task_notifications then result calls onReady once, onSubagentFlush twice', ...)`
  - Call: `makeBaselineQuery(2, true)` — two task pairs then `result`
  - Assert: `onReady` called 1×, `onSubagentFlush` called 2×

---

### `.planning/phases/05-verify-end-to-end-behavior/05-VERIFICATION.md` (planning artifact)

**Analog:** `.planning/phases/04-two-function-split/04-VERIFICATION.md` (or similar phase verification artifact)

**Content shape:** Prose document citing exact line numbers in production code for SC-1 static verification.

Key citations to include (verified from `claudeRemoteAgentSdk.ts`):
- Line 1169: `const finalizeCurrentTurn = async (params?: { completionEvent?: string }) => {` — parent path; calls `opts.onReady()` at line 1190
- Line 1194: `const finalizeSubagentTurn = async () => {` — subagent-only path; calls `opts.onSubagentFlush?.()` at line 1205; does NOT call `onReady`
- Line 1554: `} else if (subtype === 'task_notification') {` — branch entry
- Line 1561: `await finalizeSubagentTurn();` — `task_notification` routes to subagent finalizer only
- Line 1632: `await finalizeCurrentTurn();` — `result` event routes to current-turn finalizer only

---

## Shared Patterns

### `makeMode` import from testkit
**Source:** `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.testkit.ts` (line 1-8)
**Apply to:** `claudeRemoteAgentSdk.baselineTurnCompletion.test.ts`
```typescript
import { makeMode } from './claudeRemoteAgentSdk.testkit';
```
`makeMode` returns `{ permissionMode: 'default', ...overrides }` — required for the `nextMessage` pump return value.

### `vi.fn()` mock pattern
**Source:** `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.subagentTurnCompletion.test.ts` (lines 43-44, 68-69)
**Apply to:** All callbacks in the new test file (`onReady`, `onSubagentFlush`)
```typescript
const onReady = vi.fn();
const onSubagentFlush = vi.fn();
```

### `as any` cast on SDK options
**Source:** `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.subagentTurnCompletion.test.ts` (line 61)
**Apply to:** Every `claudeRemoteAgentSdk({...} as any)` call in the new file
Avoids needing to satisfy exhaustive opts typing in test context. All sibling test files use this same cast.

### Vitest run command
**Source:** `apps/cli/vitest.config.ts` (pattern `src/**/*.test.ts`, pool `forks`)
**Quick run:** `yarn workspace @happier-dev/cli test:unit -- src/backends/claude/remote/claudeRemoteAgentSdk.baselineTurnCompletion.test.ts`
**Full suite:** `yarn workspace @happier-dev/cli test:unit`

---

## No Analog Found

None — the single new test file has an exact analog in the sibling `subagentTurnCompletion.test.ts`.

---

## Production Code Reference (read-only — do not modify)

Key lines in `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.ts` verified during pattern mapping:

| Line | Content | Relevance |
|------|---------|-----------|
| 1169 | `const finalizeCurrentTurn = async (params?: { completionEvent?: string }) => {` | Parent finalizer definition |
| 1170 | `if (didFinalizeTurn) return;` | Guard — prevents double-firing |
| 1190 | `await opts.onReady();` | Only `onReady` call site in the file |
| 1194 | `const finalizeSubagentTurn = async () => {` | Subagent finalizer definition |
| 1205 | `await opts.onSubagentFlush?.();` | Only `onSubagentFlush` call site |
| 1554 | `} else if (subtype === 'task_notification') {` | Event routing branch |
| 1561 | `await finalizeSubagentTurn();` | `task_notification` → subagent path |
| 1632 | `await finalizeCurrentTurn();` | `result` → parent path |

---

## Metadata

**Analog search scope:** `apps/cli/src/backends/claude/remote/`
**Files scanned:** 15 test files in that directory + production `claudeRemoteAgentSdk.ts` + `claudeRemoteAgentSdk.testkit.ts`
**Pattern extraction date:** 2026-04-20
