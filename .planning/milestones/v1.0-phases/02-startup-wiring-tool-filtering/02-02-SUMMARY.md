---
phase: 02-startup-wiring-tool-filtering
plan: "02"
subsystem: cli-mcp
tags: [mcp, tool-filtering, predicate, startup-wiring]
dependency_graph:
  requires:
    - 02-01 (sessionAgentToolsSettings exports: readSessionAgentToolsSettingsV1, buildIsSessionAgentToolEnabled)
  provides:
    - isSessionAgentToolEnabled predicate threaded from startHappyServer through createHappierMcpServer into registerHappierMcpBuiltInTools
    - Tool filtering at registration time (tools with enabled:false are not registered)
    - toolNamesSnapshot in startHappyServer reflects only enabled tools (D-06)
  affects:
    - apps/cli/src/mcp/startHappyServer.ts
    - apps/cli/src/mcp/createHappierMcpServer.ts
    - apps/cli/src/mcp/server/registerHappierMcpBuiltInTools.ts
tech_stack:
  added: []
  patterns:
    - predicate threading pattern (computed once at startup, passed through opts into registration)
    - opt-out predicate default (absent predicate defaults to () => true, all tools enabled)
    - D-07 comment pattern (resources exempt from sessionAgentToolsSettingsV1 filtering)
key_files:
  created:
    - apps/cli/src/mcp/server/registerHappierMcpBuiltInTools.test.ts
  modified:
    - apps/cli/src/mcp/server/registerHappierMcpBuiltInTools.ts
    - apps/cli/src/mcp/createHappierMcpServer.ts
    - apps/cli/src/mcp/startHappyServer.ts
    - apps/cli/src/mcp/createHappierMcpServer.test.ts
decisions:
  - "Settings read once in outer async body of startHappyServer (STARTUP-01) — not inside createServer() per-request handler; predicate closure reused per request (D-04)"
  - "Absent predicate in registerHappierMcpBuiltInTools defaults to () => true (all-enabled) to preserve backward compatibility (STARTUP-02)"
  - "D-07: registerHappierMcpResources uses its own isActionEnabled callback and is explicitly not subject to sessionAgentToolsSettingsV1 filtering — documented with inline comment"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-19T05:43:00Z"
  tasks_completed: 2
  files_changed: 5
---

# Phase 02 Plan 02: Startup Wiring & Tool Filtering Summary

## What Was Built

Wired the `isSessionAgentToolEnabled` predicate from `sessionAgentToolsSettingsV1` settings through the full MCP startup chain. `startHappyServer` now reads settings exactly once at startup, computes a predicate, and passes it through `createHappierMcpServer` into `registerHappierMcpBuiltInTools` where it filters tools before registration.

This is the behavioral core of Phase 2 — tool filtering now has runtime effect. A tool with `enabled: false` in `sessionAgentToolsSettingsV1` will not be registered in the MCP server and will not appear in `listTools` responses or in the `toolNames` snapshot returned from `startHappyServer`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Apply predicate filter in registerHappierMcpBuiltInTools + write unit tests | 7306eaa9e | registerHappierMcpBuiltInTools.ts (modified), registerHappierMcpBuiltInTools.test.ts (created, 4 tests) |
| 2 | Thread predicate through createHappierMcpServer + startHappyServer; extend createHappierMcpServer tests | d337047d6 | createHappierMcpServer.ts, startHappyServer.ts, createHappierMcpServer.test.ts (+2 tests) |

## Key Changes

**apps/cli/src/mcp/server/registerHappierMcpBuiltInTools.ts** — Predicate param + filtered registration:
- Added `isSessionAgentToolEnabled?: (toolName: string) => boolean` to params type
- Replaced single `listBuiltInHappierTools` call with `allTools / predicate / enabledTools` filter pattern
- Absent predicate defaults to `() => true` (all tools enabled — backward compatible)

**apps/cli/src/mcp/createHappierMcpServer.ts** — Opts extension + predicate threading + D-07 comment:
- Extended opts type: `isSessionAgentToolEnabled?: (toolName: string) => boolean`
- Added D-07 inline comment before `registerHappierMcpResources`: resources use own `isActionEnabled`, not subject to `sessionAgentToolsSettingsV1` filtering
- Added `isSessionAgentToolEnabled: opts?.isSessionAgentToolEnabled` to `registerHappierMcpBuiltInTools` call

**apps/cli/src/mcp/startHappyServer.ts** — Settings read at startup + predicate computation + filtered snapshot:
- Added imports: `readSettings` from `@/persistence`; `readSessionAgentToolsSettingsV1`, `buildIsSessionAgentToolEnabled` from `@/settings/sessionAgentToolsSettings`
- Settings read (`await readSettings()`) placed in outer async body before `createServer()` call (STARTUP-01)
- `isSessionAgentToolEnabled` predicate computed once, passed to every per-request `createHappierMcpServer` call (D-04)
- `toolNamesSnapshot` filtered through predicate — only enabled tools (D-06)

**apps/cli/src/mcp/server/registerHappierMcpBuiltInTools.test.ts** (NEW) — 4 unit tests:
- No predicate: all tools registered, `toolNames` matches registered
- Predicate returns false for name: tool omitted from both `toolNames` and `registered`
- Predicate returns true for name: tool present in both
- `toolNames` return value equals registered list exactly

**apps/cli/src/mcp/createHappierMcpServer.test.ts** — 2 new forwarding assertion tests:
- `forwards isSessionAgentToolEnabled to registerHappierMcpBuiltInTools when provided`
- `passes undefined isSessionAgentToolEnabled to registerHappierMcpBuiltInTools when opts omits it`

## Verification Results

- `tsc --noEmit`: 0 errors
- `vitest run` (targeted): 28 passed, 0 failed (12 sessionAgentToolsSettings + 4 registerHappierMcpBuiltInTools + 12 createHappierMcpServer)
- `vitest run` (full suite): 5890 passed, 6 pre-existing failures in unrelated files (see Deferred Items)
- All wiring assertions confirmed via grep:
  - `isSessionAgentToolEnabled` present in all 3 modified source files
  - `readSettings()` at line 39, `createServer` at line 53 — settings read before server creation
  - D-07 comment present at `registerHappierMcpResources` call site

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Deferred Items

6 pre-existing test failures in files unrelated to this plan:
- `src/capabilities/snapshots/cliSnapshot.test.ts` — 1 failure
- `src/capabilities/systemTasks/ssh/liveRemoteSshBootstrap.test.ts` — 5 failures
- `src/backends/claude/remote/agentSdk/repairClaudeTranscriptAfterInterrupt.test.ts` — 1 failure
- `src/api/machine/rpcHandlers.sessionHandoff.test.ts` — 1 failure

These were failing before this plan's changes and are outside its scope.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries introduced. The settings read uses the existing fault-tolerant `readSettings()` function.

## Self-Check: PASSED

- `apps/cli/src/mcp/server/registerHappierMcpBuiltInTools.ts`: FOUND
- `apps/cli/src/mcp/server/registerHappierMcpBuiltInTools.test.ts`: FOUND
- `apps/cli/src/mcp/createHappierMcpServer.ts`: FOUND
- `apps/cli/src/mcp/startHappyServer.ts`: FOUND
- `apps/cli/src/mcp/createHappierMcpServer.test.ts`: FOUND
- Commit 7306eaa9e: FOUND
- Commit d337047d6: FOUND
