# Milestones

## v1.1 Distinguish Parent vs Subagent Turn Completion (Shipped: 2026-04-20)

**Phases completed:** 2 phases, 3 plans

**Key accomplishments:**

- Wrote 3 failing TDD tests (RED) establishing behavioral contract for two-function turn completion split (Phase 4)
- Implemented `finalizeSubagentTurn()` + `onSubagentFlush` opt; all 4 tests GREEN, TypeScript strict zero errors (Phase 4)
- Written TURN-06 baseline and multi-subagent tests with VERIFICATION.md confirming SC-1 via code inspection at lines 1554–1561 of `claudeRemoteAgentSdk.ts` (Phase 5)

**Archive:** `.planning/milestones/v1.1-ROADMAP.md`, `.planning/milestones/v1.1-REQUIREMENTS.md`

---

## v1.0 MCP Tool Configuration (Shipped: 2026-04-19)

**Phases completed:** 3 phases, 5 plans

**Key accomplishments:**

- Defined `sessionAgentToolsSettingsV1` Zod schema with opt-out model and a no-throw reader (Phase 1)
- Renamed all artifacts from `mcpToolsSettingsV1` → `sessionAgentToolsSettingsV1`; added `buildIsSessionAgentToolEnabled` predicate builder (Phase 2)
- Threaded predicate through `startHappyServer` → `createHappierMcpServer` → `registerHappierMcpBuiltInTools` with unit tests (Phase 2)
- End-to-end integration tests: `listTools` hides disabled tools, all-enabled when key absent, no crash on corrupt config (Phase 2)
- `findUnknownSessionAgentToolNames` pure function with `logger.warn` at startup for unrecognized tool names (Phase 3)

**Archive:** `.planning/milestones/v1.0-ROADMAP.md`, `.planning/milestones/v1.0-REQUIREMENTS.md`

---
