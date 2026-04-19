---
phase: 02-startup-wiring-tool-filtering
verified: 2026-04-19T07:00:00Z
status: human_needed
score: 8/8
overrides_applied: 0
human_verification:
  - test: "Restart the daemon after editing ~/.happier/settings.json with change_title: enabled: false. Connect an MCP inspector or Claude Code and call listTools."
    expected: "change_title is absent from the tool list"
    why_human: "Integration tests use a temp HAPPIER_HOME_DIR. The true production path through readSettings() reading the real ~/.happier/settings.json on daemon restart can only be confirmed by a human running the daemon."
  - test: "Write a corrupt sessionAgentToolsSettingsV1 value (e.g., sessionAgentToolsSettingsV1: 'bad_string') to ~/.happier/settings.json and start the daemon."
    expected: "All tools are still available (no crash). The daemon log shows a [sessionAgentToolsSettings] warn entry."
    why_human: "STARTUP-03 logger.warn behavior is unit-tested, but the daemon startup log output can only be confirmed by a human inspecting the log file after running the daemon."
---

# Phase 2: Startup Wiring & Tool Filtering — Verification Report

**Phase Goal:** MCP server startup reads the config once and only registers tools the developer has left enabled
**Verified:** 2026-04-19T07:00:00Z
**Status:** human_needed — all automated checks pass; 2 behavioral items need human confirmation
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | After editing settings.json to disable a tool, restarting the daemon causes that tool to disappear from the MCP tool list | VERIFIED | Integration test `hides a tool disabled via sessionAgentToolsSettingsV1 from listTools response` confirms this end-to-end with a real MCP HTTP server and settings file. `startHappyServer.ts` line 39 reads settings once at startup; line 65–68 passes the predicate per request. |
| 2 | A developer with no settings.json (or no sessionAgentToolsSettingsV1 key) sees all tools available — no behavior change from pre-feature state | VERIFIED | Integration test `enables all tools when no settings file exists (STARTUP-02)` confirms via real MCP client. Reader returns `DEFAULT_SESSION_AGENT_TOOLS_SETTINGS` silently when key is absent (sessionAgentToolsSettings.ts lines 39–41). |
| 3 | A developer with a corrupt or schema-invalid sessionAgentToolsSettingsV1 value sees all tools available and finds a warning in the daemon log; the daemon does not crash | VERIFIED (unit) | Unit test `returns default and emits logger.warn when v is not 1` and `returns default and emits logger.warn when tools is not a record` confirm the graceful fallback and warn path. Full daemon restart with corrupt settings requires human verification. |
| 4 | Tool visibility is determined once at startup, not re-evaluated per MCP request | VERIFIED | `startHappyServer.ts` lines 38–46: `readSettings()`, `readSessionAgentToolsSettingsV1()`, `buildIsSessionAgentToolEnabled()` all called in the outer async body. `createServer` handler at line 53 only closes over the already-computed `isSessionAgentToolEnabled`. The predicate closure is reused per request, not recomputed. |

**Score:** 4/4 roadmap success criteria verified (SC-3 has human follow-up)

### PLAN Must-Haves

#### Plan 02-01 Must-Haves

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | All Phase 1 mcp-branded identifiers are gone from the CLI settings layer; sessionAgent-branded identifiers replace them | VERIFIED | `mcpToolsSettings.ts` and `mcpToolsSettings.test.ts` do not exist. No `mcpToolsSettingsV1`, `readMcpToolsSettingsV1`, `DEFAULT_MCP_TOOLS_SETTINGS`, or `McpToolsSettingsV1` found in any non-test source file under `apps/cli/src/`. |
| 2 | The renamed reader still returns default silently for absent key (STARTUP-02) | VERIFIED | `sessionAgentToolsSettings.ts` lines 39–41: `if (raw === undefined \|\| raw === null) return DEFAULT_SESSION_AGENT_TOOLS_SETTINGS;`. 2 unit tests confirm. |
| 3 | The renamed reader still emits logger.warn and returns default for schema validation failure (STARTUP-03) | VERIFIED | `sessionAgentToolsSettings.ts` lines 43–46: `logger.warn(...)` then returns default. 2 unit tests confirm. |
| 4 | buildIsSessionAgentToolEnabled returns true for absent tool names (opt-out model, SCHEMA-02) | VERIFIED | `sessionAgentToolsSettings.ts` line 60: `settings.tools[toolName]?.enabled !== false` — absent entry is `undefined`, `undefined !== false` is `true`. Unit test confirms. |
| 5 | buildIsSessionAgentToolEnabled returns false only when enabled === false | VERIFIED | Same expression. Unit test `returns false when enabled === false` confirms. |
| 6 | All 9 original reader tests pass under the new names | VERIFIED | 9 reader tests present in `sessionAgentToolsSettings.test.ts` lines 29–106; all use `sessionAgentToolsSettingsV1` key names. SUMMARY reports 12 passed / 0 failed. |
| 7 | 3 new predicate builder tests pass | VERIFIED | `buildIsSessionAgentToolEnabled` describe block at lines 108–135 contains 3 tests. SUMMARY reports all 12 passed. |

#### Plan 02-02 Must-Haves

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | startHappyServer reads settings exactly once before createServer(), not inside the per-request handler (STARTUP-01, D-04) | VERIFIED | `startHappyServer.ts` lines 38–46: `readSettings()` at line 39, `createServer(...)` at line 53. Settings read and predicate are computed before the server is created. |
| 2 | The isSessionAgentToolEnabled predicate is computed once in startHappyServer and passed into every per-request createHappierMcpServer call via opts (D-04) | VERIFIED | Lines 65–68: `createHappierMcpServer(client, { credentials: ..., isSessionAgentToolEnabled })`. The closure captures the pre-computed predicate. |
| 3 | createHappierMcpServer forwards opts.isSessionAgentToolEnabled to registerHappierMcpBuiltInTools (TOOLS-01) | VERIFIED | `createHappierMcpServer.ts` line 180: `isSessionAgentToolEnabled: opts?.isSessionAgentToolEnabled`. Two unit tests assert this forwarding. |
| 4 | registerHappierMcpBuiltInTools filters tools with the predicate before registering; absent predicate defaults to all-enabled (TOOLS-01, STARTUP-02) | VERIFIED | `registerHappierMcpBuiltInTools.ts` lines 20–22: `const predicate = params.isSessionAgentToolEnabled ?? (() => true); const enabledTools = allTools.filter((tool) => predicate(tool.name));`. 4 unit tests confirm all predicate behaviors. |
| 5 | startHappyServer toolNames snapshot reflects only enabled tools (D-06) | VERIFIED | `startHappyServer.ts` lines 44–46: `listBuiltInHappierTools(...).filter((tool) => isSessionAgentToolEnabled(tool.name)).map(...)`. Integration test `returns startHappyServer toolNames without the disabled tool` confirms. |
| 6 | registerHappierMcpResources call has a one-line comment explaining it is not subject to sessionAgentToolsSettingsV1 filtering (D-07) | VERIFIED | `createHappierMcpServer.ts` line 162: `// resources use their own isActionEnabled callback — not subject to sessionAgentToolsSettingsV1 filtering`. |
| 7 | Unit tests assert predicate forwarding in createHappierMcpServer and predicate application in registerHappierMcpBuiltInTools | VERIFIED | `createHappierMcpServer.test.ts` lines 345–402: 2 forwarding tests. `registerHappierMcpBuiltInTools.test.ts`: 4 predicate application tests. |

#### Plan 02-03 Must-Haves

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A tool with enabled:false in settings.json is absent from the MCP listTools response (TOOLS-01 end-to-end) | VERIFIED | `startHappyServer.integration.test.ts` line 666: test `hides a tool disabled via sessionAgentToolsSettingsV1 from listTools response` with real MCP client and settings file. |
| 2 | startHappyServer.toolNames does not include the disabled tool (D-06 end-to-end) | VERIFIED | Integration test `returns startHappyServer toolNames without the disabled tool (D-06)` at line 701. |
| 3 | When no settings.json exists, all tools are present in the MCP listTools response (STARTUP-02 end-to-end) | VERIFIED | Integration test `enables all tools when no settings file exists (STARTUP-02)` at line 729. |
| 4 | Each integration test isolates its settings via a temp dir + reloadConfiguration() — does not read ~/.happier/settings.json | VERIFIED | `beforeEach` at line 650–657: creates temp dir, applies env, calls `reloadConfiguration()`. `afterEach` at line 659–664: restores env, reloads, removes temp dir. |
| 5 | The integration test suite passes after the source changes from plans 01 and 02 | VERIFIED | SUMMARY-03 reports 9 passed (6 pre-existing + 3 new), 0 failed. |

**Overall Score:** 8/8 must-have groups verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/cli/src/settings/sessionAgentToolsSettings.ts` | 5 exports: schema, type, default, reader, predicate | VERIFIED | All 5 exports present. File is substantive (62 lines, real Zod schema + reader + predicate). Imported by `startHappyServer.ts` line 12. |
| `apps/cli/src/settings/sessionAgentToolsSettings.test.ts` | 9 reader tests + 3 predicate builder tests (12 total) | VERIFIED | 12 tests present, all using `sessionAgentToolsSettingsV1` identifiers. |
| `apps/cli/src/persistence.ts` | `sessionAgentToolsSettingsV1?: unknown` field | VERIFIED | Line 118: `sessionAgentToolsSettingsV1?: unknown`. JSDoc updated. No `mcpToolsSettingsV1`. |
| `apps/cli/src/mcp/startHappyServer.ts` | Settings read + predicate at startup, isSessionAgentToolEnabled passed to createHappierMcpServer | VERIFIED | Lines 38–46 (outer body), lines 65–68 (per-request call). |
| `apps/cli/src/mcp/createHappierMcpServer.ts` | Extended opts type, predicate forwarded, D-07 comment | VERIFIED | Lines 28–31 (opts type), line 162 (D-07 comment), line 180 (forwarding). |
| `apps/cli/src/mcp/server/registerHappierMcpBuiltInTools.ts` | isSessionAgentToolEnabled param, predicate filter before loop | VERIFIED | Lines 17 (param), 20–22 (allTools/predicate/enabledTools pattern). |
| `apps/cli/src/mcp/server/registerHappierMcpBuiltInTools.test.ts` | 4 unit tests (new file) | VERIFIED | 4 tests present covering: no predicate, exclude by name, include by name, toolNames matches registered. |
| `apps/cli/src/mcp/createHappierMcpServer.test.ts` | 2 new forwarding assertion tests | VERIFIED | Tests at lines 345–373 and 375–402. |
| `apps/cli/src/mcp/startHappyServer.integration.test.ts` | 3 new integration tests in new describe block | VERIFIED | `sessionAgentToolsSettingsV1 filtering (TOOLS-01)` describe block at line 646, 3 tests. |
| `apps/cli/src/settings/mcpToolsSettings.ts` | Must NOT exist (deleted) | VERIFIED | File not found (correctly deleted). |
| `apps/cli/src/settings/mcpToolsSettings.test.ts` | Must NOT exist (deleted) | VERIFIED | File not found (correctly deleted). |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `persistence.ts` | `settings/sessionAgentToolsSettings.ts` | `Settings.sessionAgentToolsSettingsV1` field | VERIFIED | `sessionAgentToolsSettings.ts` line 12: `import type { Settings } from '@/persistence'`. `persistence.ts` line 118: field present. |
| `settings/sessionAgentToolsSettings.ts` | `persistence.ts` | `import type { Settings }` | VERIFIED | Line 12 of sessionAgentToolsSettings.ts. |
| `startHappyServer.ts` | `settings/sessionAgentToolsSettings.ts` | `readSessionAgentToolsSettingsV1 + buildIsSessionAgentToolEnabled` imports | VERIFIED | `startHappyServer.ts` line 12: both functions imported and called at lines 40–41. |
| `startHappyServer.ts` | `createHappierMcpServer.ts` | `isSessionAgentToolEnabled` in opts | VERIFIED | Line 65–68: `isSessionAgentToolEnabled` passed in opts literal. |
| `createHappierMcpServer.ts` | `server/registerHappierMcpBuiltInTools.ts` | `opts?.isSessionAgentToolEnabled` in params | VERIFIED | Line 180: `isSessionAgentToolEnabled: opts?.isSessionAgentToolEnabled` in the call. |

---

## Data-Flow Trace (Level 4)

The phase produces predicate-filtered tool registration rather than rendered UI data. Level 4 trace focuses on whether the data source (settings file) flows through to observable output (MCP tool list).

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `startHappyServer.ts` | `isSessionAgentToolEnabled` predicate | `readSettings()` → `readSessionAgentToolsSettingsV1()` → `buildIsSessionAgentToolEnabled()` | Yes — `readSettings()` reads actual settings.json from `configuration.settingsFile` | FLOWING |
| `registerHappierMcpBuiltInTools.ts` | `enabledTools` array | `listBuiltInHappierTools()` filtered by `predicate(tool.name)` | Yes — filters real tool catalog; returns only tools passing predicate | FLOWING |
| `startHappyServer.ts` `toolNames` return | `toolNamesSnapshot` | Same `isSessionAgentToolEnabled` closure | Yes — `.filter()` applied to real tool list at lines 44–46 | FLOWING |

No hollow props or disconnected data paths found.

---

## Behavioral Spot-Checks

Step 7b skipped for production artifacts — integration tests serve as the behavioral verification layer. Integration tests require a real MCP client and TCP server, which would violate the "no new services" constraint on spot-checks. The human verification items below cover the remaining production-path behaviors.

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| STARTUP-01 | 02-02, 02-03 | MCP server reads mcpToolsSettingsV1 from settings once at startHappyServer startup (not per-request) | SATISFIED | `startHappyServer.ts` lines 38–46 in outer async body, before `createServer()` at line 53. |
| STARTUP-02 | 02-01, 02-02, 02-03 | Absent/missing settings key → all tools enabled (safe default) | SATISFIED | Reader returns `DEFAULT_SESSION_AGENT_TOOLS_SETTINGS` on absent key (line 40–41). Predicate `() => true` default in registerHappierMcpBuiltInTools. Integration test confirms. |
| STARTUP-03 | 02-01 | Config fails Zod validation → all tools enabled + logger.warn, no crash | SATISFIED | Reader emits `logger.warn(...)` at line 44 and returns default. 2 unit tests cover both failure modes. |
| TOOLS-01 | 02-02, 02-03 | Only tools with enabled:true (or absent) are registered with McpServer at startup | SATISFIED | `registerHappierMcpBuiltInTools.ts` lines 20–22 apply predicate before registration. Integration test confirms end-to-end. |

**Orphaned requirement check:** REQUIREMENTS.md maps TOOLS-02 and VALID-01 to Phase 3 — not in scope for Phase 2. SCHEMA-01 and SCHEMA-02 are Phase 1. No orphaned requirements for Phase 2.

**Note on SCHEMA-02 cross-reference:** SCHEMA-02 (opt-out model) is Phase 1, but Phase 2 implements it structurally via `buildIsSessionAgentToolEnabled` returning `true` for absent tool names. The predicate builder satisfies the opt-out contract at the registration layer.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | — |

No TODO/FIXME/PLACEHOLDER comments, no stub return values, no hardcoded empty data, and no console.log-only handlers found in any of the 8 phase-modified files.

---

## Human Verification Required

### 1. Full production daemon restart with disabled tool

**Test:** Edit `~/.happier/settings.json` (or `$HAPPIER_HOME_DIR/settings.json`) to add `"sessionAgentToolsSettingsV1": { "v": 1, "tools": { "change_title": { "enabled": false } } }`. Stop the daemon (`happier daemon stop`) and restart it (`happier daemon start`). Connect Claude Code or an MCP inspector and call `tools/list`.
**Expected:** `change_title` is absent from the tool list. All other tools remain available.
**Why human:** Integration tests use a synthetic temp dir and fake MCP client in a controlled test process. The production code path uses the real `readSettings()` function reading from the daemon's actual `$HAPPIER_HOME_DIR/settings.json` on a real restart. While the integration tests cover this logic, the true end-to-end production behavior on daemon restart can only be confirmed by a human running the live daemon.

### 2. Daemon log confirms warn on corrupt sessionAgentToolsSettingsV1

**Test:** Set `"sessionAgentToolsSettingsV1": "this_is_not_an_object"` in `~/.happier/settings.json`. Start the daemon and inspect the log file in `~/.happier-dev/logs/`.
**Expected:** All tools appear in the tool list (graceful fallback). The daemon log contains a `[sessionAgentToolsSettings] sessionAgentToolsSettingsV1 failed schema validation` warn entry. The daemon does not crash.
**Why human:** STARTUP-03 logger.warn behavior is covered by unit tests for the reader function, but the warn path within a real running daemon process (including whether pino routes the warn to the log file at the expected level) requires a human to inspect the live daemon log output.

---

## Gaps Summary

No automated gaps found. All 8 must-have groups pass. All 4 requirements (STARTUP-01, STARTUP-02, STARTUP-03, TOOLS-01) are satisfied by codebase evidence.

Two behavioral items require human confirmation before this phase can be marked fully passed. These are production-path validations that automated checks cannot cover: (1) tool visibility on real daemon restart, and (2) warn log output in the live daemon process.

---

_Verified: 2026-04-19T07:00:00Z_
_Verifier: Claude (gsd-verifier)_
