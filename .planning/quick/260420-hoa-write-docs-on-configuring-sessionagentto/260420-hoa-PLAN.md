---
phase: quick
plan: 260420-hoa
type: execute
wave: 1
depends_on: []
files_modified:
  - docs/mcp-tool-filtering.md
autonomous: true
requirements:
  - HOA-write-mcp-tool-filtering-docs
must_haves:
  truths:
    - "A developer can read docs/mcp-tool-filtering.md and know exactly what to put in settings.json to disable a specific MCP tool"
    - "A contributor can read the architecture section and trace the full filter chain from settings.json to MCP registration without reading source code"
    - "The doc explains the opt-out default model (absent key = tool enabled)"
    - "The doc includes a complete reference list of all filterable tool names"
  artifacts:
    - path: "docs/mcp-tool-filtering.md"
      provides: "User guide + architecture reference for sessionAgentToolsSettingsV1"
      min_lines: 80
  key_links:
    - from: "docs/mcp-tool-filtering.md"
      to: "apps/cli/src/settings/sessionAgentToolsSettings.ts"
      via: "Architecture section cites source file"
---

<objective>
Write docs/mcp-tool-filtering.md covering sessionAgentToolsSettingsV1 MCP tool filtering.

Purpose: Developers need to know how to selectively disable Happier built-in MCP tools for the session agent surface. Contributors need to understand the filter chain wiring without reading multiple source files.
Output: docs/mcp-tool-filtering.md — a single doc covering user guide (what/how/examples) and architecture/contributor notes (how the wiring works).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md

<interfaces>
<!-- Key types and contracts extracted from the codebase for the executor. -->
<!-- Executor uses these directly — no codebase exploration needed. -->

From apps/cli/src/settings/sessionAgentToolsSettings.ts:

Schema (Zod):
```typescript
export const SessionAgentToolsSettingsV1Schema = z.preprocess(
    (raw) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
        return raw;
    },
    z.object({
        v: z.literal(1).default(1 as const),
        tools: z.record(z.string(), z.object({ enabled: z.boolean() })).default({}),
    }),
);
export type SessionAgentToolsSettingsV1 = z.infer<typeof SessionAgentToolsSettingsV1Schema>;
```

Key functions:
```typescript
// Never throws. Absent key or parse failure → returns DEFAULT (silent).
export function readSessionAgentToolsSettingsV1(settings: Settings): SessionAgentToolsSettingsV1

// Opt-out model: absent tool name → enabled. enabled===false → disabled.
export function buildIsSessionAgentToolEnabled(
    settings: SessionAgentToolsSettingsV1,
): (toolName: string) => boolean
// Implementation: (toolName) => settings.tools[toolName]?.enabled !== false

// Returns tool names in config that don't exist in the catalog (for startup warnings).
export function findUnknownSessionAgentToolNames(
    settings: SessionAgentToolsSettingsV1,
    knownNames: string[],
): string[]
```

From apps/cli/src/persistence.ts (Settings interface field):
```typescript
/**
 * Per-tool session-agent enable/disable configuration (CLI-local; schema-validated).
 * Parsed/normalized by `settings/sessionAgentToolsSettings.ts`.
 * Stored as raw JSON — always access via `readSessionAgentToolsSettingsV1(settings)`.
 */
sessionAgentToolsSettingsV1?: unknown;
```

Settings file path: `~/.happier/settings.json`
(Override via HAPPIER_HOME_DIR env var — path becomes `$HAPPIER_HOME_DIR/settings.json`)

Filter chain (startup):
1. `startHappyServer.ts` calls `readSettings()` → `readSessionAgentToolsSettingsV1(settings)` → `buildIsSessionAgentToolEnabled(toolsSettings)` once at startup.
2. `findUnknownSessionAgentToolNames(toolsSettings, allKnownNames)` emits logger.warn for any unrecognized tool names.
3. Per-request: `createHappierMcpServer(client, { isSessionAgentToolEnabled })` is called.
4. Inside `registerHappierMcpBuiltInTools`: `allTools.filter(predicate)` runs before registration loop. Absent predicate defaults to `() => true`.

Key design decisions:
- Filtering is CLI-local (server never sees plaintext; no server-side config needed).
- Settings are read once at daemon startup, not per-request.
- Opt-out model: a tool absent from `tools` map is enabled by default.
- Invalid/missing config silently falls back to defaults (all tools enabled) — no startup failure.
- Unknown tool names emit a `logger.warn` at startup but are otherwise ignored; config survives tool renames.

Full list of filterable tool names (session_agent surface):

Manual tools (always registered):
- change_title
- action_execute
- execution_run_start

Action-backed tools (from protocol actionSpecs with mcpToolName bindings):
- action_options_resolve
- action_spec_get
- action_spec_search
- agents_backends_list
- agents_models_list
- execution_run_action
- execution_run_get
- execution_run_list
- execution_run_send
- execution_run_stop
- execution_run_wait
- memory_ensure_up_to_date
- memory_get_window
- memory_search
- review_start
- session_activity_get
- session_archive
- session_history_get
- session_list
- session_message_send
- session_messages_recent_get
- session_model_set
- session_permission_mode_set
- session_permission_respond
- session_spawn_new
- session_status_get
- session_stop
- session_target_primary_set
- session_target_tracked_set
- session_title_set
- session_unarchive
- session_user_action_answer
- session_wait_idle
- subagents_delegate_start
- subagents_plan_start
- voice_agent_start
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Write docs/mcp-tool-filtering.md</name>
  <files>docs/mcp-tool-filtering.md</files>
  <action>
Create docs/mcp-tool-filtering.md. The docs/ directory already exists at the repo root.

The document must cover two audiences in one file, separated by a clear heading:

## Part 1 — User Guide (configuring the feature)

Cover in order:
1. **What it does** — one-paragraph summary: `sessionAgentToolsSettingsV1` is a CLI-local setting that controls which Happier built-in MCP tools the session agent can call. Filtering happens entirely on your machine; the server is never involved.

2. **Settings file location** — `~/.happier/settings.json`. Note that `HAPPIER_HOME_DIR` env var overrides the base directory.

3. **Schema** — show the JSON shape with inline comments:
   ```json
   {
     "sessionAgentToolsSettingsV1": {
       "v": 1,
       "tools": {
         "<tool_name>": { "enabled": true | false }
       }
     }
   }
   ```
   Explain fields: `v` must be `1`. `tools` is a map of tool name → `{ "enabled": boolean }`.

4. **Default behavior (opt-out model)** — absent key means the entire feature is disabled (all tools enabled). A tool name absent from `tools` is also enabled by default. Only `"enabled": false` disables a tool.

5. **Examples** — provide three concrete, copy-pasteable examples embedded in a full settings.json skeleton showing only the relevant fields (use `...` for other fields):

   Example A — Disable a single tool (`voice_agent_start`):
   ```json
   {
     "sessionAgentToolsSettingsV1": {
       "v": 1,
       "tools": {
         "voice_agent_start": { "enabled": false }
       }
     }
   }
   ```

   Example B — Disable multiple tools (`session_spawn_new`, `subagents_delegate_start`, `subagents_plan_start`):
   ```json
   {
     "sessionAgentToolsSettingsV1": {
       "v": 1,
       "tools": {
         "session_spawn_new": { "enabled": false },
         "subagents_delegate_start": { "enabled": false },
         "subagents_plan_start": { "enabled": false }
       }
     }
   }
   ```

   Example C — Explicitly re-enable a tool (no-op unless previously disabled — useful for clarity):
   ```json
   {
     "sessionAgentToolsSettingsV1": {
       "v": 1,
       "tools": {
         "voice_agent_start": { "enabled": true }
       }
     }
   }
   ```

6. **Error handling** — if `sessionAgentToolsSettingsV1` is absent or malformed, the CLI silently falls back to defaults (all tools enabled). No restart error. Unknown tool names in the `tools` map emit a warning in the daemon log at startup and are ignored.

7. **Complete tool name reference** — a two-column markdown table listing all filterable tool names and a brief description. Use the full list from the interfaces block above. Group into two subsections: "Core tools" (the three manual tools) and "Action-backed tools" (everything else from the protocol action specs).

   For "Core tools" use these descriptions:
   - `change_title` — Change the title of the current chat session
   - `action_execute` — Execute a Happier action by action ID with structured input
   - `execution_run_start` — Start an execution run (review / plan / delegate / voice agent)

   For "Action-backed tools" derive brief descriptions from their names (e.g. `session_spawn_new` → "Spawn a new agent session", `memory_search` → "Search session memory", etc.).

8. **When does filtering take effect** — settings are read once when the daemon starts. Restart the daemon after editing settings.json for changes to take effect.

## Part 2 — Architecture / Contributor Notes

Cover in order:
1. **Design constraints** — filtering is CLI-local (server stores only ciphertext, never plaintext session content); no server-side config needed or possible.

2. **Filter chain** — describe the four-step startup chain using the actual file paths:
   - `apps/cli/src/mcp/startHappyServer.ts` reads settings once at daemon startup via `readSettings()`, calls `readSessionAgentToolsSettingsV1(settings)` and `buildIsSessionAgentToolEnabled(toolsSettings)` to build the predicate.
   - `findUnknownSessionAgentToolNames()` is called against the full unfiltered catalog; unknown names emit `logger.warn` at startup.
   - Per-request: `createHappierMcpServer()` receives `isSessionAgentToolEnabled` as an option.
   - `registerHappierMcpBuiltInTools()` in `apps/cli/src/mcp/server/registerHappierMcpBuiltInTools.ts` calls `allTools.filter(predicate)` before the MCP registration loop. Absent predicate defaults to `() => true` (all tools enabled).

3. **Schema reader contract** — `readSessionAgentToolsSettingsV1` never throws. Absent key or Zod parse failure → returns `DEFAULT_SESSION_AGENT_TOOLS_SETTINGS` (`{ v: 1, tools: {} }`) and emits `logger.warn` on parse failure only. File path: `apps/cli/src/settings/sessionAgentToolsSettings.ts`.

4. **Predicate logic** — the predicate is `(toolName) => settings.tools[toolName]?.enabled !== false`. This is the opt-out model: anything not explicitly set to `false` is enabled.

5. **Settings field location** — `sessionAgentToolsSettingsV1?: unknown` in the `Settings` interface in `apps/cli/src/persistence.ts`. Stored as raw JSON (`unknown`) to avoid runtime schema coupling; always read through `readSessionAgentToolsSettingsV1`.

6. **Adding a new filterable tool** — a built-in tool becomes filterable automatically when it is registered via `registerHappierMcpBuiltInTools`. No changes to the settings schema or reader are needed. The tool name appears in the reference table above once it is added to the catalog.

Keep prose concise. Use code blocks for all file paths and tool names. Do not use HTML or JSX. Standard GitHub-flavored markdown only.
  </action>
  <verify>
    <automated>test -f /home/thamw/development/happier/happier/docs/mcp-tool-filtering.md && wc -l /home/thamw/development/happier/happier/docs/mcp-tool-filtering.md | awk '{if ($1 >= 80) exit 0; else exit 1}'</automated>
  </verify>
  <done>
    - docs/mcp-tool-filtering.md exists with at least 80 lines
    - Contains a JSON schema example with v=1 and tools map
    - Contains at least two copy-pasteable settings.json examples
    - Contains the full tool name reference table (all 38+ tools)
    - Contains the architecture section describing the filter chain with actual source file paths
    - Contains the opt-out model explanation
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| filesystem → CLI | settings.json is read from the local filesystem; malformed input must not crash the daemon |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-hoa-01 | Tampering | settings.json | accept | File is local to the developer's machine; schema validation already silently falls back to defaults on malformed input — no additional mitigation needed for a doc-writing task |
</threat_model>

<verification>
- docs/mcp-tool-filtering.md exists at repo root docs/
- File has a user guide section and an architecture section
- At least two complete settings.json examples are present
- Full tool name reference table is present and includes all tools from the interfaces block
- Architecture section names the four source files in the filter chain
</verification>

<success_criteria>
A developer unfamiliar with the feature can read docs/mcp-tool-filtering.md and correctly configure sessionAgentToolsSettingsV1 in settings.json without reading source code. A contributor can trace the full filter chain from settings.json to MCP tool registration using only the file paths cited in the architecture section.
</success_criteria>

<output>
After completion, create `.planning/quick/260420-hoa-write-docs-on-configuring-sessionagentto/260420-hoa-SUMMARY.md`
</output>
