# Phase 3: Validation Feedback - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

At daemon startup, cross-check the tool names present in `sessionAgentToolsSettingsV1.tools` against the known `session_agent` tool catalog. Emit a `warn`-level log when unrecognized names are found, so developers catch typos before wondering why their filtering config has no effect. No behavior changes to filtering logic, no new settings fields, no changes to MCP registration — this phase adds observation only.

</domain>

<decisions>
## Implementation Decisions

### Log level

- **D-01:** Two log levels, two moments — consistent with TOOLS-02 and VALID-01 coexisting without contradiction:
  - **At startup** (config load time): `logger.warn` — fires once per daemon start, visible in the daemon log file. Satisfies VALID-01.
  - **At processing time** (filtering per tool invocation): `logger.debug` — silent in default log setups; config files survive upstream tool renames without log noise. Satisfies TOOLS-02.
  - The startup warn is the primary deliverable of Phase 3. The processing-time debug path is secondary and may be deferred to a follow-up if the planner judges it out of scope for a single plan.

### Validation placement

- **D-02:** Add a new exported function `findUnknownSessionAgentToolNames(settings: SessionAgentToolsSettingsV1, knownNames: string[]): string[]` to `apps/cli/src/settings/sessionAgentToolsSettings.ts`. This is consistent with the Phase 2 pattern of putting settings-domain logic (e.g., `buildIsSessionAgentToolEnabled`) in the settings module as testable exports. The caller (`startHappyServer.ts`) supplies the known-names list — the settings module does not import `listBuiltInHappierTools` directly, keeping dependency direction clean.

### Warning message format

- **D-03:** One aggregated `logger.warn` listing all unknown names **and** the full valid tool catalog inline. The valid names are already available in `startHappyServer.ts` from `listBuiltInHappierTools({ surface: 'session_agent' })`, so no extra catalog import is needed at the warn call site.
  - Example format: `[sessionAgentToolsSettings] Unknown tool names in sessionAgentToolsSettingsV1: ["change-title", "typo_tool"] — these will be ignored. Valid tool names: ["change_title", "memory_search", ...]`
  - Single message keeps the startup log clean. Including valid names allows the developer to self-correct without opening source or docs.

### Claude's Discretion

- Whether `findUnknownSessionAgentToolNames` returns `string[]` (the unknown names) or emits the warn itself — caller can emit or function can emit; planner decides based on what makes tests cleaner.
- Exact warn message wording and array formatting (JSON-like vs comma-separated vs line-separated).
- Whether the processing-time `debug` log (TOOLS-02) is added in the same plan or a separate follow-up; the startup warn (VALID-01) takes priority.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Settings module (primary integration point)
- `apps/cli/src/settings/sessionAgentToolsSettings.ts` — add `findUnknownSessionAgentToolNames` here. Contains existing `SessionAgentToolsSettingsV1Schema`, `readSessionAgentToolsSettingsV1`, and `buildIsSessionAgentToolEnabled` — the new function is a sibling.

### Startup wiring (call site)
- `apps/cli/src/mcp/startHappyServer.ts` — call `findUnknownSessionAgentToolNames` after `readSessionAgentToolsSettingsV1` and emit `logger.warn` if result is non-empty. Already imports `listBuiltInHappierTools` (valid names source) and `logger`.

### Tool catalog (source of known names)
- `apps/cli/src/agent/tools/happierTools/listBuiltInHappierTools.ts` — `listBuiltInHappierTools({ surface: 'session_agent' })` returns the canonical tool set. Already called in `startHappyServer.ts` for `toolNamesSnapshot`.

### Logger
- `apps/cli/src/ui/logger.ts` — `logger.warn(...)` and `logger.debug(...)`.

### Prior phase context (for naming and contract consistency)
- `.planning/phases/01-schema-reader/01-CONTEXT.md` — Phase 1 decisions (schema shape, reader contract)
- `.planning/phases/02-startup-wiring-tool-filtering/02-CONTEXT.md` — Phase 2 decisions (naming conventions, predicate placement, startup wiring pattern)

### Requirements
- TOOLS-02 and VALID-01 in `.planning/REQUIREMENTS.md`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `logger.warn(...)` / `logger.debug(...)` in `apps/cli/src/ui/logger.ts` — already imported in both `sessionAgentToolsSettings.ts` and `startHappyServer.ts`
- `listBuiltInHappierTools({ surface: 'session_agent' })` — already called in `startHappyServer.ts`; result can be mapped to `.name` for the known-names list
- `SessionAgentToolsSettingsV1` type — `settings.tools` is `Record<string, { enabled: boolean }>`, so `Object.keys(settings.tools)` gives the configured names

### Established Patterns
- `buildIsSessionAgentToolEnabled` in `sessionAgentToolsSettings.ts` receives a `SessionAgentToolsSettingsV1` and returns a function — `findUnknownSessionAgentToolNames` follows the same injectable/testable pattern (receives settings + knownNames array, returns unknown names array)
- Existing warn in `readSessionAgentToolsSettingsV1`: `[sessionAgentToolsSettings] sessionAgentToolsSettingsV1 failed schema validation — using defaults. Error: ...` — the new warn uses the same `[sessionAgentToolsSettings]` prefix for consistency

### Integration Points
- `startHappyServer.ts` lines ~40–45: after `buildIsSessionAgentToolEnabled`, before `toolNamesSnapshot` filter — natural insertion point for the unknown-names check
- The `toolNamesSnapshot` computation already uses `listBuiltInHappierTools({ surface: 'session_agent' }).filter(...).map(t => t.name)` — the known-names list for validation is `.map(t => t.name)` without the filter

</code_context>

<specifics>
## Specific Ideas

- The warn message should include both the unknown names AND the valid names inline, so a developer seeing the log can fix their config without opening docs or source.
- Naming: `findUnknownSessionAgentToolNames` (returns unknown names for the caller to decide what to do with them), or alternatively the function emits the warn itself and is named `warnOnUnknownSessionAgentToolNames`. Planner to decide based on testability.
- The `[sessionAgentToolsSettings]` log prefix should be preserved for grep-ability — consistent with the existing schema-validation warn in the same module.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 03-validation-feedback*
*Context gathered: 2026-04-19*
