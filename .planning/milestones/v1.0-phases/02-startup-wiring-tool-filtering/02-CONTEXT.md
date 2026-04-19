# Phase 2: Startup Wiring & Tool Filtering - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Read `sessionAgentToolsSettingsV1` once at `startHappyServer` startup, compute a filter predicate from it, and pass that predicate into `createHappierMcpServer` so only enabled tools are registered per-request. Also includes renaming Phase 1 schema/type/file/key from `mcpToolsSettingsV1` to `sessionAgentToolsSettingsV1` everywhere.

No per-request re-evaluation of settings. No resource filtering. No validation feedback for unknown tool names (Phase 3).

</domain>

<decisions>
## Implementation Decisions

### Naming (retroactive rename of Phase 1 artifacts)

- **D-01:** All Phase 1 naming changes to `sessionAgentToolsSettingsV1` — the schema type (`SessionAgentToolsSettingsV1`), the settings key in `settings.json` (`sessionAgentToolsSettingsV1`), the file (`apps/cli/src/settings/sessionAgentToolsSettings.ts`), and the `Settings` interface field (`sessionAgentToolsSettingsV1?`). The rename happens as part of the Phase 2 plan, not a separate fixup commit.
- **D-02:** Any new interfaces or parameter names introduced in Phase 2 (e.g., the predicate passed to `createHappierMcpServer`) must use `sessionAgent`-reflecting names — not `mcp`-branded names (e.g., `isSessionAgentToolEnabled`, not `isMcpToolEnabled`).

### Surface key for filtering

- **D-03:** The filter predicate uses `session_agent` surface as the reference tool set — matching what `createHappierMcpServer` actually registers. Rationale: 9 confirmed divergences between `session_agent` and `mcp` surfaces exist in `actionSpecs.ts`; using `mcp` surface would allow users to name tools that never register (`session_spawn_new`) and make `memory_search` unfilterable. The filter reference and the registration surface must agree.

### Read once at startup

- **D-04:** `startHappyServer` reads `sessionAgentToolsSettingsV1` from the settings object once (STARTUP-01). It computes the filter predicate at startup and passes it into `createHappierMcpServer` as a parameter. Each per-request call uses the pre-computed predicate — settings are not re-read per request (STARTUP-01 criterion 4).
- **D-05:** Absent settings file, absent `sessionAgentToolsSettingsV1` key, or schema validation failure → all tools enabled, no crash (STARTUP-02, STARTUP-03). This is inherited from the Phase 1 reader contract (D-05 of Phase 1 CONTEXT).

### toolNames return value

- **D-06:** `startHappyServer`'s returned `toolNames` snapshot reflects only enabled (filtered) tools — consistent with `createHappierMcpServer`'s own `toolNames` return from `registerHappierMcpBuiltInTools`. No caller currently consumes this field, but future callers get a truthful list.

### Filter scope

- **D-07:** The filter applies to built-in tools only (those registered via `registerHappierMcpBuiltInTools`). Resources registered via `registerHappierMcpResources` are unaffected — they have their own `isActionEnabled` callback. Add a one-line comment at the `registerHappierMcpResources` call site in `createHappierMcpServer.ts` documenting this intentional bypass.

### Claude's Discretion

- Exact parameter shape for threading the predicate into `createHappierMcpServer` (e.g., extend `opts`, new named param, or a separate config object)
- Whether to compute the predicate in `startHappyServer` or build a helper in `sessionAgentToolsSettings.ts`
- Zod schema `.strict()` / `.passthrough()` ergonomics for the rename (preserve Phase 1 decisions)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 1 artifacts (to be renamed in this phase)
- `apps/cli/src/settings/mcpToolsSettings.ts` — current file; rename to `sessionAgentToolsSettings.ts`. Contains `McpToolsSettingsV1Schema`, `McpToolsSettingsV1` type, and `readMcpToolsSettingsV1` reader. All renamed.
- `apps/cli/src/persistence.ts` — `Settings` interface field `mcpToolsSettingsV1?` → `sessionAgentToolsSettingsV1?`. Also update any `import type` reference.

### Tool registration and startup (primary integration points)
- `apps/cli/src/mcp/startHappyServer.ts` — reads settings once, computes predicate, passes to `createHappierMcpServer`. Also computes `toolNamesSnapshot` — must be filtered after rename/wiring.
- `apps/cli/src/mcp/createHappierMcpServer.ts` — receives predicate; passes to `registerHappierMcpBuiltInTools`. Add comment at `registerHappierMcpResources` call.
- `apps/cli/src/mcp/server/registerHappierMcpBuiltInTools.ts` — where the predicate is applied during tool registration loop.
- `apps/cli/src/agent/tools/happierTools/listBuiltInHappierTools.ts` — uses `session_agent` surface; this is the canonical tool set for the filter.

### Settings pattern (Phase 1 canonical refs — still apply)
- `apps/cli/src/configuration.ts` — `configuration.settingsFile` for the canonical path; do not hardcode.
- `apps/cli/src/settings/memorySettings.ts` — adjacent reader pattern for structure reference.
- `apps/cli/src/mcp/servers/readMcpServersSettingsFromAccountSettings.ts` — reader that returns typed empty struct on failure (matches reader contract).

### Requirements
- STARTUP-01, STARTUP-02, STARTUP-03, TOOLS-01 in `.planning/REQUIREMENTS.md`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/cli/src/persistence.ts` `readSettings()` — call this to get the raw settings object to pass into the reader
- `apps/cli/src/ui/logger.ts` — `logger.warn(...)` for schema validation failure path (already wired in Phase 1 reader)
- `listBuiltInHappierTools({ surface: 'session_agent' })` — the canonical enabled tool list; apply predicate on top of this

### Established Patterns
- `startHappyServer` already computes `toolNamesSnapshot` at startup from `listBuiltInHappierTools({ surface: 'session_agent' })` — the filter predicate slots into this same call
- `createHappierMcpServer` currently passes `surface: 'session_agent'` into `registerHappierMcpBuiltInTools`; the predicate is an additional param alongside this
- Per-request server creation in `startHappyServer` is intentional (stateless mode) — do not change this structure; predicate is computed once, not per-request

### Integration Points
- `startHappyServer` → `createHappierMcpServer` → `registerHappierMcpBuiltInTools`: predicate threads through this chain
- `createHappierMcpBridge` (caller of `startHappyServer`) discards `toolNames` today but the field is public — keep it filtered for contract correctness
- `registerHappierMcpResources` is a sibling call in `createHappierMcpServer` — intentionally untouched by the filter

</code_context>

<specifics>
## Specific Ideas

- The predicate should be named to reflect `session_agent` semantics (e.g., `isSessionAgentToolEnabled`) not MCP semantics, per D-02.
- The one-line comment at `registerHappierMcpResources` should read something like: `// resources use their own isActionEnabled callback — not subject to sessionAgentToolsSettingsV1 filtering`

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-startup-wiring-tool-filtering*
*Context gathered: 2026-04-19*
