# MCP Tool Filtering (`sessionAgentToolsSettingsV1`)

This document covers two audiences:

- **Users** who want to selectively disable built-in MCP tools for the session agent.
- **Contributors** who need to understand how the filter chain is wired without reading multiple source files.

---

## Part 1 — User Guide

### What it does

`sessionAgentToolsSettingsV1` is a CLI-local setting that controls which Happier built-in MCP tools the session agent can call. You can disable any tool by name, and the agent will not be able to invoke it during a session. Filtering happens entirely on your machine — the relay server is never involved, and no configuration is sent over the network.

### Settings file location

```
~/.happier/settings.json
```

If you have set the `HAPPIER_HOME_DIR` environment variable, the file is read from `$HAPPIER_HOME_DIR/settings.json` instead.

### Schema

Add the following top-level key to your `settings.json`:

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

Field reference:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `v` | `1` (literal) | No (defaults to `1`) | Schema version. Omitting is allowed; the CLI will insert `1` automatically. |
| `tools` | object | No | Map of tool name → `{ "enabled": boolean }`. An empty object (or omitting the key entirely) enables all tools. |
| `default` | `boolean` | No | Global enabled/disabled baseline for all unconfigured tools. Omitting this field preserves the default opt-out behaviour (all tools enabled). |

### Default behavior (opt-out model)

- If `sessionAgentToolsSettingsV1` is **absent** from `settings.json`, all tools are enabled.
- If the `tools` map is present but a particular tool name is **not listed**, that tool is enabled.
- A tool is disabled **only** when its entry explicitly has `"enabled": false`.

### Examples

#### Example A — Disable a single tool

Prevent the session agent from starting a voice agent:

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

#### Example B — Disable multiple tools

Block the agent from delegating to subagents or starting a review:

```json
{
  "sessionAgentToolsSettingsV1": {
    "v": 1,
    "tools": {
      "subagents_delegate_start": { "enabled": false },
      "subagents_plan_start": { "enabled": false },
      "review_start": { "enabled": false }
    }
  }
}
```

#### Example C — Explicitly re-enable a tool

If you previously disabled a tool and want to re-enable it, set `"enabled": true`. This is a no-op for tools that were never disabled, but it can be useful for clarity:

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

#### Example D — Disable all tools

Run the session agent with no Happier built-in tools exposed — useful for locked-down or read-only sessions:

```json
{
  "sessionAgentToolsSettingsV1": {
    "v": 1,
    "tools": {
      "change_title": { "enabled": false },
      "action_execute": { "enabled": false },
      "execution_run_start": { "enabled": false },
      "action_spec_search": { "enabled": false },
      "action_spec_get": { "enabled": false },
      "action_options_resolve": { "enabled": false },
      "review_start": { "enabled": false },
      "subagents_plan_start": { "enabled": false },
      "subagents_delegate_start": { "enabled": false },
      "voice_agent_start": { "enabled": false },
      "execution_run_list": { "enabled": false },
      "execution_run_get": { "enabled": false },
      "execution_run_send": { "enabled": false },
      "execution_run_stop": { "enabled": false },
      "execution_run_action": { "enabled": false },
      "execution_run_wait": { "enabled": false },
      "agents_backends_list": { "enabled": false },
      "agents_models_list": { "enabled": false },
      "session_message_send": { "enabled": false },
      "session_stop": { "enabled": false },
      "session_title_set": { "enabled": false },
      "session_permission_mode_set": { "enabled": false },
      "session_model_set": { "enabled": false },
      "session_archive": { "enabled": false },
      "session_unarchive": { "enabled": false },
      "session_status_get": { "enabled": false },
      "session_history_get": { "enabled": false },
      "session_wait_idle": { "enabled": false },
      "session_permission_respond": { "enabled": false },
      "session_user_action_answer": { "enabled": false },
      "session_list": { "enabled": false },
      "session_activity_get": { "enabled": false },
      "session_messages_recent_get": { "enabled": false },
      "memory_search": { "enabled": false },
      "memory_get_window": { "enabled": false },
      "memory_ensure_up_to_date": { "enabled": false }
    }
  }
}
```

> **Note:** This list is provided for reference only. If a tool name is renamed or removed, the daemon emits a `logger.warn` at startup for unrecognised names but continues normally. Use `happier tools list` (if available) to get the current catalog.

#### Example E — Opt-in mode (allow only specific tools)

To restrict the session agent to a small explicit allowlist, set `"default": false` to disable all tools by default, then selectively re-enable only the tools you need. Any tool without an explicit `"enabled": true` entry will be blocked:

```json
{
  "sessionAgentToolsSettingsV1": {
    "v": 1,
    "default": false,
    "tools": {
      "session_status_get": { "enabled": true },
      "session_history_get": { "enabled": true },
      "session_messages_recent_get": { "enabled": true }
    }
  }
}
```

This configuration exposes only the three read-only session inspection tools and blocks everything else — useful for automated pipelines or auditing scenarios where write operations must be prevented.

### Error handling

- If `sessionAgentToolsSettingsV1` is **absent or malformed**, the CLI silently falls back to defaults (all tools enabled). The daemon will not fail to start.
- **Unknown tool names** — if a name in the `tools` map does not match any registered tool, the daemon emits a `logger.warn` at startup and otherwise ignores the entry. Your configuration file is not rejected.

This means you can safely add a tool name in advance of an upgrade, or keep old entries after a tool is renamed; the daemon will warn but continue.

### When does filtering take effect?

Settings are read **once when the daemon starts**. After editing `settings.json`, restart the daemon for changes to take effect:

```
happier daemon stop && happier daemon start
```

---

## Part 2 — Architecture / Contributor Notes

### Design constraints

Tool filtering is implemented entirely in the CLI (`apps/cli/`). The relay server stores only ciphertext and never sees plaintext session content, so server-side configuration is neither needed nor possible. All filtering decisions are made locally before any MCP tool is registered.

### Filter chain

The following four-step sequence runs at daemon startup:

1. **Read settings** — `apps/cli/src/mcp/startHappyServer.ts` calls `readSettings()`, then passes the result to `readSessionAgentToolsSettings(settings)` and `buildIsSessionAgentToolEnabled(toolsSettings)` to produce the `isSessionAgentToolEnabled` predicate. This happens once; the predicate is reused for every subsequent MCP request.

2. **Warn on unknown names** — `findUnknownSessionAgentToolNames(toolsSettings, allKnownNames)` is called against the full unfiltered tool catalog. Any unrecognized tool names emit `logger.warn` at startup. The daemon continues normally.

3. **Per-request server creation** — `createHappierMcpServer(client, { isSessionAgentToolEnabled })` is called for each incoming MCP client connection. The predicate is forwarded as an option.

4. **Tool registration** — `registerHappierMcpBuiltInTools()` in `apps/cli/src/mcp/server/registerHappierMcpBuiltInTools.ts` calls `allTools.filter(predicate)` before the MCP registration loop. If no predicate is provided, the default is `() => true` (all tools enabled).

### Schema reader contract

`readSessionAgentToolsSettings` in `apps/cli/src/settings/sessionAgentToolsSettings.ts` **never throws**. Its behavior on edge cases:

- Absent key → returns `DEFAULT_SESSION_AGENT_TOOLS_SETTINGS` (`{ v: 1, tools: {} }`) silently.
- Zod parse failure → returns the same default and emits `logger.warn`.

Callers can rely on always receiving a valid `SessionAgentToolsSettings` object.

### Predicate logic

The predicate built by `buildIsSessionAgentToolEnabled` uses a three-level lookup:

```typescript
export function buildIsSessionAgentToolEnabled(
    settings: SessionAgentToolsSettings,
): (toolName: string) => boolean {
    return (toolName: string) => {
        const perTool = settings.tools[toolName];
        if (perTool !== undefined) {
            return perTool.enabled;
        }
        return settings.default ?? true;
    };
}
```

Lookup order:
1. **Per-tool entry** — if `settings.tools[toolName]` exists, its `enabled` field is authoritative.
2. **Global default** — if no per-tool entry exists, fall back to `settings.default`.
3. **Hardcoded fallback** — if `settings.default` is also absent, return `true` (backward-compatible opt-out model).

### Settings field location

The field is declared in the `Settings` interface in `apps/cli/src/persistence.ts` as:

```typescript
sessionAgentToolsSettingsV1?: unknown;
```

It is typed as `unknown` to decouple the persistence layer from the settings schema version. Always access it through `readSessionAgentToolsSettings(settings)` — never cast or read the raw field directly.

### Adding a new filterable tool

A built-in tool becomes filterable **automatically** when it is registered via `registerHappierMcpBuiltInTools`. No changes to the settings schema or reader are required. Add the new tool name to the reference table below once it is included in the catalog.

---

## Tool Name Reference

All tool names that can appear in the `tools` map of `sessionAgentToolsSettingsV1`.

### Core tools

These three tools are always registered directly (not via the action-backed protocol path):

| Tool name | Description |
|-----------|-------------|
| `change_title` | Change the title of the current chat session |
| `action_execute` | Execute a Happier action by action ID with structured input |
| `execution_run_start` | Start an execution run (review / plan / delegate / voice agent) |

### Action-backed tools

These tools are generated from protocol action specs that have `mcpToolName` bindings:

| Tool name | Description |
|-----------|-------------|
| `action_options_resolve` | Resolve available options for an action input field |
| `action_spec_get` | Get the full spec for a single action by ID |
| `action_spec_search` | Search the action catalog by keyword |
| `agents_backends_list` | List available agent backend providers |
| `agents_models_list` | List available models for a given agent backend |
| `execution_run_action` | Run a specific action within an execution run |
| `execution_run_get` | Get the current state of an execution run |
| `execution_run_list` | List execution runs for the current session |
| `execution_run_send` | Send a message or input to an active execution run |
| `execution_run_stop` | Stop an active execution run |
| `execution_run_wait` | Wait for an execution run to reach a terminal state |
| `memory_ensure_up_to_date` | Ensure session memory is current before reading |
| `memory_get_window` | Retrieve the current memory window for the session |
| `memory_search` | Search session memory by query |
| `review_start` | Start a structured review of agent output |
| `session_activity_get` | Get recent activity summary for a session |
| `session_archive` | Archive a session |
| `session_history_get` | Get the full message history for a session |
| `session_list` | List all sessions for the current user |
| `session_message_send` | Send a message into a session |
| `session_messages_recent_get` | Get the most recent messages from a session |
| `session_model_set` | Change the active model for a session |
| `session_permission_mode_set` | Set the permission approval mode for a session |
| `session_permission_respond` | Respond to a pending permission request |
| `session_status_get` | Get the current status of a session |
| `session_stop` | Stop a running session |
| `session_title_set` | Set the title of a session |
| `session_unarchive` | Unarchive a previously archived session |
| `session_user_action_answer` | Answer a user-action prompt raised by the agent |
| `session_wait_idle` | Wait until a session returns to an idle state |
| `subagents_delegate_start` | Delegate a task to a subagent |
| `subagents_plan_start` | Start a planning subagent |
| `voice_agent_start` | Start a voice-enabled agent interaction |
