# Milestones

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

## v1.1 Session Agent Tools — Global Default (Shipped: 2026-04-22)

**Phases completed:** 2 phases (4-5), 2 plans
**Requirements:** 10/10 completed ✅
**Timeline:** 1 day (2026-04-22)
**Files changed:** 32 files, 3,795 insertions, 120 deletions

**Key accomplishments:**

- Extended `SessionAgentToolsSettingsSchema` with `default?: boolean` field using `z.boolean().optional()` — absence distinguishable from explicit `false` at predicate level (Phase 4)
- Updated `buildIsSessionAgentToolEnabled` to 3-level lookup: per-tool entry → `settings.default` → `true` fallback; preserves backward-compatible opt-out for all existing users (Phase 4)
- Renamed all V1-suffixed TypeScript identifiers while preserving JSON key `sessionAgentToolsSettingsV1` for backward compatibility (Phase 4) *(JSON key subsequently renamed to `sessionAgentToolsSettings` per D-06, 2026-05-01)*
- Added `describe('3-level lookup (TEST-01..04)')` block with 4 explicit requirement-labeled tests; total test suite: 26 passing (Phase 5)
- Updated `docs/mcp-tool-filtering.md` with schema table `default` row, Example E opt-in mode config, full 3-level predicate implementation, and corrected stale V1 identifier references (Phase 5)

**Tag:** `thamw-1.1b`
**Archive:** `.planning/milestones/v1.1-ROADMAP.md`, `.planning/milestones/v1.1-REQUIREMENTS.md`

---
