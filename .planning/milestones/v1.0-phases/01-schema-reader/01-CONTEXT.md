# Phase 1: Schema & Reader - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Define the `McpToolsSettingsV1` Zod schema (shape: `{ v: 1, tools: { "<tool_name>": { enabled: boolean } } }`) and implement a reader function that extracts and validates it from `~/.happier/settings.json`. No startup wiring, no tool filtering, no unknown-name warnings — those are Phases 2 and 3.

</domain>

<decisions>
## Implementation Decisions

### Schema

- **D-01:** Schema and reader live together in a new `apps/cli/src/settings/mcpToolsSettings.ts`. This is CLI-local config — no server or mobile consumer exists or is planned for v1.0. Protocol package is not touched.
- **D-02:** Schema shape: `{ v: z.literal(1), tools: z.record(z.string(), z.object({ enabled: z.boolean() })) }`. Tools absent from the map default to enabled (opt-out model, SCHEMA-02).

### Settings Interface

- **D-03:** Add `mcpToolsSettingsV1?: McpToolsSettingsV1` to the `Settings` interface in `persistence.ts` using `import type` from the new module. This is a deliberate departure from the `memory?: unknown` pattern — the user chose typed access at the call site.
- **D-04:** No schema version bump needed. The field is optional and the existing `migrateSettings` path round-trips unknown keys unchanged.

### Reader Contract

- **D-05:** The reader (`readMcpToolsSettingsV1`) always returns `McpToolsSettingsV1` — never `null`. Absent settings file, absent `mcpToolsSettingsV1` key, or schema validation failure all return a default value of `{ v: 1, tools: {} }` (all tools enabled). Only on schema parse failure does the reader emit `logger.warn`.
- **D-06:** The reader accepts the raw settings object (from `readSettings()` or injected in tests), not the file path. This keeps it pure and testable without filesystem mocking.

### Claude's Discretion

- Exact Zod schema ergonomics (`.strict()`, `.passthrough()`, preprocess vs plain object) — Claude decides based on what makes the safest validator with the least surprising behavior.
- Whether to export a `McpToolsSettingsV1` type alias or rely on `z.infer<>` at use sites.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Settings pattern (primary references)
- `apps/cli/src/persistence.ts` — `Settings` interface, `readSettings()`, `writeSettings()`, `defaultSettings`. The field must be added here. Note `memory?: unknown` as the adjacent opaque-field precedent.
- `apps/cli/src/configuration.ts` — `configuration.settingsFile` resolves the canonical path (`~/.happier/settings.json` by default, overridable via `HAPPIER_HOME_DIR`). Use this, not a hardcoded path.
- `apps/cli/src/settings/memorySettings.ts` — closest existing reader module pattern (reads an opaque settings field, validates, returns default on failure). Study its structure before writing `mcpToolsSettings.ts`.

### Adjacent schema patterns
- `packages/protocol/src/mcpServers/settingsV1.ts` — `McpServersSettingsV1Schema`. A structurally similar Zod schema for reference. Note: that schema is server-synced; `McpToolsSettingsV1` is CLI-local — do not add to protocol.
- `apps/cli/src/mcp/servers/readMcpServersSettingsFromAccountSettings.ts` — reader that returns a typed empty struct on failure (matches our reader return contract).

### Downstream integration point (Phase 2)
- `apps/cli/src/mcp/startHappyServer.ts` — where the reader output will be consumed in Phase 2 (`startHappyServer` startup). No changes in Phase 1.
- `apps/cli/src/mcp/createHappierMcpServer.ts` — tool registration site. No changes in Phase 1.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/cli/src/ui/logger.ts` — `logger.warn(...)` for the parse-failure warning path (D-05)
- `apps/cli/src/settings/memorySettings.ts` — template for the reader module structure

### Established Patterns
- `readSettings()` in `persistence.ts` catches errors and returns `{ ...defaultSettings }` — the reader follows this "always return a usable value" contract
- Zod schemas in the CLI use `z.object({}).passthrough()` or `.preprocess()` for forward-compatible parsing (see `McpServersSettingsV1Schema`)
- Settings modules export both the Zod schema and the inferred type under a consistent naming convention

### Integration Points
- `persistence.ts` `Settings` interface — add `mcpToolsSettingsV1?: McpToolsSettingsV1` with `import type`
- `apps/cli/src/settings/mcpToolsSettings.ts` — new file, new module

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard Zod patterns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-schema-reader*
*Context gathered: 2026-04-18*
