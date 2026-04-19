# Requirements: Happier v1.1

**Defined:** 2026-04-19
**Core Value:** Control AI coding agent sessions remotely from any device, with end-to-end encryption.
**Milestone:** v1.1 — Distinguish Parent vs Subagent Turn Completion

## v1.1 Requirements

### Turn Completion Distinction

- [ ] **TURN-01**: `finalizeCurrentTurn()` in `claudeRemoteAgentSdk.ts` accepts `isSubagent?: boolean` in its params bag (backward-compatible with all existing call sites)
- [ ] **TURN-02**: Phase A bookkeeping (`activeTaskId = null`, `updateThinking(false)`, transcript flush, diagnostics reset) runs for both parent and subagent completions
- [ ] **TURN-03**: Phase B notification (`didFinalizeTurn = true`, `awaitingNextTurnStart = true`, `opts.onReady()`, `scheduleNextMessagePump()`) runs only when `!isSubagent`
- [ ] **TURN-04**: `task_notification` call site passes `{ isSubagent: true }`; `result` and compact call sites pass `{}` (falsy default, treated as parent)

### Correctness / Regression

- [ ] **TURN-05**: `messageQueue.flush()` in the `onReady` lambda in `claudeRemoteLauncher.ts` still runs unconditionally — only `readyHandler()` is gated behind `!isSubagent`
- [ ] **TURN-06**: A subagent completion followed by a parent completion fires exactly one `ready` event to the relay server and mobile app

### Test Coverage

- [ ] **TEST-01**: Test that subagent `task_notification` does not emit a `ready` event
- [ ] **TEST-02**: Test that parent `result` after a subagent completion emits exactly one `ready` event
- [ ] **TEST-03**: Test that transcript flush (Phase A bookkeeping) runs on both subagent and parent completion paths

## Future Requirements

- Dedicated subagent handler function (Codex-style `finalizeSyntheticSubagentThread`) if agent-teams becomes a primary code path
- `resetTurnDiagnostics()` scope decision: gate behind `!isSubagent` for full-turn diagnostics

## Out of Scope

| Feature | Reason |
|---------|--------|
| Codex backend changes | Already handles parent/subagent distinction correctly via `threadId` comparison |
| `claudeRemoteLauncher.ts` structural changes | `onReady` lambda boundary is the correct gate; no structural change needed |
| Voice session test coverage | Suppressing `voiceHooks.onReady()` on subagent completion is correct behavior; existing voice tests cover it |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TURN-01 | Phase 4 | Pending |
| TURN-02 | Phase 4 | Pending |
| TURN-03 | Phase 4 | Pending |
| TURN-04 | Phase 5 | Pending |
| TURN-05 | Phase 4 | Pending |
| TURN-06 | Phase 5 | Pending |
| TEST-01 | Phase 4 | Pending |
| TEST-02 | Phase 4 | Pending |
| TEST-03 | Phase 4 | Pending |

**Coverage:**
- v1.1 requirements: 9 total
- Mapped to phases: 9/9 (100%)
