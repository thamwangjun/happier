---
phase: 04-schema-predicate
plan: 01
subsystem: cli
tags: [zod, schema, predicate, mcp, tool-filtering, settings]

# Dependency graph
requires: []
provides:
  - SessionAgentToolsSettingsSchema with optional default?: boolean field
  - readSessionAgentToolsSettings reader (renamed from V1)
  - buildIsSessionAgentToolEnabled with 3-level lookup (per-tool → default → true)
  - 6 new test cases covering SCHEMA-01, SCHEMA-02, SCHEMA-03, SCHEMA-04, VALID-01
affects: [05-docs, any plan referencing sessionAgentToolsSettings]

# Tech tracking
tech-stack:
  added: []
  patterns: [3-level predicate lookup: per-tool entry → global default → true fallback]

key-files:
  created: []
  modified:
    - apps/cli/src/settings/sessionAgentToolsSettings.ts
    - apps/cli/src/settings/sessionAgentToolsSettings.test.ts
    - apps/cli/src/mcp/startHappyServer.ts
    - apps/cli/src/persistence.ts

key-decisions:
  - "Used z.boolean().optional() without .default() so absence is distinguishable from explicit true at predicate level"
  - "Predicate uses ?? true (not ?? false) for backward-compatible opt-out fallback"
  - "JSON key sessionAgentToolsSettingsV1 in settings.json NOT renamed per D-03 — only TypeScript identifiers renamed"

patterns-established:
  - "3-level predicate lookup: per-tool entry → settings.default → true (backward-compatible opt-out)"
  - "Schema field absence vs. explicit false is distinguishable via z.boolean().optional() without default"

requirements-completed: [SCHEMA-01, SCHEMA-02, SCHEMA-03, SCHEMA-04, VALID-01]

# Metrics
duration: 15min
completed: 2026-04-22
---

# Phase 04 Plan 01: Schema & Predicate Summary

**Extended SessionAgentToolsSettings schema with optional `default?: boolean` field implementing 3-level predicate lookup (per-tool → global default → true), and renamed all V1-suffixed TypeScript identifiers across settings module, test file, and call site**

## Performance

- **Duration:** 15 min
- **Started:** 2026-04-22T08:10:00Z
- **Completed:** 2026-04-22T08:25:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added `default?: boolean` to `SessionAgentToolsSettingsSchema` using `z.boolean().optional()` (no `.default()` to keep absence distinguishable)
- Updated `buildIsSessionAgentToolEnabled` predicate to implement 3-level lookup: per-tool entry → `settings.default` → `true` using `?? true` for backward-compatible opt-out
- Renamed all V1-suffixed TypeScript identifiers: `SessionAgentToolsSettingsV1Schema` → `SessionAgentToolsSettingsSchema`, `SessionAgentToolsSettingsV1` → `SessionAgentToolsSettings`, `readSessionAgentToolsSettingsV1` → `readSessionAgentToolsSettings`
- Added 6 new test cases (SCHEMA-01, SCHEMA-02 opt-in, SCHEMA-03 backward-compat, SCHEMA-04 x2 overrides, VALID-01 non-boolean default) — all 21 tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend schema, rename exports, update predicate** - `5ed205fbf` (feat)
2. **Task 2: Update tests and call site to renamed identifiers, add 6 new test cases** - `275a286d1` (feat)
3. **Deviation fix: update stale JSDoc comment in persistence.ts** - `7a3d40353` (fix)

## Files Created/Modified

- `apps/cli/src/settings/sessionAgentToolsSettings.ts` - Schema extended with `default?: boolean`, all V1 identifiers renamed, predicate updated with 3-level lookup using `?? true`
- `apps/cli/src/settings/sessionAgentToolsSettings.test.ts` - All import references updated to renamed identifiers, 6 new test cases added covering SCHEMA-01 through SCHEMA-04 and VALID-01
- `apps/cli/src/mcp/startHappyServer.ts` - Import and call site updated to use `readSessionAgentToolsSettings`
- `apps/cli/src/persistence.ts` - JSDoc comment updated to reference renamed function

## Decisions Made

- Used `z.boolean().optional()` without `.default()` on the `default` field so absence remains distinguishable from explicit `true` at the predicate level (per D-05)
- Predicate fallback is `?? true` not `?? false` — backward-compatible opt-out behavior for users without a `default` field
- JSON key `sessionAgentToolsSettingsV1` in settings.json was NOT renamed (per D-03) — only TypeScript code identifiers were renamed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated stale JSDoc comment in persistence.ts**
- **Found during:** Post-commit verification (final V1 identifier check)
- **Issue:** `persistence.ts` line 116 had a comment referencing `readSessionAgentToolsSettingsV1(settings)` — the old function name. Not a TypeScript identifier but a documentation inaccuracy.
- **Fix:** Updated comment to reference `readSessionAgentToolsSettings(settings)`
- **Files modified:** `apps/cli/src/persistence.ts`
- **Verification:** grep -rn for V1 identifiers returns 0 hits
- **Committed in:** `7a3d40353` (separate fix commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - documentation bug)
**Impact on plan:** Minor comment update, no behavior change, no scope creep.

## Issues Encountered

- Worktree lacked `node_modules` — resolved by creating symlinks to the main repo's `node_modules` directories (`root/node_modules`, `apps/cli/node_modules`, `packages/agents/node_modules`). Tests ran successfully after symlinking.
- Pre-existing test failures in `liveRemoteSshBootstrap.test.ts` (5 failures) due to missing GitHub token for release payload fetch — unrelated to this plan, pre-existing in main repo, deferred.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Schema and predicate implementation complete; ready for documentation phase
- The `default?: boolean` field is live and fully tested — opt-in mode (`default: false`) works correctly
- All V1 identifiers removed from TypeScript code; JSON key is unchanged for backward compatibility

---
*Phase: 04-schema-predicate*
*Completed: 2026-04-22*
