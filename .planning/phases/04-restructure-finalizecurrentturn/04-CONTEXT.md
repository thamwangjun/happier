# Phase 4: Restructure finalizeCurrentTurn() - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Split `finalizeCurrentTurn()` in `claudeRemoteAgentSdk.ts` into unconditional bookkeeping (Phase A) and parent-only turn-ready notification (Phase B). Add `isSubagent?: boolean` to the params bag. Write 3 tests (TEST-01, TEST-02, TEST-03) in a new test file. Wire `onSubagentFlush` in `claudeRemoteLauncher.ts` so `messageQueue.flush()` still runs on subagent completion. Scope: `claudeRemoteAgentSdk.ts`, `claudeRemoteLauncher.ts`, new test file.

</domain>

<decisions>
## Implementation Decisions

### isSubagent parameter
- **D-01:** Add `isSubagent?: boolean` to the existing params bag (`params?: { completionEvent?: string; isSubagent?: boolean }`). Backward-compatible — existing call sites with no arg still compile.

### Guard (didFinalizeTurn) on subagent path
- **D-02:** Change the early-return guard to `if (!isSubagent && didFinalizeTurn) return`. Subagent calls skip the guard — Phase A always runs when `isSubagent=true`. The upstream `task_id === activeTaskId` check already prevents spurious duplicate `task_notification` messages.
- **D-03:** `didFinalizeTurn = true` and `awaitingNextTurnStart = true` remain inside the `!isSubagent` gate (Phase B only). Moving them before the gate silently drops the parent's `onReady()` — confirmed by prior research.

### Phase A (unconditional bookkeeping)
- **D-04:** `activeTaskId = null`, `updateThinking(false)`, consume and clear `deferredInterruptedReason`, `flushStreamedTranscriptWriter(...)`, `logger.debug(...)`, `resetTurnDiagnostics()` — all run for both parent and subagent completions.

### Phase B (parent-only notification)
- **D-05:** `didFinalizeTurn = true`, `awaitingNextTurnStart = true`, `opts.onCompletionEvent?.(params.completionEvent)`, `await opts.onReady()`, `scheduleNextMessagePump()` — all run only when `!isSubagent`. `completionEvent` moves to Phase B (semantic: it's a notification, only ever passed on parent/compact paths anyway).

### opts.onSubagentFlush callback
- **D-06:** Add `onSubagentFlush?: () => Promise<void>` to the opts/params object passed into `claudeRemoteAgentSdk`. When `isSubagent=true`, call `await opts.onSubagentFlush?.()` at the end of Phase A (instead of `opts.onReady()`).
- **D-07:** `onSubagentFlush` is called every time `finalizeCurrentTurn` runs with `isSubagent=true` — no additional guard. The upstream deduplication is sufficient.

### claudeRemoteLauncher.ts
- **D-08:** Wire `onSubagentFlush` in the live launcher (not just test harness). Implementation: `onSubagentFlush: async () => { await messageQueue.flush(); }`. The existing `onReady` lambda is unchanged: `async () => { await messageQueue.flush(); readyHandler(); }`.
- **D-09:** Update any test harness that builds an opts object for `claudeRemoteAgentSdk` to include `onSubagentFlush` (prevents type errors). Specifically `claudeRemoteLauncher.readyPushPolicy.test.ts` and any other launcher tests.

### Test file
- **D-10:** New file: `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.subagentTurnCompletion.test.ts`. Contains TEST-01, TEST-02, TEST-03. Do not add to `optionsAndHooks.test.ts` (already 1600+ lines).
- **D-11:** TDD order: write failing tests first, then implement the production change.

### Claude's Discretion
- Whether to use `params?.isSubagent ?? false` or `!!params?.isSubagent` for the boolean coercion — either is fine.
- Internal naming of the local variable (e.g. `const isSubagent = params?.isSubagent ?? false`).

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

- The two-phase naming ("Phase A" / "Phase B") from REQUIREMENTS.md maps directly to code comments: comment `// Phase A: unconditional bookkeeping` and `// Phase B: parent-only notification` as structural markers inside `finalizeCurrentTurn`.
- No new class or module needed — all changes are within existing closures.

</specifics>

<deferred>
## Deferred Ideas

- Dedicated `finalizeSyntheticSubagentThread` function (Codex-style) if agent-teams becomes a primary code path — deferred to future milestone per PROJECT.md.
- Gate `resetTurnDiagnostics()` behind `!isSubagent` for full-turn diagnostics — flagged in Future Requirements, not in scope for Phase 4.

</deferred>

---

*Phase: 04-restructure-finalizecurrentturn*
*Context gathered: 2026-04-19*
