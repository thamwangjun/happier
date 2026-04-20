# Phase 4: Restructure finalizeCurrentTurn() - Context

**Gathered:** 2026-04-19
**Revised:** 2026-04-19 (anti-pattern review)
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace `finalizeCurrentTurn()` with two focused functions in `claudeRemoteAgentSdk.ts`: `finalizeCurrentTurn()` for parent completion (bookkeeping + notification) and `finalizeSubagentTurn()` for subagent completion (bookkeeping + flush only). Add `onSubagentFlush?: () => Promise<void>` to the opts object. Write 3 tests (TEST-01, TEST-02, TEST-03) in a new test file. Wire `onSubagentFlush` in `claudeRemoteLauncher.ts`. Scope: `claudeRemoteAgentSdk.ts`, `claudeRemoteLauncher.ts`, new test file.

</domain>

<decisions>
## Implementation Decisions

### Two functions replacing finalizeCurrentTurn() (anti-pattern: Flag Argument)
- **D-01:** Replace the single `finalizeCurrentTurn(params?)` with two named functions:
  - `finalizeCurrentTurn()` — parent path only. Runs all bookkeeping + turn-ready notification. No params needed.
  - `finalizeSubagentTurn()` — subagent path only. Runs bookkeeping + flush, no ready notification. No params needed.
- **D-02:** `task_notification` handler calls `finalizeSubagentTurn()`; `result` and compact handlers call `finalizeCurrentTurn()`. Call sites are unambiguous — no flag to interpret.
- **D-03:** Rationale: eliminates the Flag Argument anti-pattern. Matches the Codex `finalizeSyntheticSubagentThread` pattern already in the codebase.

### finalizeCurrentTurn() — parent path
- **D-04:** Contains all existing logic unchanged: `didFinalizeTurn` guard, `didFinalizeTurn = true`, `awaitingNextTurnStart = true`, `activeTaskId = null`, `updateThinking(false)`, transcript flush, diagnostics log + reset, `opts.onCompletionEvent?.(...)`, `await opts.onReady()`, `scheduleNextMessagePump()`.
- **D-05:** `completionEvent` parameter stays on `finalizeCurrentTurn({ completionEvent? })` — only parent/compact paths ever pass it.

### finalizeSubagentTurn() — subagent path
- **D-06:** Runs bookkeeping only: `activeTaskId = null`, `updateThinking(false)`, consume and clear `deferredInterruptedReason`, `flushStreamedTranscriptWriter('turn-end')`, `logger.debug(...)`, `resetTurnDiagnostics()`. Then calls `await opts.onSubagentFlush?.()`.
- **D-07:** No `didFinalizeTurn` guard — subagent turns are independent of the parent turn state. The upstream `task_id === activeTaskId` check is the only deduplication needed.
- **D-08:** `deferredInterruptedReason` and `resetTurnDiagnostics()` both run unconditionally in `finalizeSubagentTurn()` — subagent turns are still turns and their per-turn state should be cleared.

### opts.onSubagentFlush callback (anti-pattern: Interface Bloat — accepted trade-off)
- **D-09:** Add `onSubagentFlush?: () => Promise<void>` to the opts object. Called by `finalizeSubagentTurn()` to flush the message queue without triggering `readyHandler()`. Optional — existing call sites compile without it.
- **D-10:** `onSubagentFlush` called every time `finalizeSubagentTurn()` runs — no additional guard.
- **D-11:** Noted trade-off: adds one property to the opts object (interface bloat concern). Accepted because two-function split (D-01) already resolves the flag argument and SRP concerns; a single optional property is manageable.

### claudeRemoteLauncher.ts
- **D-12:** Wire `onSubagentFlush` in the live launcher: `onSubagentFlush: async () => { await messageQueue.flush(); }`. The existing `onReady` lambda is unchanged.
- **D-13:** Update test harnesses (e.g. `claudeRemoteLauncher.readyPushPolicy.test.ts`) to add `onSubagentFlush` stub — prevents type errors after opts interface change.

### Test file
- **D-14:** New file: `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.subagentTurnCompletion.test.ts`. Contains TEST-01, TEST-02, TEST-03.
- **D-15:** TDD order: write failing tests first, then implement.

### Claude's Discretion
- Whether to extract shared bookkeeping into a private helper called by both functions — not required; Phase A code is short enough to inline in each.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Primary implementation targets
- `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.ts` — `finalizeCurrentTurn` ~line 1158; `task_notification` handler ~line 1529; `result` handler ~lines 1603–1607
- `apps/cli/src/backends/claude/claudeRemoteLauncher.ts` — `onReady` lambda ~line 992; `readyHandler` definition ~line 847; `messageQueue` ~line 351

### Requirements and roadmap
- `.planning/REQUIREMENTS.md` — TURN-01, TURN-02, TURN-03, TURN-05, TEST-01, TEST-02, TEST-03 (all Phase 4 requirements)
- `.planning/ROADMAP.md` §Phase 4 — success criteria 1–5

### Existing test patterns (read before writing new tests)
- `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.optionsAndHooks.test.ts` — testkit usage, createQuery mock pattern, task_notification test at ~line 340

### Reference (Codex equivalent pattern)
- `apps/cli/src/backends/codex/appServer/runtime.ts` — `finalizeSyntheticSubagentThread` (same intent, different implementation)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `claudeRemoteAgentSdk.testkit.ts` — `makeMode()` and other test helpers used by all SDK test files
- `OutgoingMessageQueue` — `messageQueue.flush()` in launcher; `messageQueue.enqueue()` threaded through session

### Established Patterns
- All callbacks threaded via the opts/params object (not separate constructor args)
- `opts.onReady: () => Promise<void>` — existing async callback pattern; `onSubagentFlush` should follow the same shape
- Tests use `vi.fn()` for callbacks and assert call count / call args
- `createQuery` is mocked per-test to yield specific message sequences

### Integration Points
- `finalizeCurrentTurn` is a closure inside `claudeRemoteAgentSdk` — it has access to all local state vars (`didFinalizeTurn`, `awaitingNextTurnStart`, `activeTaskId`, etc.)
- `onReady` is defined in `claudeRemoteLauncher.ts` at the call site; adding `onSubagentFlush` alongside it is the only launcher change
- `readyPushPolicy.test.ts` builds mock opts for the launcher — must add `onSubagentFlush` stub to avoid type errors after interface change

</code_context>

<specifics>
## Specific Ideas

- Two functions mirror the Codex pattern: `finalizeSyntheticSubagentThread` in `apps/cli/src/backends/codex/appServer/runtime.ts` is the reference.
- No new class or module needed — both functions are closures inside `claudeRemoteAgentSdk`, sharing the same local state vars.

</specifics>

<deferred>
## Deferred Ideas

- Extract shared bookkeeping into a private helper (e.g. `runTurnBookkeeping()`) to eliminate any duplication between `finalizeCurrentTurn` and `finalizeSubagentTurn` — deferred; Phase A code is short enough to inline for now.
- Gate `resetTurnDiagnostics()` behind `!isSubagent` for full-turn diagnostics — flagged in Future Requirements, not in scope for Phase 4.

</deferred>

---

*Phase: 04-restructure-finalizecurrentturn*
*Context gathered: 2026-04-19*
