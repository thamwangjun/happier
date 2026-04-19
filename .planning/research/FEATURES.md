# Feature Analysis: MCP Tool Configuration (Per-Tool Enable/Disable)

**Domain:** Developer tooling — MCP bridge tool filtering for AI coding agents
**Researched:** 2026-04-18
**Overall confidence:** HIGH (codebase verified; ecosystem patterns confirmed via multiple sources)

---

## Context

The existing Happier MCP bridge (`apps/cli/src/mcp/`) exposes built-in tools to AI agents. The tool catalog is built from `HAPPIER_BUILT_IN_TOOLS` (in `catalog.ts`), which merges `MANUAL_TOOLS` (`change_title`, `action_execute`, `execution_run_start`) with action-backed tools from protocol's `listActionSpecs()`. A surface-based filter (`listBuiltInHappierTools`) already gates which tools appear on each surface (`mcp`, `session_agent`, `cli`). The missing piece: a user-editable settings file that further controls which named tools are exposed on the MCP surface.

The existing pattern for action enablement (`ActionsSettingsV1Schema`, `HAPPIER_ACTIONS_SETTINGS_V1` env var, `isActionEnabledByActionsSettings`) is the closest prior art in this codebase. It uses `{ v: 1, actions: { "action.id": { enabled: false } } }`.

The settings file lives at `~/.happier-dev/settings.json` (path: `configuration.settingsFile`). It is read by `readSettings()` in `persistence.ts`, which merges with defaults and tolerates unknown fields via a merge strategy.

---

## Table Stakes

Features users expect. Missing = the feature feels incomplete or untrustworthy.

| Feature | Why Expected | Complexity | Confidence |
|---------|-------------|------------|------------|
| Per-tool `enabled: false` switch by exact tool name | The foundational ask — users must be able to suppress a specific tool | Low | HIGH (codebase pattern exists in `ActionsSettingsV1Schema`) |
| All-tools-on by default (opt-out, not opt-in) | Users expect existing MCP tools to keep working without editing settings | Low | HIGH (universal pattern across Claude Code, OpenCode, VS Code Copilot) |
| Settings in `~/.happier-dev/settings.json` | Consistent with existing `Settings` struct and `configuration.settingsFile` | Low | HIGH (PROJECT.md specifies this path) |
| Graceful handling of unknown tool names in config | A tool name may be mis-typed or a tool may be removed in a future version — the CLI must not crash | Low | HIGH (OpenCode, Claude Code both silently ignore unknown; ecosystem standard) |
| Settings take effect at MCP server startup | Consistent with how `HAPPIER_ACTIONS_SETTINGS_V1` is read — at startup, not hot-reloaded | Low | HIGH (matches existing `listBuiltInHappierTools` call-site in `startHappyServer.ts`) |
| JSON format, hand-editable | PROJECT.md: "Settings file format that is easy to hand-edit" | Low | HIGH (explicit requirement) |

---

## Differentiators

Features that add value beyond the minimum. Not expected by users, but worthwhile.

| Feature | Value Proposition | Complexity | Confidence |
|---------|------------------|------------|------------|
| Warn (log) on unknown tool names in config | Developer-facing tooling should surface mis-typed tool names at startup rather than silently ignoring; turns a silent no-op into an actionable log line | Low | MEDIUM (ecosystem tooling generally fails silently; explicit warning is a quality step-up) |
| Expose enabled tool list in `happier mcp status` or similar CLI | Lets users verify what was actually applied without reading source code | Low | MEDIUM (VS Code surfaces this via `/mcp` panel; Claude Code via tool discovery) |
| `mcpToolsSettingsV1` versioned key in settings.json | Mirrors `actionsSettingsV1` / `mcpServersSettingsV1` naming convention — forward-compatible, can evolve schema version independently | Low | HIGH (codebase convention: `readMcpServersSettingsFromAccountSettings` uses `mcpServersSettingsV1` key) |
| `enabled: true` explicit opt-in (useful if a future "strict mode" default-deny is ever added) | Enables future strict mode without a breaking schema change | Low | LOW (premature for v1.0; adds schema complexity for no immediate use) |

---

## Anti-Features / Out of Scope

Features to explicitly exclude from v1.0 scope, with rationale.

| Anti-Feature | Why Avoid | What to Do Instead |
|-------------|-----------|-------------------|
| Per-project `.mcp.json` overrides | PROJECT.md explicitly defers this: "user-global settings first" | Implement in a later milestone once global settings pattern is proven |
| Remote / server-side tool configuration | Would require server schema changes and E2E encryption considerations; out of scope for a local config file feature | Keep config purely local (`~/.happier-dev/settings.json`) |
| UI for editing tool settings | PROJECT.md: "hand-edit only for v1.0" | Implement in a later milestone after format is stable |
| Wildcard / glob-based tool matching | Adds complexity with minimal v1.0 benefit given the small tool catalog; Claude Code feature request for this was filed but not shipped as of 2026-04 | Exact name matching only for v1.0; extend later if catalog grows |
| Category-based grouping | No category taxonomy exists on `HappierBuiltInToolDefinition`; inventing one now adds scope | Defer until category metadata is modeled |
| Hot-reload / watch of settings file | Requires daemon-side file watcher; the existing `HAPPIER_ACTIONS_SETTINGS_V1` pattern is startup-read-only | Read at startup; document that daemon restart is required |
| Regex / pattern matching | Adds parser complexity and attack surface; not needed for a small static tool catalog | Exact names only |
| Tool-level approval required (approve/deny mode) | The existing `ActionsSettingsV1Schema` already handles approval at the action level; duplicating that concern in tool settings is confusing | Use `actionsSettingsV1` approval surfaces if per-action approval is needed |

---

## Settings File Format

### Recommendation: Exact Name Map, `enabled` Boolean, Opt-Out Default

Use a flat `Record<toolName, { enabled: boolean }>` under a versioned key `mcpToolsSettingsV1` in `~/.happier-dev/settings.json`. This matches the existing `actionsSettingsV1` and `mcpServersSettingsV1` patterns in the codebase exactly.

**Confidence: HIGH** — Pattern is consistent with `ActionsSettingsV1Schema` (codebase verified), `McpServersSettingsV1Schema` (codebase verified), and the VS Code / OpenCode ecosystem norm of a versioned settings blob.

### Concrete format

```json
{
  "schemaVersion": 6,
  "mcpToolsSettingsV1": {
    "v": 1,
    "tools": {
      "change_title": { "enabled": false },
      "execution_run_start": { "enabled": false }
    }
  }
}
```

### Field semantics

| Field | Type | Default | Meaning |
|-------|------|---------|---------|
| `mcpToolsSettingsV1.v` | `1` (literal) | required | Schema version; allows future migration without breaking parsing |
| `mcpToolsSettingsV1.tools` | `Record<string, { enabled: boolean }>` | `{}` | Per-tool overrides; absent = enabled |
| `tools["<name>"].enabled` | `boolean` | `true` (implicit) | `false` suppresses the tool from the MCP surface |

### Why not alternatives

| Option | Why Rejected |
|--------|-------------|
| Allowlist array `["tool_a", "tool_b"]` | Requires editing the list every time a new tool is added; breaks new tools silently; opt-in semantics differ from every comparable tool in the ecosystem |
| Denylist array `["tool_a"]` | Simpler but loses extensibility — can't add per-tool metadata later (e.g. approval mode) without a format break |
| Glob patterns | Not needed for a static 10–20 tool catalog; adds regex/glob parser complexity |
| Top-level `disabledMcpTools: ["tool_a"]` | Flat arrays can't carry per-tool metadata; not forward-compatible; inconsistent with existing schema patterns |
| Separate config file | Splits the mental model; `settings.json` is already the established home for daemon settings |

### Unknown tool name handling

**Recommendation: silently ignore unknown tool names, log at DEBUG level.**

Rationale: the existing `ActionsSettingsV1Schema` transform silently drops unknown action ids (`if (!parsedId.success) continue;`). Matching this behavior ensures consistency and prevents crashes when tools are renamed or removed in future versions. A DEBUG-level log line (not WARN, not ERROR) is the right addition — it helps developers who mis-type a name without alarming users who have an older settings file.

This matches ecosystem practice: Claude Code ignores unknown MCP server config keys, OpenCode ignores unknown tools in its permission map.

### Zod schema pattern (mirrors existing codebase style)

```typescript
const McpToolOverrideSchema = z.object({
  enabled: z.boolean().optional(),
}).strict();

export const McpToolsSettingsV1Schema = z
  .object({
    v: z.literal(1),
    tools: z.record(z.string(), McpToolOverrideSchema).default({}),
  })
  .passthrough()
  .transform((value) => {
    // Filter to known tool names; unknown keys are silently dropped (matches ActionsSettingsV1Schema pattern)
    const next: Record<string, McpToolOverride> = {};
    for (const [name, override] of Object.entries(value.tools ?? {})) {
      if (HAPPIER_BUILT_IN_TOOL_NAMES.includes(name as any)) {
        next[name] = override;
      }
      // else: unknown name — silently ignore (log at DEBUG in caller)
    }
    return { v: 1 as const, tools: next };
  });
```

---

## Feature Dependencies

```
Settings file read (persistence.ts readSettings) → parse mcpToolsSettingsV1 → filter in listBuiltInHappierTools
```

The filter should be applied inside `listBuiltInHappierTools` (or a wrapper) when `surface === 'mcp'`, after the existing surface filter. No changes required to the MCP server registration layer (`registerHappierMcpBuiltInTools`) or the protocol package.

---

## MVP Recommendation

1. Add `McpToolsSettingsV1Schema` to `packages/protocol/src/` (or `apps/cli/src/settings/`) — mirrors `ActionsSettingsV1Schema` structure
2. Add `mcpToolsSettingsV1` key to `Settings` interface in `persistence.ts` (opaque `unknown`, like `memory`) — parsed by a dedicated reader
3. Add `readMcpToolsSettingsFromSettings(settings: Settings): McpToolsSettingsV1` reader (mirrors `readMcpServersSettingsFromAccountSettings`)
4. Add `isMcpToolEnabledBySettings(toolName: string, settings: McpToolsSettingsV1): boolean` (mirrors `isActionEnabledByActionsSettings`)
5. Thread through `listBuiltInHappierTools` when `surface === 'mcp'`
6. Log unknown tool names at DEBUG in the reader (not in the filter loop, to avoid noise per-request)

Defer: wildcard support, per-project overrides, UI, hot-reload.

---

## Sources

- Codebase: `apps/cli/src/settings/actionsSettings.ts` — existing `ActionsSettingsV1` pattern (HIGH confidence)
- Codebase: `packages/protocol/src/actions/actionSettings.ts` — Zod schema for action settings (HIGH confidence)
- Codebase: `packages/protocol/src/account/settings/accountSettings.ts` — `actionsSettingsV1` field in `AccountSettings`, default settings for `session_agent` surface (HIGH confidence)
- Codebase: `apps/cli/src/mcp/servers/readMcpServersSettingsFromAccountSettings.ts` — `mcpServersSettingsV1` pattern (HIGH confidence)
- Codebase: `apps/cli/src/agent/tools/happierTools/listBuiltInHappierTools.ts` — where surface filter applies (HIGH confidence)
- Codebase: `apps/cli/src/persistence.ts` — `Settings` struct and `readSettings()` function (HIGH confidence)
- Ecosystem: GitHub issue anthropics/claude-code#7328 — Claude Code per-tool MCP filtering (requested, not yet shipped as of 2026-04) (MEDIUM confidence)
- Ecosystem: OpenCode docs `opencode.ai/docs/tools/` — `permission: { "toolName": "allow|deny|ask", "mymcp_*": "ask" }` pattern (MEDIUM confidence)
- Ecosystem: VS Code MCP config reference — server-level enable/disable; no per-tool API exposed yet (MEDIUM confidence)
- Ecosystem: `@respawn-app/tool-filter-mcp` npm package — allowlist/denylist CLI proxy approach (LOW confidence; proxy pattern is not the right fit for built-in tools)
