# Roadmap: Happier (Fork)

## Milestones

- ✅ **v1.0 MCP Tool Configuration** — Phases 1-3 (shipped 2026-04-19)
- **v1.1 Distinguish Parent vs Subagent Turn Completion** — Phases 4-5

## Phases

<details>
<summary>✅ v1.0 MCP Tool Configuration (Phases 1-3) — SHIPPED 2026-04-19</summary>

- [x] Phase 1: Schema & Reader (1/1 plans) — completed 2026-04-19
- [x] Phase 2: Startup Wiring & Tool Filtering (3/3 plans) — completed 2026-04-19
- [x] Phase 3: Validation Feedback (1/1 plan) — completed 2026-04-19

</details>

### v1.1 Distinguish Parent vs Subagent Turn Completion

- [ ] **Phase 4: Restructure finalizeCurrentTurn()** — Split into `finalizeCurrentTurn()` (parent, Phase A + B) and `finalizeSubagentTurn()` (subagent, Phase A only); write tests first
- [ ] **Phase 5: Verify End-to-End Behavior** — Confirm exactly one ready event fires per parent turn completion; no spurious ready events on subagent completion

## Phase Details

### Phase 4: Restructure finalizeCurrentTurn()
**Goal**: `finalizeCurrentTurn()` correctly distinguishes bookkeeping that always runs from notifications that should only fire for parent turn completion
**Depends on**: Nothing (first phase of v1.1)
**Requirements**: TURN-01, TURN-02, TURN-03, TURN-05, TEST-01, TEST-02, TEST-03
**Success Criteria** (what must be TRUE):
  1. Two closures exist in `claudeRemoteAgentSdk.ts`: `finalizeCurrentTurn()` (parent path, `params?: { completionEvent?: string }`) and `finalizeSubagentTurn()` (subagent path, no params). The `task_notification` handler calls `finalizeSubagentTurn()`; result handlers call `finalizeCurrentTurn()`. All call sites compile without errors.
  2. After a subagent completion, `updateThinking(false)` runs, the transcript is flushed, and `activeTaskId` is cleared — verifiable by unit test checking Phase A executes on the subagent path
  3. After a subagent completion, `opts.onReady()` and `scheduleNextMessagePump()` do not execute — verifiable by unit test asserting the ready callback was never called
  4. `messageQueue.flush()` in the `onReady` lambda in `claudeRemoteLauncher.ts` still executes unconditionally — verifiable by inspection and by a test that confirms flush is called even when no ready event fires
  5. All three new unit tests (subagent suppresses ready, parent after subagent fires exactly one ready, transcript flush runs on both paths) pass with no failures
**Plans**: 2 plans

Plans:
- [x] 04-01-PLAN.md — Write three failing tests for the two-function split (TDD RED phase)
- [x] 04-02-PLAN.md — Implement finalizeSubagentTurn(), add onSubagentFlush? to opts, wire launcher (GREEN phase)

### Phase 5: Verify End-to-End Behavior
**Goal**: End-to-end verification that the two-function-split produces correct relay behavior: exactly one ready event per parent completion, no spurious ready events on subagent completion
**Depends on**: Phase 4
**Requirements**: TURN-06
**Success Criteria** (what must be TRUE):
  1. The `task_notification` handler calls `finalizeSubagentTurn()` and does not call `finalizeCurrentTurn()` — verifiable by reading `claudeRemoteAgentSdk.ts` lines around the `task_notification` branch
  2. A test scenario of subagent completion followed by parent completion produces exactly one ready notification at the relay server — no duplicate ready events, no missing ready event
  3. A test scenario of parent completion with no preceding subagent produces exactly one ready notification — the two-function split does not regress the baseline path (TURN-06 baseline case)
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Schema & Reader | v1.0 | 1/1 | Complete | 2026-04-19 |
| 2. Startup Wiring & Tool Filtering | v1.0 | 3/3 | Complete | 2026-04-19 |
| 3. Validation Feedback | v1.0 | 1/1 | Complete | 2026-04-19 |
| 4. Restructure finalizeCurrentTurn() | v1.1 | 0/2 | Not started | - |
| 5. Wire Call Sites and Verify | v1.1 | 0/1 | Not started | - |
