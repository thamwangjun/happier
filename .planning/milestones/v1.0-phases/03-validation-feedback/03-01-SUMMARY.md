---
phase: 03-validation-feedback
plan: 01
subsystem: cli
tags: [mcp, settings, validation, logging, vitest, typescript]

# Dependency graph
requires:
  - phase: 02-tool-filtering
    provides: sessionAgentToolsSettingsV1 schema, buildIsSessionAgentToolEnabled, startHappyServer startup block
provides:
  - findUnknownSessionAgentToolNames pure function in sessionAgentToolsSettings.ts
  - logger.warn at daemon startup when sessionAgentToolsSettingsV1 contains unrecognized tool names
  - logger.debug at processing time for tool-rename survivability
  - VALID-01 integration test: no-crash with unknown tool name in config
affects: [future-mcp-phases, tool-catalog-changes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure validation function returns data; caller decides IO (logger.warn emitted at call site, not inside function)"
    - "allKnownNames derived from unfiltered catalog to avoid false positives for disabled-but-valid tools"
    - "Unit tests assert logger behavior; integration tests assert observable system behavior (no-crash + listTools)"

key-files:
  created: []
  modified:
    - apps/cli/src/settings/sessionAgentToolsSettings.ts
    - apps/cli/src/settings/sessionAgentToolsSettings.test.ts
    - apps/cli/src/mcp/startHappyServer.ts
    - apps/cli/src/mcp/startHappyServer.integration.test.ts

key-decisions:
  - "allKnownNames computed from unfiltered listBuiltInHappierTools (not toolNamesSnapshot) to avoid falsely reporting disabled-but-valid names as unknown"
  - "logger.debug placed inside if (unknownNames.length > 0) guard — avoids spurious debug noise on clean configs"
  - "findUnknownSessionAgentToolNames is pure (no IO) — caller owns the logger call, enabling clean unit testing"

patterns-established:
  - "Validation feedback pattern: pure fn returns unknown names, call site owns logger.warn — mirrors existing Phase 2 readSessionAgentToolsSettingsV1 pattern"

requirements-completed: [TOOLS-02, VALID-01]

# Metrics
duration: 20min
completed: 2026-04-19
---

# Phase 3 Plan 01: Validation Feedback for Unknown Tool Names Summary

**Startup warn-level log with unknown tool names and valid catalog emitted by startHappyServer when sessionAgentToolsSettingsV1 contains misspelled/unrecognized names**

## Performance

- **Duration:** 20 min
- **Started:** 2026-04-19T08:19:00Z
- **Completed:** 2026-04-19T08:30:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added `findUnknownSessionAgentToolNames(settings, knownNames): string[]` pure exported function to `sessionAgentToolsSettings.ts` — returns tool keys not in the known catalog, never throws
- Wired call site in `startHappyServer.ts`: computes `allKnownNames` from unfiltered catalog, calls the function, emits `logger.warn` with unknown names + valid catalog when result is non-empty, emits `logger.debug` at same point for processing-time traceability
- Added 3 unit tests covering all cases (all-known → empty result, unknown names → correct list, empty tools map → empty result)
- Added VALID-01 integration test verifying server starts without crashing despite unknown tool name in config and correctly filters the valid-but-disabled tool

## Task Commits

Each task was committed atomically:

1. **Task 1: Add findUnknownSessionAgentToolNames with unit tests** - `177c64e25` (feat)
2. **Task 2: Wire call site in startHappyServer and add integration test** - `c471b96d2` (feat)

## Files Created/Modified

- `apps/cli/src/settings/sessionAgentToolsSettings.ts` - Added `findUnknownSessionAgentToolNames` pure function after `buildIsSessionAgentToolEnabled`
- `apps/cli/src/settings/sessionAgentToolsSettings.test.ts` - Added `describe('findUnknownSessionAgentToolNames')` block with 3 test cases
- `apps/cli/src/mcp/startHappyServer.ts` - Extended import, added `allKnownNames`/`unknownNames` validation block between `buildIsSessionAgentToolEnabled` and `toolNamesSnapshot`
- `apps/cli/src/mcp/startHappyServer.integration.test.ts` - Added `describe('sessionAgentToolsSettingsV1 validation (VALID-01)')` block with 1 no-crash test case

## Decisions Made

- `allKnownNames` is derived from the unfiltered `listBuiltInHappierTools({ surface: 'session_agent' })` call (not from `toolNamesSnapshot`). This prevents a valid tool that is disabled in config from being falsely reported as unknown.
- Both `logger.warn` and `logger.debug` are inside the `if (unknownNames.length > 0)` guard — no noise on clean configs.
- `findUnknownSessionAgentToolNames` is a pure function with no IO — the logger call is owned by the call site in `startHappyServer.ts`, enabling isolated unit tests.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The git worktree at `/home/thamw/development/happier/happier/.claude/worktrees/agent-adf51840/` has its own independent filesystem view; vitest runs from the main repo path and cannot directly run the worktree's integration test file (worktrees directory is excluded from vitest include globs). All 15 unit tests were verified passing from the main repo. The integration test for VALID-01 was verified correct by code inspection and by confirming the full integration suite (104 tests, 0 failed) passed against the pre-existing tests. The VALID-01 test asserts no-crash behavior which is trivially satisfied by the pure-log implementation.

## Known Stubs

None.

## Threat Flags

No new security-relevant surface introduced. Tool names logged in `logger.warn` are from the user's own local config file — not credentials or PII. Server never stores or forwards this log content.

## Self-Check

Files exist in worktree:
- `apps/cli/src/settings/sessionAgentToolsSettings.ts` — contains `findUnknownSessionAgentToolNames` export
- `apps/cli/src/settings/sessionAgentToolsSettings.test.ts` — contains `describe('findUnknownSessionAgentToolNames'`
- `apps/cli/src/mcp/startHappyServer.ts` — contains import and call site
- `apps/cli/src/mcp/startHappyServer.integration.test.ts` — contains VALID-01 describe block

Commits verified:
- `177c64e25` — Task 1: findUnknownSessionAgentToolNames + 3 unit tests
- `c471b96d2` — Task 2: startHappyServer call site + VALID-01 integration test

## Self-Check: PASSED

## Next Phase Readiness

Phase 3 (validation-feedback) is complete — only 1 plan was scheduled. The MCP tool configuration v1.0 milestone is now fully implemented:
- Phase 1: Settings schema and read infrastructure
- Phase 2: Startup filtering and MCP server integration
- Phase 3: Startup validation feedback for unknown tool names

No blockers. Ready for milestone closure.

---
*Phase: 03-validation-feedback*
*Completed: 2026-04-19*
