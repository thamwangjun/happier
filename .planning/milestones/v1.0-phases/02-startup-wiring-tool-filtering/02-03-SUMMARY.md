---
phase: 02-startup-wiring-tool-filtering
plan: "03"
subsystem: cli-mcp
tags: [integration-test, mcp, tool-filtering, TOOLS-01, STARTUP-02]
note_d06: "All references to sessionAgentToolsSettingsV1 in this summary are historical. The JSON key was renamed to sessionAgentToolsSettings per D-06 (2026-05-01)."
dependency_graph:
  requires:
    - 02-01 (sessionAgentToolsSettings exports: readSessionAgentToolsSettingsV1, buildIsSessionAgentToolEnabled)
    - 02-02 (predicate threading through startHappyServer → createHappierMcpServer → registerHappierMcpBuiltInTools)
  provides:
    - End-to-end integration tests for TOOLS-01 and STARTUP-02 behaviors via real MCP HTTP server
  affects:
    - apps/cli/src/mcp/startHappyServer.integration.test.ts
tech_stack:
  added: []
  patterns:
    - env isolation pattern: snapshotEnvValues + applyEnvValues + reloadConfiguration() + createTempDir per test
    - settings file fixture: write JSON to temp dir, startHappyServer reads it via readSettings()
key_files:
  created: []
  modified:
    - apps/cli/src/mcp/startHappyServer.integration.test.ts
decisions:
  - "snapshotEnvValues called synchronously at describe scope (not inside beforeEach) — safe because it only snapshots at suite initialization time, not at test execution time"
  - "afterEach restores env and reloads configuration before removeTempDir to prevent leaked env from affecting other tests"
metrics:
  duration: "~8 minutes"
  completed: "2026-04-19T05:53:36Z"
  tasks_completed: 1
  files_changed: 1
---

# Phase 02 Plan 03: TOOLS-01 and STARTUP-02 Integration Tests Summary

## What Was Built

Added 3 end-to-end integration tests to `startHappyServer.integration.test.ts` that exercise the TOOLS-01 filtering behavior through a real MCP HTTP server. The tests write settings fixtures to a temp dir, start the server, connect an MCP client, and assert which tools are present or absent in the `listTools` response.

These tests confirm the full chain — settings file → `readSettings()` → `buildIsSessionAgentToolEnabled` predicate → `registerHappierMcpBuiltInTools` filter → MCP protocol response — works end-to-end without mocks.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add TOOLS-01 and STARTUP-02 integration tests to startHappyServer.integration.test.ts | 1b158d13e | startHappyServer.integration.test.ts (+112 lines) |

## Key Changes

**apps/cli/src/mcp/startHappyServer.integration.test.ts** — New imports + new describe block:
- Added `writeFile` from `node:fs/promises` and `join` from `node:path`
- Added `applyEnvValues`, `restoreEnvValues`, `snapshotEnvValues` from `@/testkit/env/envSnapshot`
- Added `createTempDir`, `removeTempDir` from `@/testkit/fs/tempDir`
- New describe block `sessionAgentToolsSettingsV1 filtering (TOOLS-01)` with 3 tests:

**Test 1: hides a tool disabled via sessionAgentToolsSettingsV1 from listTools response**
- Writes settings.json with `change_title: { enabled: false }` to temp homeDir
- Connects real MCP client, calls `listTools()`
- Asserts `change_title` absent from response, other tools still present

**Test 2: returns startHappyServer toolNames without the disabled tool (D-06)**
- Same settings fixture as Test 1
- Does not connect MCP client — asserts directly on `server.toolNames` snapshot
- Confirms D-06 behavior: toolNames reflects filtering at startup time

**Test 3: enables all tools when no settings file exists (STARTUP-02)**
- homeDir exists (created by beforeEach) but no settings.json is written
- Connects real MCP client, calls `listTools()`
- Asserts `change_title` present — absent settings file means all tools enabled

## Verification Results

- Integration tests: 9 passed (6 pre-existing + 3 new), 0 failed
- `tsc --noEmit`: 0 errors
- Full unit suite: 5890 passed, 6 pre-existing failures in unrelated files (same as plan 02-02 deferred items)
- `grep "sessionAgentToolsSettingsV1"` returns 4 matches in test file

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Deferred Items

6 pre-existing test failures in files unrelated to this plan (unchanged from plan 02-02):
- `src/capabilities/snapshots/cliSnapshot.test.ts` — 1 failure
- `src/capabilities/systemTasks/ssh/liveRemoteSshBootstrap.test.ts` — 5 failures
- `src/backends/claude/remote/agentSdk/repairClaudeTranscriptAfterInterrupt.test.ts` — 1 failure
- `src/api/machine/rpcHandlers.sessionHandoff.test.ts` — 1 failure

## Threat Flags

None — test code only. Tests write to controlled temp directories with no real secrets. The threat model accepted this under T-02-03-01 (Information Disclosure: test temp dir, accept disposition).

## Self-Check: PASSED

- `apps/cli/src/mcp/startHappyServer.integration.test.ts` contains `sessionAgentToolsSettingsV1 filtering (TOOLS-01)`: FOUND
- 3 new tests present in file: FOUND
- Commit 1b158d13e: FOUND
- `tsc --noEmit` exits 0: CONFIRMED
- Integration test suite: 9/9 passed: CONFIRMED
