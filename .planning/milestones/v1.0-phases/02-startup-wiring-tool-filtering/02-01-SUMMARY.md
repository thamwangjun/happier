---
phase: 02-startup-wiring-tool-filtering
plan: "01"
subsystem: cli-settings
tags: [rename, settings, tool-filtering, predicate]
dependency_graph:
  requires: []
  provides:
    - sessionAgentToolsSettings exports (SessionAgentToolsSettingsV1Schema, SessionAgentToolsSettingsV1, DEFAULT_SESSION_AGENT_TOOLS_SETTINGS, readSessionAgentToolsSettingsV1, buildIsSessionAgentToolEnabled)
    - persistence.ts Settings.sessionAgentToolsSettingsV1 field
  affects:
    - apps/cli/src/settings/sessionAgentToolsSettings.ts
    - apps/cli/src/persistence.ts
tech_stack:
  added: []
  patterns:
    - opt-out predicate builder pattern (buildIsSessionAgentToolEnabled returns true for absent keys)
key_files:
  created:
    - apps/cli/src/settings/sessionAgentToolsSettings.ts
    - apps/cli/src/settings/sessionAgentToolsSettings.test.ts
  modified:
    - apps/cli/src/persistence.ts
  deleted:
    - apps/cli/src/settings/mcpToolsSettings.ts
    - apps/cli/src/settings/mcpToolsSettings.test.ts
decisions:
  - "Identifier rename is a pure mechanical substitution — no logic changes, schema definition preserved verbatim"
  - "buildIsSessionAgentToolEnabled uses optional chaining: tools[toolName]?.enabled !== false — single expression, never throws"
metrics:
  duration: "~5 minutes"
  completed: "2026-04-19T05:36:48Z"
  tasks_completed: 2
  files_changed: 5
---

# Phase 02 Plan 01: Rename mcp-branded settings to sessionAgent-branded Summary

## What Was Built

Renamed all Phase 1 `mcp`-branded identifiers to `sessionAgent`-branded identifiers (decision D-01 from 02-CONTEXT.md), and added the `buildIsSessionAgentToolEnabled` predicate builder to the settings module.

The rename is a prerequisite for plan 02-02 (predicate threading), which imports `readSessionAgentToolsSettingsV1` and `buildIsSessionAgentToolEnabled` from the new file.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Rename settings file and update all identifiers (D-01) | af54eee57 | sessionAgentToolsSettings.ts (created), persistence.ts (field rename), mcpToolsSettings.ts (deleted) |
| 2 | Rename test file and update test internals + add predicate tests | 126cafd75 | sessionAgentToolsSettings.test.ts (12 tests), mcpToolsSettings.test.ts (deleted) |

## Key Changes

**apps/cli/src/settings/sessionAgentToolsSettings.ts** — Full rewrite of mcpToolsSettings.ts with:
- `McpToolsSettingsV1Schema` → `SessionAgentToolsSettingsV1Schema`
- `McpToolsSettingsV1` → `SessionAgentToolsSettingsV1`
- `DEFAULT_MCP_TOOLS_SETTINGS` → `DEFAULT_SESSION_AGENT_TOOLS_SETTINGS`
- `readMcpToolsSettingsV1` → `readSessionAgentToolsSettingsV1`
- New export: `buildIsSessionAgentToolEnabled` — opt-out predicate returning `true` when tool absent, `true` when `enabled === true`, `false` only when `enabled === false`

**apps/cli/src/persistence.ts** — JSDoc + field rename:
- `mcpToolsSettingsV1?: unknown` → `sessionAgentToolsSettingsV1?: unknown`

## Verification Results

- `tsc --noEmit`: 0 errors
- `vitest run`: 12 passed, 0 failed (9 reader tests + 3 predicate builder tests)
- Old files `mcpToolsSettings.ts` and `mcpToolsSettings.test.ts` do not exist
- All 5 required exports present in new file

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — pure identifier rename with no new trust boundaries, network endpoints, or file I/O patterns.

## Self-Check: PASSED

- `apps/cli/src/settings/sessionAgentToolsSettings.ts`: FOUND
- `apps/cli/src/settings/sessionAgentToolsSettings.test.ts`: FOUND
- `apps/cli/src/persistence.ts` contains `sessionAgentToolsSettingsV1`: FOUND
- `apps/cli/src/settings/mcpToolsSettings.ts`: MISSING (correctly deleted)
- `apps/cli/src/settings/mcpToolsSettings.test.ts`: MISSING (correctly deleted)
- Commit af54eee57: FOUND
- Commit 126cafd75: FOUND
