---
phase: 01-schema-reader
reviewed: 2026-04-19T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - apps/cli/src/settings/mcpToolsSettings.ts
  - apps/cli/src/settings/mcpToolsSettings.test.ts
  - apps/cli/src/persistence.ts
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-04-19T00:00:00Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Three files were reviewed: the new `mcpToolsSettings.ts` module and its test, plus the existing `persistence.ts` file that was modified to include the `mcpToolsSettingsV1` field on the `Settings` interface.

The schema and reader implementation in `mcpToolsSettings.ts` are clean and well-designed. The main concerns are:

1. A likely test reliability bug in the spy-based logger tests where `vi.resetModules()` causes the spied module and the module-under-test to hold different logger instances.
2. A misleading type on `Settings.mcpToolsSettingsV1` — the interface claims the field holds a validated `McpToolsSettingsV1` value, but in practice `readSettings()` stores raw JSON here before any validation has run.
3. Minor dead code and stale comment in `persistence.ts`.

---

## Warnings

### WR-01: Logger spy tests are unreliable due to `vi.resetModules()` module isolation

**File:** `apps/cli/src/settings/mcpToolsSettings.test.ts:65-84`

**Issue:** Both spy-based tests (`'returns default and emits logger.warn when v is not 1'` and `'returns default and emits logger.warn when tools is not a record'`) call `vi.resetModules()` in `beforeEach`, then dynamically import the logger module to spy on it, then dynamically import `mcpToolsSettings`. Because `vi.resetModules()` clears the module registry, each `await import(...)` call creates a fresh module instance. The spy is placed on the logger instance from the first `import('@/ui/logger')` call, but `mcpToolsSettings` (imported on the next line) also freshly imports its own copy of `@/ui/logger` — a **different object**. The spy will never fire, and `expect(warnSpy).toHaveBeenCalledOnce()` will spuriously pass only if vitest happens to deduplicate the import within the same `await` tick, which is not guaranteed.

**Fix:** Spy on the logger before calling `vi.resetModules()`, or use `vi.mock('@/ui/logger', ...)` at module scope so the mock is registered before any dynamic import. The cleanest pattern:

```typescript
// At the top of the describe block, before any beforeEach:
vi.mock('@/ui/logger', () => ({
    logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

it('returns default and emits logger.warn when v is not 1', async () => {
    const { logger } = await import('@/ui/logger');
    const warnSpy = vi.spyOn(logger, 'warn');
    const { readMcpToolsSettingsV1, DEFAULT_MCP_TOOLS_SETTINGS } = await import('./mcpToolsSettings');
    const result = readMcpToolsSettingsV1({ mcpToolsSettingsV1: { v: 2 } } as any);
    expect(result).toEqual(DEFAULT_MCP_TOOLS_SETTINGS);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/mcpToolsSettings/);
});
```

---

### WR-02: `Settings.mcpToolsSettingsV1` typed as validated struct, but holds raw JSON at read time

**File:** `apps/cli/src/persistence.ts:118`

**Issue:** The `Settings` interface declares `mcpToolsSettingsV1?: McpToolsSettingsV1`. However, `readSettings()` constructs the `Settings` object by merging raw parsed JSON (`{ ...defaultSettings, ...migrated }`) without running it through `readMcpToolsSettingsV1`. This means the field carries `unknown` JSON at runtime while TypeScript believes it is a fully validated `McpToolsSettingsV1` object. Any call site that reads `settings.mcpToolsSettingsV1` directly (without going through `readMcpToolsSettingsV1`) will receive unvalidated data under a false type guarantee.

**Fix:** Change the field type to `unknown` to accurately reflect that `persistence.ts` stores it opaquely and delegates validation to the dedicated reader:

```typescript
/**
 * Per-tool MCP enable/disable configuration (CLI-local; schema-validated).
 * Parsed/normalized by `settings/mcpToolsSettings.ts`.
 * Stored as raw JSON — always access via `readMcpToolsSettingsV1(settings)`.
 */
mcpToolsSettingsV1?: unknown;
```

Remove the `import type { McpToolsSettingsV1 }` at line 20 if no other field uses it.

---

### WR-03: Dead code — `|| { ...defaultSettings }` after `readSettings()` which never returns falsy

**File:** `apps/cli/src/persistence.ts:448`

**Issue:** `readSettings()` is typed `Promise<Settings>` and always resolves to a `Settings` object (it returns `{ ...defaultSettings }` in all error paths and never throws). The expression `await readSettings() || { ...defaultSettings }` is dead code — the right-hand side is never evaluated. This is misleading to future readers who may think `readSettings` can return null.

**Fix:**

```typescript
// Before:
const current = await readSettings() || { ...defaultSettings };

// After:
const current = await readSettings();
```

---

## Info

### IN-01: Stale comment references a non-existent future migration slot

**File:** `apps/cli/src/persistence.ts:236-238`

**Issue:** The comment `// Future migrations go here: // if (fromVersion < 6) { ... }` appears after the v5→v6 migration block has already been implemented on lines 209-234. The placeholder is now inaccurate — it should reference `fromVersion < 7` (or simply be updated to remove the example).

**Fix:** Update the comment:

```typescript
// Future migrations go here:
// if (fromVersion < 7) { ... migrated.schemaVersion = 7; }
```

---

### IN-02: Unnecessary test setup overhead — filesystem and env setup for a pure function

**File:** `apps/cli/src/settings/mcpToolsSettings.test.ts:6-23`

**Issue:** Every test in this suite creates a temp directory and sets environment variables (`HAPPIER_HOME_DIR`, `HAPPIER_SERVER_URL`, `HAPPIER_WEBAPP_URL`) via `beforeEach`/`afterEach`. The function under test — `readMcpToolsSettingsV1` — is a pure function that only reads from a passed-in `Settings` object. It never touches the filesystem or reads environment variables. This setup is inherited boilerplate that adds latency and complexity without testing anything real.

**Fix:** Remove the `homeDir`, `createTempDir`, `removeTempDir`, `applyEnvValues`, `restoreEnvValues`, `snapshotEnvValues` infrastructure from this test file. The `vi.resetModules()` calls in `beforeEach`/`afterEach` are still valid for isolating module state between spy tests.

---

### IN-03: Empty catch blocks in `updateSettings` silently swallow stat errors

**File:** `apps/cli/src/persistence.ts:435`

**Issue:** The inner `try { const stats = await stat(lockFile); ... } catch { }` block swallows all errors from the stale-lock stat check with no logging. While clearly intentional (best-effort cleanup), it is inconsistent with the rest of the file which logs warnings for unexpected errors. A corrupt filesystem or permission error would be silently ignored.

**Fix:** This is a best-effort path, so silent swallowing is acceptable. If future debugging is needed, a single `logger.debug` call would suffice. No change required unless the team prefers consistency.

---

_Reviewed: 2026-04-19T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
