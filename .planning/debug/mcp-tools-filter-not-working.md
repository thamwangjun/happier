---
status: resolved
slug: mcp-tools-filter-not-working
trigger: mcp__happier* tools still exposed to session agent despite sessionAgentToolsSettings with default:false and only change_title enabled
created: 2026-05-01
updated: 2026-05-01
---

# Debug Session: mcp-tools-filter-not-working

## Symptoms

- **Expected:** With `sessionAgentToolsSettings: { v: 1, default: false, tools: { change_title: { enabled: true } } }`, only `mcp__happier__change_title` should be exposed to the session agent
- **Actual:** All `mcp__happier*` tools are still exposed — the full list appears in session tool output
- **Error messages:** No explicit error. The session log shows all mcp__happier* tools listed under "Tools:"
- **Timeline:** Never worked with the key name `sessionAgentToolsSettings` (without V1 suffix). Recent commit "refactor: strip V1 suffix from sessionAgentToolsSettings JSON key" renamed the JSON key, but filtering has never worked under the new name
- **Reproduction:** Start happier remote mode, start a new Claude session — all mcp__happier* tools appear

## Config Details

- Settings file: `~/.happier/settings.json` (user-level happier settings, NOT ~/.claude/settings.json)
- Key in use: `sessionAgentToolsSettings` (post-rename, now corrected back to `sessionAgentToolsSettingsV1`)
- Previous key: `sessionAgentToolsSettingsV1` (pre-rename, and still used by the running daemon)
- Build status: Full yarn build + daemon restart + npm link reinstall done

## Evidence

- timestamp: 2026-05-01
  source: /home/thamw/.happier/logs/2026-05-01-07-33-15-pid-914254.log line 17
  content: "--mcp-config JSON has NO env field: {\"mcpServers\":{\"happier\":{\"command\":\"node\",\"args\":[...\"happyMcpStdioBridge.mjs\",\"--url\",\"http://127.0.0.1:45055/\"]}}}"

- timestamp: 2026-05-01
  source: /home/thamw/.happier/logs/2026-05-01-07-32-53-pid-913613-daemon.log line 1
  content: "Starting happy CLI from DIFFERENT repo: /home/thamw/development/happier/happier/apps/cli/dist/index.mjs"

- timestamp: 2026-05-01
  source: git log in development/happier/happier
  content: "development repo does NOT have commit 2b3ac67e9 (rename sessionAgentToolsSettingsV1 -> sessionAgentToolsSettings)"

- timestamp: 2026-05-01
  source: development/happier/happier/apps/cli/src/settings/sessionAgentToolsSettings.ts:39
  content: "const raw = settings.sessionAgentToolsSettingsV1; -- reads OLD key"

- timestamp: 2026-05-01
  source: /home/thamw/.happier/settings.json (before fix)
  content: "key was sessionAgentToolsSettings (new name) but running daemon reads sessionAgentToolsSettingsV1 -- silent mismatch causing filter to return default (all tools enabled)"

- timestamp: 2026-05-01
  source: development/happier/happier/apps/cli/package-dist/index.mjs (before rebuild)
  content: "grep for HAPPIER_ENABLED_SESSION_AGENT_TOOLS returned 0 matches -- compiled bundle was stale, built before env-forwarding code"

- timestamp: 2026-05-01
  source: apps/cli/src/agent/runtime/createHappierMcpBridge.test.ts (before fix)
  content: "6 out of 7 tests failed with TypeError: Cannot read properties of undefined (reading 'join') -- mock missing toolNames field"

## Eliminated Hypotheses

- Code reads wrong settings key (in gsd-workspace source): eliminated — gsd-workspace source correctly reads sessionAgentToolsSettings
- Filter not applied at all in STDIO bridge: eliminated — registerHappierMcpBridgeTools.ts has isToolEnabled predicate and skips disabled tools
- Settings file path wrong: eliminated — ~/.happier/settings.json is correct
- Claude Code not forwarding env field: moot — env field was never in the --mcp-config JSON due to stale build

## Resolution

root_cause: |
  Two-layer failure. The running daemon is from a DIFFERENT repository copy
  (~development/happier/happier/) whose compiled package-dist/index.mjs was built
  before the env-forwarding code (HAPPIER_ENABLED_SESSION_AGENT_TOOLS) was added
  to createHappierMcpBridge.ts. As a result, the --mcp-config JSON passed to Claude
  Code had no env field, so happyMcpStdioBridge received HAPPIER_ENABLED_SESSION_AGENT_TOOLS=undefined
  and isToolEnabled stayed undefined, enabling all tools unconditionally.

  Additionally, the development repo source reads sessionAgentToolsSettingsV1 (old key)
  but settings.json had sessionAgentToolsSettings (new key after rename commit
  2b3ac67e9 in gsd-workspace), so even if the env var were forwarded the settings
  would silently return the permissive default.

  Finally, createHappierMcpBridge.test.ts mocks were missing toolNames field, causing
  TypeError on .join() — all 6 of 7 env-forwarding-related tests were broken.

fix: |
  Three changes applied:
  1. ~/.happier/settings.json: renamed key from sessionAgentToolsSettings back to
     sessionAgentToolsSettingsV1 to match the development repo daemon source.
  2. Rebuilt development/happier/happier repo (yarn build) so package-dist now
     includes the HAPPIER_ENABLED_SESSION_AGENT_TOOLS env-forwarding code from
     createHappierMcpBridge.ts and the env-var reading code in happyMcpStdioBridge.ts.
  3. Fixed createHappierMcpBridge.test.ts: added toolNames to all startHappyServer
     mocks and updated assertions to expect HAPPIER_ENABLED_SESSION_AGENT_TOOLS in
     env. Added 2 new tests covering the tool list forwarding behavior.

verification: |
  Restart daemon from development/happier/happier (npm-linked installation).
  Start a new Claude session via happier remote mode.
  Confirm the --mcp-config JSON in the daemon log contains an env field:
    HAPPIER_ENABLED_SESSION_AGENT_TOOLS=change_title
  Confirm only mcp__happier__change_title appears in the session agent tool list.
  createHappierMcpBridge.test.ts: all 9 tests pass (verified).

files_changed:
  - /home/thamw/.happier/settings.json (key renamed to sessionAgentToolsSettingsV1)
  - /home/thamw/development/happier/happier/ (rebuilt package-dist via yarn build)
  - apps/cli/src/agent/runtime/createHappierMcpBridge.test.ts (mocks fixed, 2 new tests)
