---
phase: 05-tests-docs
reviewed: 2026-04-22T00:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - apps/cli/src/settings/sessionAgentToolsSettings.test.ts
  - docs/mcp-tool-filtering.md
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 05: Code Review Report

**Reviewed:** 2026-04-22
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

Two files reviewed: the Vitest test suite for `sessionAgentToolsSettings` and the accompanying user/contributor documentation. No security or crash-level bugs found. The source module under test (`sessionAgentToolsSettings.ts`) is itself clean and matches the test expectations correctly.

Two warnings are raised: the documentation contains a factual inaccuracy about a required field (contradicted by both the schema and an existing test), and the test file contains a duplicate describe block that re-exercises four already-covered paths. Three info-level items cover dead scaffolding, a missing edge-case test, and the doc/schema mismatch root cause.

---

## Warnings

### WR-01: Documentation states `v` field is required, but schema makes it optional with a default

**File:** `docs/mcp-tool-filtering.md:43`

**Issue:** The field reference table documents `v` as `Required: Yes`. The actual Zod schema uses `z.literal(1).default(1 as const)`, which inserts the default `1` when `v` is absent — making it effectively optional. The test at `sessionAgentToolsSettings.test.ts:51-58` explicitly verifies this "v defaults to 1" behaviour. A user reading the documentation who omits `v` will expect a validation error but instead get silent coercion. This creates a documentation contract that is inconsistent with runtime behavior.

**Fix:** Change the table row for `v` in the field reference:

```markdown
| `v` | `1` (literal) | No (defaults to `1`) | Schema version. Omitting is allowed; the CLI will insert `1` automatically. |
```

---

### WR-02: Duplicate describe block re-tests four already-covered paths

**File:** `apps/cli/src/settings/sessionAgentToolsSettings.test.ts:196-232`

**Issue:** The `describe('3-level lookup (TEST-01..04)')` block contains four tests (TEST-01 through TEST-04) that are exact logical duplicates of tests already present in the enclosing `describe('buildIsSessionAgentToolEnabled')` block:

| Duplicate test | Original test |
|---|---|
| TEST-01 (line 197) — absent default → true | line 154 — "returns true for absent tool when default is omitted" |
| TEST-02 (line 206) — default false → false | line 145 — "returns false for absent tool when default is false" |
| TEST-03 (line 215) — per-tool true overrides default false | line 163 — "per-tool enabled:true overrides default:false (SCHEMA-04)" |
| TEST-04 (line 224) — per-tool false overrides default true | line 172 — "per-tool enabled:false overrides default:true (SCHEMA-04)" |

Duplicate tests do not improve coverage and create maintenance overhead: any schema change must be updated in two places, and a failure in one block without a failure in the other would be misleading.

**Fix:** Remove lines 196-232 (`describe('3-level lookup (TEST-01..04)')`). The inner `describe('buildIsSessionAgentToolEnabled')` block already covers all four scenarios with the same inputs and assertions. If the TEST-0x labels are meaningful for traceability, add them as inline comments to the original tests:

```typescript
it('returns true for absent tool when default is omitted — backward compat (SCHEMA-03 / TEST-01)', async () => {
```

---

## Info

### IN-01: Env and filesystem scaffolding is dead code for the current test subject

**File:** `apps/cli/src/settings/sessionAgentToolsSettings.test.ts:10-27`

**Issue:** `snapshotEnvValues`, `applyEnvValues`, `restoreEnvValues`, `createTempDir`, and `removeTempDir` are imported and used in `beforeEach`/`afterEach`. The function under test (`readSessionAgentToolsSettings`) takes an already-loaded `Settings` object and never reads from disk or the environment. The env var setup (`HAPPIER_HOME_DIR`, `HAPPIER_SERVER_URL`, `HAPPIER_WEBAPP_URL`) and the temp directory lifecycle have no effect on the tested behaviour. The `vi.resetModules()` call is the only scaffolding that actually matters (it ensures each dynamic `import()` gets a fresh module instance).

**Fix:** Remove the unused imports and scaffolding, keeping only what is necessary:

```typescript
beforeEach(async () => {
    vi.resetModules();
});

afterEach(() => {
    vi.resetModules();
});
```

If the test file is expected to grow to cover file-based settings loading (e.g., `readSettings()`), the scaffolding can be reintroduced at that point.

---

### IN-02: Missing test for `findUnknownSessionAgentToolNames` when settings has a `default` field

**File:** `apps/cli/src/settings/sessionAgentToolsSettings.test.ts:234-255`

**Issue:** The `findUnknownSessionAgentToolNames` test suite covers: all-known, some-unknown, and empty-tools cases. There is no test verifying that the function ignores the `default` field when determining unknown names — i.e., `{ v: 1, tools: { change_title: { enabled: false } }, default: false }` should still return `[]` when `change_title` is known. While the current source implementation uses `Object.keys(settings.tools)` which correctly excludes `default`, the absence of this test means a future schema change that merges `default` into `tools` could introduce a regression undetected.

**Fix (suggestion):** Add one test:

```typescript
it('does not treat the default field as a tool name', async () => {
    const { findUnknownSessionAgentToolNames } = await import('./sessionAgentToolsSettings');
    const settings = { v: 1 as const, tools: { change_title: { enabled: false } }, default: false };
    expect(findUnknownSessionAgentToolNames(settings, ['change_title'])).toEqual([]);
});
```

---

### IN-03: Doc Example D ("Disable all tools") may silently become stale as tool catalog grows

**File:** `docs/mcp-tool-filtering.md:104-150`

**Issue:** Example D enumerates every known tool name inline (36 entries). The `findUnknownSessionAgentToolNames` function exists precisely to catch stale tool names, but no automated check ties the documentation example to the actual tool catalog. A tool added or renamed in the catalog will not fail any test or lint, and the doc example will silently drift. This is a maintainability concern, not a runtime bug.

**Fix (suggestion):** Add a note below Example D:

```markdown
> **Note:** This list is provided for reference only. If a tool name is renamed or removed, the daemon emits a `logger.warn` at startup for unrecognised names but continues normally. Use `happier tools list` (if available) to get the current catalog.
```

Alternatively, generate Example D from a shared constant in the source rather than maintaining it by hand.

---

_Reviewed: 2026-04-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
