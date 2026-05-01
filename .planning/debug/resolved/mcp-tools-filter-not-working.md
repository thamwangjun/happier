---
slug: mcp-tools-filter-not-working
status: resolved
created: 2026-05-01
updated: 2026-05-01
trigger: "mcp__happier* tools still exposed to session agent despite sessionAgentToolsSettings default:false with only change_title enabled"
---

# Debug Session: mcp-tools-filter-not-working

## Symptoms

- **Expected:** Only `mcp__happier__change_title` should appear in session agent tool list when `sessionAgentToolsSettings.default=false` and `tools.change_title.enabled=true`
- **Actual:** ALL `mcp__happier__*` tools were passed through to the session agent (30+ tools visible in session log)
- **Error messages:** None — silent failure, tools just appear
- **Timeline:** Never worked — first time enabling this feature
- **Reproduction:** Set `sessionAgentToolsSettings` in `~/.happier/settings.json` with `default:false` + only `change_title` enabled, start daemon, start new session via happier remote mode → all tools appear
- **Config location:** `~/.happier/settings.json` (confirmed correct)
- **Recent context:** Previous fix commit (65df8a468) applied `sessionAgentToolsSettingsV1` filter to STDIO MCP bridge
- **Build state:** Full yarn build + daemon restart + npm link reinstall of happier packages

## Key Questions

1. Where does the daemon actually read `sessionAgentToolsSettings` from? Is the settings.json path `~/.happier/settings.json` correct?
   - ANSWER: Yes, `~/.happier/settings.json` is correct (configuration.ts line 239).
2. Is the config key `sessionAgentToolsSettings` or `sessionAgentToolsSettingsV1`?
   - ANSWER: The code key is `sessionAgentToolsSettingsV1`. The user had the wrong key `sessionAgentToolsSettings`.
3. Does the filter code path actually run when daemon starts a new Claude session via remote mode?
   - ANSWER: Yes. `startHappyServer` reads settings and builds the predicate; `createHappierMcpBridge` passes `HAPPIER_ENABLED_SESSION_AGENT_TOOLS` env var to the STDIO bridge.
4. Could the UI/relay server be overriding or bypassing the local filter?
   - ANSWER: No. The filter is applied entirely on the local daemon side before tools are registered.

## Current Focus

- hypothesis: "Wrong JSON key in settings.json — user wrote `sessionAgentToolsSettings` but code reads `sessionAgentToolsSettingsV1`"
- test: "Rename key in ~/.happier/settings.json and restart daemon"
- expecting: "Only mcp__happier__change_title appears in session tool list"
- next_action: "RESOLVED — fix applied"
- reasoning_checkpoint: "The `readSessionAgentToolsSettings` function reads `settings.sessionAgentToolsSettingsV1`. The user's settings.json had `sessionAgentToolsSettings` (missing V1 suffix). This caused `raw` to always be `undefined`, returning `DEFAULT_SESSION_AGENT_TOOLS_SETTINGS` (empty tools, no default), making `buildIsSessionAgentToolEnabled` return `true` for every tool."

## Evidence

- timestamp: 2026-05-01
  source: apps/cli/src/settings/sessionAgentToolsSettings.ts:39
  content: "const raw = settings.sessionAgentToolsSettingsV1; — code reads V1 key"

- timestamp: 2026-05-01
  source: ~/.happier/settings.json (before fix)
  content: "key was `sessionAgentToolsSettings` (no V1 suffix) — never matched by the reader"

- timestamp: 2026-05-01
  source: apps/cli/src/persistence.ts:118
  content: "Settings interface declares `sessionAgentToolsSettingsV1?: unknown` — confirms the correct key name"

- timestamp: 2026-05-01
  source: apps/cli/src/settings/sessionAgentToolsSettings.ts:40-42
  content: "if (raw === undefined || raw === null) { return DEFAULT_SESSION_AGENT_TOOLS_SETTINGS; } — silent fallback to all-tools-enabled when key not found"

## Eliminated Hypotheses

- Filter code not running in remote mode: eliminated — `resolveRunnerMcpServers` → `createHappierMcpBridge` → `startHappyServer` always runs the filter
- UI/relay server bypassing filter: eliminated — filter is entirely local, applied at daemon startup before STDIO bridge is spawned
- Settings file path wrong: eliminated — `~/.happier/settings.json` is the correct path per configuration.ts

## Resolution

- root_cause: "Wrong JSON key in ~/.happier/settings.json: user wrote `sessionAgentToolsSettings` but the code reads `sessionAgentToolsSettingsV1`. Because the key was missing, `readSessionAgentToolsSettings` silently returned the default (all tools enabled)."
- fix: "Renamed the key from `sessionAgentToolsSettings` to `sessionAgentToolsSettingsV1` in ~/.happier/settings.json. Daemon restart required to pick up the change."
- verification: "After daemon restart, start a new remote session and verify only `mcp__happier__change_title` appears in the session agent tool list."
- files_changed:
  - /home/thamw/.happier/settings.json
