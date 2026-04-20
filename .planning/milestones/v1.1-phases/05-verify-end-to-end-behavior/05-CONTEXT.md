# Phase 5: Verify End-to-End Behavior - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Write explicit regression tests that prove the two-function split (Phase 4) produces correct relay behavior: SC-1 re-verified by code inspection, SC-2 already covered by TEST-02 (subagentTurnCompletion.test.ts), SC-3 baseline covered by a new test file, and a multi-subagent scenario added to the same file. No structural code changes — this phase is verification and test-writing only.

</domain>

<decisions>
## Implementation Decisions

### SC-3 Baseline Regression Test
- **D-01:** New file: `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.baselineTurnCompletion.test.ts`
- **D-02:** Contains explicit TURN-06 baseline test: bare `result` event (no preceding `task_notification`) → `onReady` called exactly once. Rationale: existing `postResultStreaming` and `streamEvents` tests cover the parent path only implicitly and without a TURN-06 label.

### Multi-Subagent Test
- **D-03:** Same new file also contains: 2× `task_notification` (two subagents) + 1× `result` → `onReady` called exactly once, `onSubagentFlush` called exactly twice. This scenario is currently untested. Adding it to `baselineTurnCompletion.test.ts` (not `subagentTurnCompletion.test.ts`).

### TURN-06 Test Level
- **D-04:** Unit tests with mock `onReady` are sufficient for TURN-06. The relay server is downstream of `onReady` — testing that `onReady` fires exactly once is the correct boundary. Relay integration tests would be testing relay behavior, not the SDK fix.

### SC-1 Verification Artifact
- **D-05:** Phase 5 writes its own VERIFICATION.md that re-confirms SC-1 by code inspection (cite `claudeRemoteAgentSdk.ts` line around the `task_notification` branch). Phase 5 verification is self-contained — does not rely solely on Phase 4's report.

### SC-2 Coverage
- **D-06:** TEST-02 in `claudeRemoteAgentSdk.subagentTurnCompletion.test.ts` already covers SC-2 (1× `task_notification` + 1× `result` → `onReady` exactly once). No new test needed for that scenario. Phase 5 plan references TEST-02 as the SC-2 evidence.

### Claude's Discretion
- Test helper design in `baselineTurnCompletion.test.ts` (whether to share `makeBaselineQuery` factory or inline fixtures per test).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 5 success criteria
- `.planning/ROADMAP.md` §Phase 5 — success criteria SC-1, SC-2, SC-3
- `.planning/REQUIREMENTS.md` — TURN-06 (the only open Phase 5 requirement)

### Phase 4 implementation (what Phase 5 verifies)
- `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.ts` — `task_notification` branch ~line 1554; `finalizeSubagentTurn` ~line 1194; `finalizeCurrentTurn` ~line 1169
- `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.subagentTurnCompletion.test.ts` — TEST-01, TEST-02, TEST-03 (Phase 4 tests — SC-2 evidence lives here)

### Existing test patterns (read before writing new tests)
- `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.subagentTurnCompletion.test.ts` — `makeSubagentQuery` and `makeNextMessage` factories to reuse or mirror
- `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.testkit.ts` — `makeMode` and other shared test helpers

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `claudeRemoteAgentSdk.testkit.ts` — `makeMode()` helper used by all SDK test files
- `makeSubagentQuery(includeResult: boolean)` in subagentTurnCompletion.test.ts — factory for task_notification sequences; the new file should define its own `makeBaselineQuery` variant
- `makeNextMessage()` in subagentTurnCompletion.test.ts — single-message pump factory; can be mirrored in new file

### Established Patterns
- All tests use `vi.fn()` for callbacks and assert call count via `toHaveBeenCalledTimes(N)`
- Test files import from `./claudeRemoteAgentSdk` (named import) and `./claudeRemoteAgentSdk.testkit`
- Query mock shape: `{ [Symbol.asyncIterator](), close, setPermissionMode, setModel, setMaxThinkingTokens, supportedCommands, supportedModels }`

### Integration Points
- `onReady` and `onSubagentFlush` are both `vi.fn()` in tests; assertions target `.toHaveBeenCalledTimes(N)` and `.not.toHaveBeenCalled()`
- `claudeRemoteAgentSdk` is called with `as any` cast to avoid exhaustive opts typing in tests

</code_context>

<specifics>
## Specific Ideas

- The multi-subagent test (D-03) should yield: `task_started(task_1)`, `task_notification(task_1, completed)`, `task_started(task_2)`, `task_notification(task_2, completed)`, `result` — and assert `onReady` called once, `onSubagentFlush` called twice.
- The baseline test (D-02) should yield: just a `result` event with no preceding task events — assert `onReady` called once, `onSubagentFlush` not called.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 05-verify-end-to-end-behavior*
*Context gathered: 2026-04-20*
