---
phase: 01-schema-reader
plan: "01"
subsystem: cli-settings
tags: [zod, settings, mcp, typescript, vitest, tdd]

# Dependency graph
requires: []
provides:
  - McpToolsSettingsV1Schema (Zod schema with z.preprocess, v literal, tools record)
  - McpToolsSettingsV1 type (inferred from schema)
  - DEFAULT_MCP_TOOLS_SETTINGS constant ({ v: 1, tools: {} })
  - readMcpToolsSettingsV1() reader (Settings -> McpToolsSettingsV1, never null, never throws)
  - Settings.mcpToolsSettingsV1 optional field in persistence.ts
affects: [02-startup-wiring, 03-validation-feedback]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "z.preprocess wrapping z.object: absorbs null/non-object values before field validation"
    - "import type { Settings } from '@/persistence' in settings/ modules avoids circular runtime dep"
    - "Absent-key fast path before safeParse: no logger.warn on absent key (D-05 design decision)"
    - "Dynamic import in tests with vi.resetModules() for module isolation"

key-files:
  created:
    - apps/cli/src/settings/mcpToolsSettings.ts
    - apps/cli/src/settings/mcpToolsSettings.test.ts
  modified:
    - apps/cli/src/persistence.ts

key-decisions:
  - "import * as z from 'zod' — matches persistence.ts import style"
  - "z.preprocess wrapping absorbs null/non-object raw values before z.object sees them"
  - "z.literal(1).default(1 as const) — allows blobs with no v field to parse"
  - ".default({}) on tools — allows { v: 1 } with no tools key to parse cleanly"
  - "No .strict() — forward-compatible with future schema additions"
  - "Absent-key fast path returns DEFAULT without safeParse, emits no logger.warn"
  - "import type (not import) for Settings in mcpToolsSettings.ts — type-only, prevents circular runtime dep"
  - "persistence.ts gets import type McpToolsSettingsV1 + mcpToolsSettingsV1?: field; SUPPORTED_SCHEMA_VERSION and defaultSettings unchanged"

patterns-established:
  - "Settings module pattern: pure reader accepts Settings object, returns validated struct, never throws"
  - "z.preprocess + z.object with .default() fields for CLI-local settings schemas"

requirements-completed: [SCHEMA-01, SCHEMA-02]

# Metrics
duration: 25min
completed: 2026-04-19
---

# Phase 01 Plan 01: Schema and Reader Summary

**Zod-validated McpToolsSettingsV1 schema and reader function giving Phase 2 a pure, non-throwing Settings -> McpToolsSettingsV1 accessor with opt-out tool model**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-19T03:32:00Z
- **Completed:** 2026-04-19T03:43:00Z
- **Tasks:** 2 (TDD: RED commit + GREEN commit)
- **Files modified:** 3

## Accomplishments

- Created `mcpToolsSettings.ts` with `McpToolsSettingsV1Schema` (z.preprocess + z.object), `McpToolsSettingsV1` type, `DEFAULT_MCP_TOOLS_SETTINGS = { v: 1, tools: {} }`, and `readMcpToolsSettingsV1()` reader that is always safe (never throws, never returns null)
- Extended `Settings` interface in `persistence.ts` with `mcpToolsSettingsV1?: McpToolsSettingsV1` and `import type` to avoid circular runtime dependency
- 9 unit tests covering all reader contract behaviors: absent key (no warn), undefined key, valid blob, missing v defaults, forward-compat unknown keys, bad v (warn), bad tools (warn), opt-out model (absent tool = undefined), no-warn on absent key

## Task Commits

1. **Task 1 RED: Failing tests** - `ab2377ac5` (test)
2. **Task 1 GREEN: Implementation + persistence.ts field** - `c37157ef4` (feat)

_TDD: RED commit (failing tests) followed by GREEN commit (implementation). persistence.ts change was required for Task 1's implementation to compile, so it was included in the GREEN commit rather than a separate Task 2 commit._

## Files Created/Modified

- `apps/cli/src/settings/mcpToolsSettings.ts` — McpToolsSettingsV1Schema, McpToolsSettingsV1 type, DEFAULT_MCP_TOOLS_SETTINGS constant, readMcpToolsSettingsV1() reader
- `apps/cli/src/settings/mcpToolsSettings.test.ts` — 9 unit tests covering all reader contract behaviors
- `apps/cli/src/persistence.ts` — added `import type { McpToolsSettingsV1 }` and `mcpToolsSettingsV1?: McpToolsSettingsV1` field to Settings interface; no other changes

## Decisions Made

- Used `import * as z from 'zod'` to match the existing `persistence.ts` import style
- Used `z.preprocess` wrapping to absorb null/non-object values before `z.object` validation (per PATTERNS.md Pattern 1)
- Used `z.literal(1).default(1 as const)` to allow blobs with no `v` field to parse cleanly
- Added `.default({})` on tools so `{ "v": 1 }` (no tools key) parses as `{ v: 1, tools: {} }`
- No `.strict()` — forward-compatible with future schema additions
- Absent-key fast path before `safeParse` so no `logger.warn` fires on absent key (D-05)
- `import type` (not `import`) for `Settings` in `mcpToolsSettings.ts` — type-only import erased at runtime, prevents circular dependency since `mcpToolsSettings.ts` uses `import type { Settings } from '@/persistence'`
- `SUPPORTED_SCHEMA_VERSION` left at 6, `defaultSettings` not modified — only the interface declaration and import were changed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] persistence.ts change moved into Task 1 GREEN commit**

- **Found during:** Task 1 GREEN (mcpToolsSettings.ts implementation)
- **Issue:** The plan placed the `persistence.ts` import and field in Task 2, but `mcpToolsSettings.ts` imports `Settings` type and accesses `settings.mcpToolsSettingsV1` — TypeScript reported error TS2339 "Property 'mcpToolsSettingsV1' does not exist on type 'Settings'" without the field. Task 1's `tsc --noEmit` verification criterion could not pass without the persistence.ts change.
- **Fix:** Added `import type { McpToolsSettingsV1 }` and `mcpToolsSettingsV1?: McpToolsSettingsV1` to `persistence.ts` in the Task 1 GREEN commit rather than a separate Task 2 commit.
- **Files modified:** `apps/cli/src/persistence.ts`
- **Verification:** `tsc --noEmit` exits 0, all 9 tests pass
- **Committed in:** `c37157ef4` (Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking, sequencing adjustment)
**Impact on plan:** Minor sequencing change only — all plan deliverables were produced. No scope creep.

## Issues Encountered

- **Worktree node_modules:** The git worktree at `.claude/worktrees/agent-afd32287` had no `node_modules`. Resolved by symlinking `apps/cli/node_modules` and root `node_modules` from the main repo into the worktree, allowing `vitest` and `tsc` to run correctly.
- **Pre-existing test failures:** 2 test files (`cliSnapshot.test.ts`, `liveRemoteSshBootstrap.test.ts`) had 6 failing tests unrelated to this plan's changes (SSH bootstrap and CLI snapshot detection). These were pre-existing failures, logged here for traceability. Not introduced by this plan.

## Known Stubs

None — all exports are fully implemented; no placeholder or TODO values in the implementation.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries. The `readMcpToolsSettingsV1` function is a pure in-memory parser with no I/O.

## Self-Check

- [x] `apps/cli/src/settings/mcpToolsSettings.ts` exists and exports all 4 required symbols
- [x] `apps/cli/src/settings/mcpToolsSettings.test.ts` exists with 9 test cases
- [x] `apps/cli/src/persistence.ts` contains `import type { McpToolsSettingsV1 }` and `mcpToolsSettingsV1?: McpToolsSettingsV1`
- [x] `tsc --noEmit` exits 0 (zero errors)
- [x] All 9 unit tests pass
- [x] Commits exist: `ab2377ac5` (test RED), `c37157ef4` (feat GREEN)
- [x] `SUPPORTED_SCHEMA_VERSION` unchanged at 6
- [x] `defaultSettings` does not contain `mcpToolsSettingsV1`

## Self-Check: PASSED

## Next Phase Readiness

Phase 2 (startup wiring) can now call `readMcpToolsSettingsV1(settings)` in `startHappyServer.ts` after `readSettings()`. The predicate for Phase 2's tool filter is: `(toolName: string) => settings.tools[toolName]?.enabled !== false` (opt-out model: absent = enabled).

Phase 3 (validation feedback) can import `McpToolsSettingsV1Schema` directly for schema-level validation messaging.

---
*Phase: 01-schema-reader*
*Completed: 2026-04-19*
