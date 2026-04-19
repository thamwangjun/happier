---
phase: 01-schema-reader
fixed_at: 2026-04-19T00:00:00Z
review_path: .planning/phases/01-schema-reader/01-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 01: Code Review Fix Report

**Fixed at:** 2026-04-19T00:00:00Z
**Source review:** .planning/phases/01-schema-reader/01-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3 (WR-01, WR-02, WR-03)
- Fixed: 3
- Skipped: 0

## Fixed Issues

### WR-01: Logger spy tests are unreliable due to `vi.resetModules()` module isolation

**Files modified:** `apps/cli/src/settings/mcpToolsSettings.test.ts`
**Commit:** ef5aa8cc9
**Applied fix:** Added `vi.mock('@/ui/logger', ...)` at module scope (top level, outside describe block) so vitest hoists the mock before any dynamic imports. Replaced `vi.spyOn(loggerModule.logger, 'warn').mockImplementation(...)` + `warnSpy.mockRestore()` pattern in spy tests with `vi.mocked(logger.warn)` + `warnSpy.mockClear()`. This ensures all dynamic imports of both `@/ui/logger` and `./mcpToolsSettings` resolve to the same mocked module instance regardless of `vi.resetModules()` calls in beforeEach.

### WR-02: `Settings.mcpToolsSettingsV1` typed as validated struct, but holds raw JSON at read time

**Files modified:** `apps/cli/src/persistence.ts`
**Commit:** f1a2c40dd
**Applied fix:** Removed `import type { McpToolsSettingsV1 } from '@/settings/mcpToolsSettings'` (line 20). Changed `mcpToolsSettingsV1?: McpToolsSettingsV1` to `mcpToolsSettingsV1?: unknown` on the Settings interface. Updated the JSDoc comment to document that callers must always access this field via `readMcpToolsSettingsV1(settings)`.

### WR-03: Dead code — `|| { ...defaultSettings }` after `readSettings()` which never returns falsy

**Files modified:** `apps/cli/src/persistence.ts`
**Commit:** f1a2c40dd
**Applied fix:** Removed the unreachable `|| { ...defaultSettings }` fallback from `updateSettings`. Changed `const current = await readSettings() || { ...defaultSettings }` to `const current = await readSettings()`, accurately reflecting that `readSettings()` always resolves to a `Settings` object.

---

_Fixed: 2026-04-19T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
