# Phase 5: Verify End-to-End Behavior - Research

**Researched:** 2026-04-20
**Domain:** Vitest unit testing for turn-completion correctness in `claudeRemoteAgentSdk.ts`
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** New file: `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.baselineTurnCompletion.test.ts`
- **D-02:** Contains explicit TURN-06 baseline test: bare `result` event (no preceding `task_notification`) → `onReady` called exactly once.
- **D-03:** Same new file also contains: 2× `task_notification` (two subagents) + 1× `result` → `onReady` called exactly once, `onSubagentFlush` called exactly twice. This scenario is currently untested. Adding it to `baselineTurnCompletion.test.ts` (not `subagentTurnCompletion.test.ts`).
- **D-04:** Unit tests with mock `onReady` are sufficient for TURN-06. The relay server is downstream of `onReady` — testing that `onReady` fires exactly once is the correct boundary.
- **D-05:** Phase 5 writes its own VERIFICATION.md that re-confirms SC-1 by code inspection (cite `claudeRemoteAgentSdk.ts` line around the `task_notification` branch). Phase 5 verification is self-contained.
- **D-06:** TEST-02 in `claudeRemoteAgentSdk.subagentTurnCompletion.test.ts` already covers SC-2. No new test needed for that scenario. Phase 5 plan references TEST-02 as the SC-2 evidence.

### Claude's Discretion

- Test helper design in `baselineTurnCompletion.test.ts` (whether to share `makeBaselineQuery` factory or inline fixtures per test).

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TURN-06 | A subagent completion followed by a parent completion fires exactly one `ready` event to the relay server and mobile app | Unit test with mock `onReady` at the SDK boundary is the correct gate (D-04). SC-2 proven by TEST-02 (existing). Baseline (SC-3) and multi-subagent scenario (D-03) proven by new `baselineTurnCompletion.test.ts`. SC-1 proven by VERIFICATION.md code inspection. |

</phase_requirements>

---

## Summary

Phase 5 is a pure verification phase — no production code changes. It closes TURN-06 by (1) writing a new Vitest test file covering the baseline turn-completion path and a two-subagent scenario, and (2) producing a VERIFICATION.md that re-inspects the Phase 4 production code to confirm SC-1 statically.

The existing `claudeRemoteAgentSdk.subagentTurnCompletion.test.ts` (TEST-01, TEST-02, TEST-03) is green and covers SC-2. The new file adds the SC-3 baseline case and the currently-untested multi-subagent scenario. All tests run under the established Vitest unit suite (`yarn test:unit` in `apps/cli`) with `vi.fn()` mocks — no real I/O.

**Primary recommendation:** Write `claudeRemoteAgentSdk.baselineTurnCompletion.test.ts` with two top-level `it` blocks using a `makeBaselineQuery(taskCount, includeResult)` factory to keep fixtures DRY, then produce VERIFICATION.md citing exact line numbers confirmed by code inspection.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Turn-completion event routing (`onReady` / `onSubagentFlush`) | API / Backend (CLI daemon) | — | Logic lives in `claudeRemoteAgentSdk.ts`, executed inside the CLI daemon process |
| Ready-event delivery to relay server | API / Backend (CLI daemon) | — | `onReady()` calls `claudeRemoteLauncher.ts` `readyHandler()` which POSTs to relay |
| Test assertions for call counts | CLI unit test suite | — | Vitest + `vi.fn()` at the `claudeRemoteAgentSdk` function boundary |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | 3.2.4 | Test runner | [VERIFIED: `npx vitest --version` in apps/cli] — already the unit test runner for all SDK tests |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vi.fn()` | (vitest built-in) | Mock callbacks | Used by all existing SDK test files for `onReady`, `onSubagentFlush`, etc. |

No new dependencies are required. [VERIFIED: existing test files use only `vitest` imports]

**Installation:** None — all dependencies present.

---

## Architecture Patterns

### System Architecture Diagram

```
Test file (makeBaselineQuery factory)
        │
        │  yields: [task_started(task_N), task_notification(task_N, completed)] × N
        │           then [result]
        ▼
claudeRemoteAgentSdk(opts)          ← function under test
        │
        ├─ task_notification → finalizeSubagentTurn() → opts.onSubagentFlush?.()
        │                                                     (NO onReady)
        │
        └─ result            → finalizeCurrentTurn()  → opts.onReady()
                                                              (exactly once)
                                                              scheduleNextMessagePump()
```

### Recommended Project Structure

The new file lives alongside the other SDK test files:

```
apps/cli/src/backends/claude/remote/
├── claudeRemoteAgentSdk.ts                              (production — Phase 4 done)
├── claudeRemoteAgentSdk.testkit.ts                      (shared: makeMode)
├── claudeRemoteAgentSdk.subagentTurnCompletion.test.ts  (TEST-01/02/03 — green)
└── claudeRemoteAgentSdk.baselineTurnCompletion.test.ts  ← NEW (Phase 5)
```

### Pattern 1: `makeBaselineQuery` factory — parameterised by task count and result inclusion

**What:** A single factory function that generates a mock query yielding N `task_started`/`task_notification` pairs followed optionally by a `result` event.

**When to use:** Both test cases in the new file use this factory. It avoids duplicated inline fixtures.

**Example:**
```typescript
// Source: mirrors makeSubagentQuery pattern in claudeRemoteAgentSdk.subagentTurnCompletion.test.ts
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

### Pattern 2: Standard `claudeRemoteAgentSdk` invocation with `as any` cast

All existing tests call `claudeRemoteAgentSdk({ ... } as any)` to avoid exhaustive opts typing. The new file must follow this convention. [VERIFIED: subagentTurnCompletion.test.ts, postResultStreaming.test.ts, streamEvents.test.ts all use `as any`]

### Pattern 3: `makeNextMessage` single-pump factory

Existing tests define a local `makeNextMessage()` that returns the initial prompt once and then `null`. The new file should mirror this to satisfy the SDK's message-pump loop requirement.

**Example:**
```typescript
// Source: mirrors makeNextMessage in claudeRemoteAgentSdk.subagentTurnCompletion.test.ts
function makeNextMessage() {
    let didSendFirst = false;
    return vi.fn(async () => {
        if (didSendFirst) return null;
        didSendFirst = true;
        return { message: 'hello', mode: makeMode({ permissionMode: 'default' } as any) };
    });
}
```

### Anti-Patterns to Avoid

- **Importing `makeSubagentQuery` from the sibling test file:** Vitest test files are not importable as modules. Define `makeBaselineQuery` locally in the new file.
- **Using `taskCount: 0` for the baseline test:** The SC-3 baseline scenario has no subagent at all — the query should yield only a `result` event. Use `makeBaselineQuery(0, true)` or a separate simpler helper. [VERIFIED: `makeBaselineQuery` with `taskCount: 0` and `includeResult: true` iterates zero times through the task loop then yields `result` — correct]
- **Asserting `onSubagentFlush.not.toHaveBeenCalled()` for multi-subagent test:** The multi-subagent test expects `onSubagentFlush` called exactly twice, not zero times.

---

## Solved Problems

| Problem | Build Nothing — Use Instead | Why |
|---------|-----------------------------|-----|
| Mock function creation | `vi.fn()` (vitest built-in) | Type-safe, zero-setup, already used everywhere in this test directory |
| Call count assertion | `toHaveBeenCalledTimes(N)` / `.not.toHaveBeenCalled()` | Already the pattern in TEST-01/02/03 |

---

## Common Pitfalls

### Pitfall 1: SC-3 baseline requires `taskCount: 0` — not the same factory shape as SC-2

**What goes wrong:** Writing `makeBaselineQuery(0, true)` yields only `result` — correct. But if the factory unconditionally yields `task_started`/`task_notification` before the result guard, `taskCount: 0` produces the right output only if the loop is written as `for (let i = 1; i <= taskCount; i++)` (which runs zero times for `taskCount: 0`).

**Root cause:** Off-by-one or incorrect loop bound.

**Prevention:** Use a `for` loop with `i <= taskCount`. Test the factory mentally for `taskCount: 0`: zero iterations → only `result` yields → `onSubagentFlush` not called, `onReady` called once.

**Warning signs:** Test for baseline passes but `onSubagentFlush` is called unexpectedly.

---

### Pitfall 2: `finalizeCurrentTurn` has a `didFinalizeTurn` guard

**What goes wrong:** In the production code, `finalizeCurrentTurn` returns early if `didFinalizeTurn` is already `true` (line 1170). If a test's mock query sequence accidentally triggers a path that sets `didFinalizeTurn = true` before the `result` event is processed (e.g., a compact-command path), `onReady` will not be called.

**Root cause:** The `didFinalizeTurn` guard is intentional — it prevents double-firing. The test query must not include compact-command signals.

**Prevention:** Keep the mock query simple: only the intended event sequence. No `system/init` + `isCompactCommand` pattern.

**Warning signs:** `expect(onReady).toHaveBeenCalledTimes(1)` fails with count 0.

---

### Pitfall 3: `makeMode` must be imported from `claudeRemoteAgentSdk.testkit`

**What goes wrong:** Defining `makeMode` inline in the new test file creates a duplicate not aligned with the testkit.

**Root cause:** `makeMode` is already exported by `claudeRemoteAgentSdk.testkit.ts`.

**Prevention:** `import { makeMode } from './claudeRemoteAgentSdk.testkit';` — same pattern as all sibling test files.

---

### Pitfall 4: Multi-subagent test sequence ordering

**What goes wrong:** Yielding both `task_notification` events before either `task_started` event is not realistic and may fail the `taskId === activeTaskId` guard in the production handler (line 1557).

**Root cause:** The handler sets `activeTaskId` on `task_started` and clears it on `task_notification` only when `taskId === activeTaskId`. Interleaved sequences without matching `task_started` cause the `finalizeSubagentTurn` call to still fire (the `status` check is independent of the task-id check at line 1560–1562), but `activeTaskId` management may diverge from intent.

**Prevention:** Follow the intended sequence: `task_started(task_1)`, `task_notification(task_1, completed)`, `task_started(task_2)`, `task_notification(task_2, completed)`, `result`. [CITED: 05-CONTEXT.md §Specific Ideas]

---

## Code Examples

### Baseline turn completion test structure

```typescript
// Source: mirrors claudeRemoteAgentSdk.subagentTurnCompletion.test.ts pattern [VERIFIED]
import { describe, expect, it, vi } from 'vitest';
import { claudeRemoteAgentSdk } from './claudeRemoteAgentSdk';
import { makeMode } from './claudeRemoteAgentSdk.testkit';

describe('claudeRemoteAgentSdk baseline turn completion', () => {
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

    function makeNextMessage() {
        let didSendFirst = false;
        return vi.fn(async () => {
            if (didSendFirst) return null;
            didSendFirst = true;
            return { message: 'hello', mode: makeMode({ permissionMode: 'default' } as any) };
        });
    }

    it('TURN-06 baseline: bare result event (no subagent) calls onReady exactly once', async () => {
        const onReady = vi.fn();
        const onSubagentFlush = vi.fn();

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
            createQuery: makeBaselineQuery(0, true),
        } as any);

        expect(onReady).toHaveBeenCalledTimes(1);
        expect(onSubagentFlush).not.toHaveBeenCalled();
    });

    it('TURN-06 multi-subagent: two task_notifications then result calls onReady once, onSubagentFlush twice', async () => {
        const onReady = vi.fn();
        const onSubagentFlush = vi.fn();

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
            createQuery: makeBaselineQuery(2, true),
        } as any);

        expect(onReady).toHaveBeenCalledTimes(1);
        expect(onSubagentFlush).toHaveBeenCalledTimes(2);
    });
});
```

### SC-1 code inspection evidence (for VERIFICATION.md)

Key lines in `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.ts`: [VERIFIED by grep]

- Line 1194: `const finalizeSubagentTurn = async () => {` — subagent-only path (no `onReady` call)
- Line 1169: `const finalizeCurrentTurn = async (params?: { completionEvent?: string }) => {` — parent path (calls `onReady` at line 1190)
- Line 1554: `} else if (subtype === 'task_notification') {`
- Line 1561: `await finalizeSubagentTurn();` — `task_notification` calls only the subagent finalizer
- Line 1632: `await finalizeCurrentTurn();` — `result` event calls only the current-turn finalizer

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single `finalizeCurrentTurn` called for both parent and subagent | Two-function split: `finalizeCurrentTurn` (parent, fires `onReady`) and `finalizeSubagentTurn` (subagent, fires `onSubagentFlush` only) | Phase 4 | Phase 5 tests verify this split is correct |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| — | — | — | — |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.

---

## Open Questions

None. The phase scope is fully defined by CONTEXT.md locked decisions D-01 through D-06.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| vitest | Test runner | ✓ | 3.2.4 | — |
| Node.js | Test execution | ✓ | v24.14.1 | — |

[VERIFIED: `npx vitest --version` and `node --version` in apps/cli environment]

**Missing dependencies with no fallback:** None.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.4 |
| Config file | `apps/cli/vitest.config.ts` |
| Quick run command | `yarn workspace @happier-dev/cli test:unit -- src/backends/claude/remote/claudeRemoteAgentSdk.baselineTurnCompletion.test.ts` |
| Full suite command | `yarn workspace @happier-dev/cli test:unit` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TURN-06 (SC-1) | `task_notification` calls `finalizeSubagentTurn()` not `finalizeCurrentTurn()` | Code inspection (no test needed — static verification) | N/A — VERIFICATION.md artifact | yes (production code) |
| TURN-06 (SC-2) | 1× subagent + parent → `onReady` exactly once | unit | `yarn workspace @happier-dev/cli test:unit -- src/backends/claude/remote/claudeRemoteAgentSdk.subagentTurnCompletion.test.ts` | yes — TEST-02 green |
| TURN-06 (SC-3 baseline) | bare `result` (no subagent) → `onReady` exactly once | unit | `yarn workspace @happier-dev/cli test:unit -- src/backends/claude/remote/claudeRemoteAgentSdk.baselineTurnCompletion.test.ts` | no — Wave 0 |
| TURN-06 (SC-3 multi) | 2× subagent + parent → `onReady` once, `onSubagentFlush` twice | unit | `yarn workspace @happier-dev/cli test:unit -- src/backends/claude/remote/claudeRemoteAgentSdk.baselineTurnCompletion.test.ts` | no — Wave 0 |

### Sampling Rate

- **Per task commit:** `yarn workspace @happier-dev/cli test:unit -- src/backends/claude/remote/claudeRemoteAgentSdk.baselineTurnCompletion.test.ts`
- **Per wave merge:** `yarn workspace @happier-dev/cli test:unit`
- **Phase gate:** Full unit suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.baselineTurnCompletion.test.ts` — covers TURN-06 SC-3 baseline and multi-subagent scenario

*(Existing test infrastructure covers all other requirements)*

---

## Security Domain

Step 2.6: SKIPPED — this phase is test-writing only with no production code changes, no new endpoints, no auth paths, no cryptographic operations.

---

## Sources

### Primary (HIGH confidence)

- [VERIFIED: source code grep] `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.ts` — `task_notification` branch line 1554, `finalizeSubagentTurn` call line 1561, `finalizeCurrentTurn` definition line 1169, `finalizeSubagentTurn` definition line 1194
- [VERIFIED: file read] `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.subagentTurnCompletion.test.ts` — TEST-01/02/03 pattern; `makeSubagentQuery`, `makeNextMessage` factories
- [VERIFIED: file read] `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.testkit.ts` — `makeMode` export
- [VERIFIED: `npx vitest --version`] vitest 3.2.4 installed and confirmed working in `apps/cli`
- [VERIFIED: `yarn test:unit` run] All 4 tests in `subagentTurnCompletion.test.ts` pass green
- [CITED: 05-CONTEXT.md §Specific Ideas] Multi-subagent sequence: `task_started(task_1)`, `task_notification(task_1, completed)`, `task_started(task_2)`, `task_notification(task_2, completed)`, `result`
- [VERIFIED: file read] `apps/cli/vitest.config.ts` — test pattern `src/**/*.test.ts`, pool `forks`, timeout 30s

### Secondary (MEDIUM confidence)

None required — all findings verified directly from source.

### Flagged for Validation (LOW confidence)

None.

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — vitest confirmed installed and running
- Architecture: HIGH — production code read directly; exact line numbers verified
- Pitfalls: HIGH — derived from reading production code guards (`didFinalizeTurn`, `activeTaskId` matching) and existing test patterns

**Research date:** 2026-04-20
**Valid until:** Stable — no external dependencies; pure internal code inspection
