# Phase 1: Schema & Reader - Research

**Researched:** 2026-04-18
**Domain:** TypeScript/Zod settings schema and reader for CLI local config
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Schema and reader live together in a new `apps/cli/src/settings/mcpToolsSettings.ts`. CLI-local only — protocol package is not touched.
- **D-02:** Schema shape: `{ v: z.literal(1), tools: z.record(z.string(), z.object({ enabled: z.boolean() })) }`. Tools absent from the map default to enabled (opt-out model, SCHEMA-02).
- **D-03:** Add `mcpToolsSettingsV1?: McpToolsSettingsV1` to the `Settings` interface in `persistence.ts` using `import type` from the new module. Typed access at call site — deliberate departure from `memory?: unknown` pattern.
- **D-04:** No schema version bump needed. The field is optional and `migrateSettings` round-trips unknown keys unchanged.
- **D-05:** `readMcpToolsSettingsV1` always returns `McpToolsSettingsV1` — never `null`. Absent file, absent key, or parse failure all return `{ v: 1, tools: {} }`. Only parse failure emits `logger.warn`.
- **D-06:** Reader accepts the raw settings object (from `readSettings()` or injected in tests) — not a file path. Pure and testable without filesystem mocking.

### Claude's Discretion

- Exact Zod schema ergonomics (`.strict()`, `.passthrough()`, preprocess vs plain object) — use safest validator with least surprising behavior.
- Whether to export a `McpToolsSettingsV1` type alias or rely on `z.infer<>` at use sites.

### Deferred Ideas (OUT OF SCOPE)

None declared in context.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SCHEMA-01 | User can configure per-tool MCP enable/disable via `mcpToolsSettingsV1` key in `~/.happier/settings.json` with shape `{ v: 1, tools: { "<tool_name>": { enabled: boolean } } }` | Zod schema defined in `mcpToolsSettings.ts`; field added to `Settings` interface in `persistence.ts` |
| SCHEMA-02 | Tools not listed in config default to `enabled: true` (opt-out model, not opt-in) | Reader returns `{ v: 1, tools: {} }` on all fallback paths; callers check `tools[name]?.enabled !== false` |
</phase_requirements>

---

## Summary

Phase 1 is a focused, self-contained addition to the CLI's existing settings subsystem. The deliverables are: (1) a new module `apps/cli/src/settings/mcpToolsSettings.ts` containing a Zod schema and a pure reader function, and (2) a field addition to the `Settings` interface in `persistence.ts`. No new dependencies, no filesystem wiring changes, no startup hooks.

The existing codebase provides a near-identical template in `apps/cli/src/mcp/servers/readMcpServersSettingsFromAccountSettings.ts`: a reader that accepts an opaque settings object, extracts a namespaced key, validates with Zod, and returns a typed empty struct on any failure. The `McpServersSettingsV1Schema` in `packages/protocol/src/mcpServers/settingsV1.ts` demonstrates the preferred `.preprocess()` pattern for forward-compatible Zod schemas. The `memorySettings.test.ts` file shows the exact test infrastructure pattern: `createTempDir`, `applyEnvValues`/`restoreEnvValues`, `vi.resetModules()`, and dynamic import of the module under test.

**Primary recommendation:** Model `mcpToolsSettings.ts` directly on `readMcpServersSettingsFromAccountSettings.ts` (same reader contract), use `z.preprocess` wrapping a `z.object({...})` (same resilience pattern as `McpServersSettingsV1Schema`), and export the inferred type as a named alias. Tests follow the `memorySettings.test.ts` pattern using the existing testkit.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Schema definition (`McpToolsSettingsV1Schema`) | CLI / local config | — | CLI-local config; no server or mobile consumer in v1.0 (D-01) |
| Settings field declaration (`mcpToolsSettingsV1?`) | CLI / local config | — | Added to `Settings` interface in `persistence.ts`; no cross-boundary type sharing |
| Reader function (`readMcpToolsSettingsV1`) | CLI / local config | — | Pure function over an in-memory settings object; no filesystem I/O of its own |
| Fallback / default value (`{ v: 1, tools: {} }`) | CLI / local config | — | Opt-out semantics live entirely in the reader's return contract (D-05) |

---

## Standard Stack

### Core (all verified in codebase)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Zod | 4.3.6 | Schema validation and type inference | Pinned project-wide; used in `persistence.ts`, all protocol schemas, and settings modules [VERIFIED: `apps/cli/package.json`] |
| TypeScript | 5.9.3 | Static typing | Strict mode enforced everywhere [VERIFIED: `CLAUDE.md`] |

No new dependencies are needed. The entire phase uses what is already installed.

### Import Style

Two coexisting styles are in use across the CLI source:

- `import * as z from 'zod'` — used in `persistence.ts` and `sessionAttachPayload.ts`
- `import { z } from 'zod'` — used in most agent and protocol files

Either is acceptable in Zod 4. The Zod 4 package exports are compatible with both. For consistency with the adjacent `persistence.ts` (which this module integrates with), prefer `import * as z from 'zod'` in `mcpToolsSettings.ts`. [VERIFIED: codebase grep]

---

## Architecture Patterns

### System Architecture Diagram

```
readSettings() ──► raw Settings object
                         │
                         ▼
             readMcpToolsSettingsV1(settings)
                         │
             ┌───────────┴───────────┐
             │                       │
    settings.mcpToolsSettingsV1   key absent
    present?                          │
             │                        ▼
             ▼               return DEFAULT_MCP_TOOLS_SETTINGS
    McpToolsSettingsV1Schema
       .safeParse(raw)
             │
     ┌───────┴────────┐
     │                │
  success           failure
     │                │
     ▼                ▼
 parsed.data    logger.warn + return DEFAULT
```

### Recommended Project Structure

The module follows the existing `settings/` flat pattern. No subfolder needed (single file):

```
apps/cli/src/
└── settings/
    ├── memorySettings.ts          (existing — template to follow)
    ├── memorySettings.test.ts     (existing — test pattern to follow)
    ├── mcpToolsSettings.ts        (NEW — schema + reader)
    └── mcpToolsSettings.test.ts   (NEW — unit tests)
```

`persistence.ts` is modified in-place (no new file).

### Pattern 1: Preprocess-wrapped Zod schema (forward-compatible)

The `McpServersSettingsV1Schema` uses `z.preprocess` to coerce a non-object input to `{}` before parsing. This prevents a raw `null`, `undefined`, or array from throwing a type error at the `z.object` boundary.

```typescript
// Source: packages/protocol/src/mcpServers/settingsV1.ts (adapted)
export const McpToolsSettingsV1Schema = z.preprocess(
    (raw) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
        return raw;
    },
    z.object({
        v: z.literal(1).default(1 as const),
        tools: z.record(z.string(), z.object({ enabled: z.boolean() })).default({}),
    }),
);

export type McpToolsSettingsV1 = z.infer<typeof McpToolsSettingsV1Schema>;

export const DEFAULT_MCP_TOOLS_SETTINGS: McpToolsSettingsV1 = { v: 1, tools: {} };
```

**Why `.preprocess` over plain `.object`:** `readSettings()` stores the field as `unknown`. Any non-object raw value (e.g. a string from a corrupt file) passed directly to `z.object` would produce a Zod error instead of cleanly falling to the default. `preprocess` absorbs that case without extra conditional logic in the reader.

**Why `.default({})` on `tools`:** Allows a settings blob `{ "v": 1 }` (no `tools` key) to parse successfully and return an empty tools map — consistent with SCHEMA-02.

**Why NOT `.strict()`:** Forward-compatible: if a future version adds fields to this section, strict mode would cause parse failures on existing CLI versions reading newer files. `.passthrough()` (the implicit default for `z.object`) is correct here.

**Why NOT `.passthrough()` explicitly:** The schema only needs to survive unknown *top-level* keys in the `mcpToolsSettingsV1` blob; extra keys inside a tool entry (`{ enabled: false, description: "..." }`) should also be tolerated. The default object behavior (strip unknown keys) is acceptable and matches how `McpServersSettingsV1Schema` handles its sub-objects.

### Pattern 2: Reader returning typed struct on failure

```typescript
// Source: apps/cli/src/mcp/servers/readMcpServersSettingsFromAccountSettings.ts (adapted)
import { logger } from '@/ui/logger';
import { McpToolsSettingsV1Schema, DEFAULT_MCP_TOOLS_SETTINGS, type McpToolsSettingsV1 } from './mcpToolsSettings';
import type { Settings } from '@/persistence';

export function readMcpToolsSettingsV1(settings: Settings): McpToolsSettingsV1 {
    const raw = settings.mcpToolsSettingsV1;
    if (raw === undefined || raw === null) {
        return DEFAULT_MCP_TOOLS_SETTINGS;
    }
    const parsed = McpToolsSettingsV1Schema.safeParse(raw);
    if (!parsed.success) {
        logger.warn(`[mcpToolsSettings] Failed to parse mcpToolsSettingsV1: ${parsed.error.message}`);
        return DEFAULT_MCP_TOOLS_SETTINGS;
    }
    return parsed.data;
}
```

**Key notes:**
- `settings` is `Settings` (from `persistence.ts`), which contains `mcpToolsSettingsV1?: McpToolsSettingsV1` after D-03 is applied.
- The absent-key fast path (`raw === undefined || raw === null`) avoids unnecessary Zod processing and matches D-05: no warn on absent key.
- `logger.warn` only fires on schema parse failure (D-05).
- Return type is `McpToolsSettingsV1` (never `null`).

### Pattern 3: Settings interface extension (persistence.ts)

```typescript
// Source: apps/cli/src/persistence.ts — Settings interface
import type { McpToolsSettingsV1 } from '@/settings/mcpToolsSettings';

export interface Settings {
  // ... existing fields ...
  /**
   * Per-tool MCP enable/disable configuration (CLI-local, schema-validated).
   * Parsed/normalized by `settings/mcpToolsSettings.ts`.
   */
  mcpToolsSettingsV1?: McpToolsSettingsV1;
}
```

**Why `import type`:** The type is only needed for the interface declaration. Using `import type` avoids a runtime dependency cycle (persistence.ts is imported by mcpToolsSettings.ts's future callers). [VERIFIED: D-03 decision; consistent with existing `import type` usage in codebase]

**Why NOT `memory?: unknown`:** D-03 explicitly chose typed access. The `memory` field predates this decision and uses opaque `unknown` for a different reason (the actual type lives in `packages/protocol`, not in the CLI). Since `McpToolsSettingsV1` lives in `apps/cli/src/settings/`, the circular import concern doesn't apply.

### Anti-Patterns to Avoid

- **Throwing on parse failure:** The reader must never throw. `safeParse` (not `parse`) is mandatory.
- **Returning `null`:** D-05 is explicit: the return type is `McpToolsSettingsV1`, not `McpToolsSettingsV1 | null`. Callers in Phase 2 must not need null-checks.
- **Accepting a file path:** D-06 is explicit. No `readFile` inside the reader. The reader is pure over an in-memory `Settings` object.
- **Adding to `packages/protocol`:** D-01 is explicit. This is CLI-local config; the protocol package is not touched.
- **Bumping `SUPPORTED_SCHEMA_VERSION`:** D-04 is explicit. The field is optional; migration is not needed.
- **Hardcoding `~/.happier/settings.json`:** Tests and the production path both use `configuration.settingsFile`. The reader doesn't touch the file at all — `readSettings()` is the file I/O boundary.

---

## Solved Problems

| Problem | Build Nothing — Use Instead | Why |
|---------|-----------------------------|-----|
| Schema validation | Zod 4.3.6 (already installed) | Type inference, `safeParse`, `preprocess` — all exactly what's needed |
| Testkit for env isolation | `@/testkit/env/envSnapshot` | `snapshotEnvValues`/`applyEnvValues`/`restoreEnvValues` — used by all adjacent settings tests |
| Testkit for temp home dir | `@/testkit/fs/tempDir` | `createTempDir`/`removeTempDir` — used by `memorySettings.test.ts` |
| Logging parse failures | `@/ui/logger` | `logger.warn(...)` — project standard; never `console.error` |

---

## Common Pitfalls

### Pitfall 1: Import cycle via `persistence.ts`

**What goes wrong:** `mcpToolsSettings.ts` imports from `persistence.ts` (to call `readSettings()`), and `persistence.ts` imports from `mcpToolsSettings.ts` (for the type). This would be a circular dependency.

**Root cause:** If the reader calls `readSettings()` internally rather than accepting a `Settings` object as a parameter.

**Prevention:** D-06 prevents this entirely — the reader accepts the already-loaded `Settings` object. Use `import type` in `persistence.ts` so the import is type-only and erased at runtime.

**Warning signs:** TypeScript error "Circular dependency" or "Cannot find module" at startup; or Jest/Vitest module resolution warnings.

### Pitfall 2: `z.literal(1)` without `.default(1 as const)`

**What goes wrong:** A settings blob `{ "tools": { "change_title": { "enabled": false } } }` (no `v` field) fails to parse because `z.literal(1)` rejects `undefined`.

**Root cause:** Zod `z.literal` does not add a default value.

**Prevention:** Chain `.default(1 as const)` on `z.literal(1)`. The `preprocess` step also defends against null/non-object, but the literal field itself needs a default for the missing-key case.

**Warning signs:** `safeParse` returning `{ success: false }` for a settings blob that has a valid `tools` map but no `v` field.

### Pitfall 3: `logger.warn` on absent key (violates D-05)

**What goes wrong:** Reader calls `McpToolsSettingsV1Schema.safeParse(undefined)` when `mcpToolsSettingsV1` is absent, the preprocess step coerces it to `{}`, parsing succeeds trivially — no harm. But if the reader warns regardless, existing users who have no `mcpToolsSettingsV1` key will see a spurious warn on every startup.

**Root cause:** Placing the `logger.warn` before the `safeParse` check rather than inside the `!parsed.success` branch.

**Prevention:** Only call `logger.warn` when `parsed.success === false`. The absent-key fast path returns the default silently.

### Pitfall 4: Zod version mismatch between imports

**What goes wrong:** Some files use `import { z } from 'zod'` and some use `import * as z from 'zod'`. In Zod 4 both work. However, mixing namespace-import and named-import of `z` in the same file causes confusing shadowing.

**Root cause:** Copy-pasting from different source files.

**Prevention:** Pick one style per file. For `mcpToolsSettings.ts`, match `persistence.ts` and use `import * as z from 'zod'`.

---

## Code Examples

### Full module: `apps/cli/src/settings/mcpToolsSettings.ts`

```typescript
/**
 * MCP tool enable/disable configuration (CLI-local settings)
 *
 * Defines the McpToolsSettingsV1 schema and reader function.
 * The schema is validated from the `mcpToolsSettingsV1` field in ~/.happier/settings.json.
 * The reader accepts an already-loaded Settings object (not a file path) so it stays pure
 * and testable without filesystem access.
 */

import * as z from 'zod';
import { logger } from '@/ui/logger';
import type { Settings } from '@/persistence';

export const McpToolsSettingsV1Schema = z.preprocess(
    (raw) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
        return raw;
    },
    z.object({
        v: z.literal(1).default(1 as const),
        tools: z.record(z.string(), z.object({ enabled: z.boolean() })).default({}),
    }),
);

export type McpToolsSettingsV1 = z.infer<typeof McpToolsSettingsV1Schema>;

export const DEFAULT_MCP_TOOLS_SETTINGS: McpToolsSettingsV1 = { v: 1, tools: {} };

/**
 * Reads and validates the mcpToolsSettingsV1 field from a Settings object.
 *
 * Always returns a valid McpToolsSettingsV1 — never throws, never returns null.
 * - Absent key → returns DEFAULT_MCP_TOOLS_SETTINGS (silent).
 * - Parse failure → emits logger.warn and returns DEFAULT_MCP_TOOLS_SETTINGS.
 * - Valid payload → returns parsed value.
 */
export function readMcpToolsSettingsV1(settings: Settings): McpToolsSettingsV1 {
    const raw = settings.mcpToolsSettingsV1;
    if (raw === undefined || raw === null) {
        return DEFAULT_MCP_TOOLS_SETTINGS;
    }
    const parsed = McpToolsSettingsV1Schema.safeParse(raw);
    if (!parsed.success) {
        logger.warn(`[mcpToolsSettings] mcpToolsSettingsV1 failed schema validation — using defaults. Error: ${parsed.error.message}`);
        return DEFAULT_MCP_TOOLS_SETTINGS;
    }
    return parsed.data;
}
```

### Settings interface patch: `apps/cli/src/persistence.ts`

Add at the end of the `Settings` interface block, after the `memory?: unknown` field:

```typescript
import type { McpToolsSettingsV1 } from '@/settings/mcpToolsSettings';

// Inside the Settings interface:
/**
 * Per-tool MCP enable/disable configuration (CLI-local; schema-validated).
 * Parsed/normalized by `settings/mcpToolsSettings.ts`.
 */
mcpToolsSettingsV1?: McpToolsSettingsV1;
```

### Test scaffolding: `apps/cli/src/settings/mcpToolsSettings.test.ts`

```typescript
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyEnvValues, restoreEnvValues, snapshotEnvValues } from '@/testkit/env/envSnapshot';
import { createTempDir, removeTempDir } from '@/testkit/fs/tempDir';

describe('readMcpToolsSettingsV1', () => {
    const envBackup = snapshotEnvValues(['HAPPIER_HOME_DIR', 'HAPPIER_SERVER_URL', 'HAPPIER_WEBAPP_URL']);
    let homeDir: string | undefined;

    beforeEach(async () => {
        homeDir = await createTempDir('happier-mcp-tools-settings-');
        applyEnvValues({
            HAPPIER_HOME_DIR: homeDir,
            HAPPIER_SERVER_URL: 'https://api.example.test',
            HAPPIER_WEBAPP_URL: 'https://app.example.test',
        });
    });

    afterEach(async () => {
        restoreEnvValues(envBackup);
        if (homeDir) await removeTempDir(homeDir);
    });

    it('returns default when mcpToolsSettingsV1 is absent', () => {
        const { readMcpToolsSettingsV1, DEFAULT_MCP_TOOLS_SETTINGS } = require('./mcpToolsSettings');
        const result = readMcpToolsSettingsV1({});
        expect(result).toEqual(DEFAULT_MCP_TOOLS_SETTINGS);
    });

    // ... see Validation Architecture section for full test list
});
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|-----------------|--------|
| `memory?: unknown` (opaque field, no type safety at call site) | `mcpToolsSettingsV1?: McpToolsSettingsV1` (typed, validated) | Callers get type-safe access without a cast; D-03 is the deliberate departure |
| `z.parse()` (throws on failure) | `z.safeParse()` (returns `{ success, data, error }`) | Reader never throws; standard pattern in this codebase since `DaemonLocallyPersistedStateSchema` |
| Zod 3 `.optional().default()` chaining | Zod 4 `.preprocess()` wrapper | Forward-compatible; handles `null`/non-object gracefully before the object schema sees it |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `import type { McpToolsSettingsV1 } from '@/settings/mcpToolsSettings'` in `persistence.ts` does not create a circular dependency because the import is type-only and erased at runtime | Architecture Patterns, Pattern 3 | If the TypeScript compiler resolves the type-only import as a runtime circular dep in some bundler context, the field type would need to be re-declared inline or extracted to a shared types file |
| A2 | `z.literal(1).default(1 as const)` is valid in Zod 4.3.6 | Code Examples | If `as const` is not needed or causes a type error in this Zod version, use `z.literal(1 as 1).default(1)` instead |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.

Both assumptions carry LOW risk: A1 is the same pattern used by `memorySettings.ts` (which imports from `@happier-dev/protocol` while `persistence.ts` has `memory?: unknown`), and A2 is consistent with Zod 4 semantics for literal defaults.

---

## Open Questions

1. **`1 as const` vs `1 as 1` for the literal default**
   - What we know: Zod 4.3.6 is pinned; `z.literal(1)` is the correct validator.
   - What is unclear: Whether `.default(1 as const)` or `.default(1 as 1)` produces the tightest inferred type without a compiler error in this specific Zod version.
   - Recommendation: Try `z.literal(1).default(1 as const)` first; if TypeScript complains about the literal type, fall back to `.default(1)` (the type will infer as `number` rather than `1`, which is acceptable for this internal schema).

---

## Environment Availability

Step 2.6: SKIPPED — Phase 1 is a pure TypeScript code and settings change with no external dependencies beyond the already-installed Node.js/TypeScript/Zod toolchain.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file | `apps/cli/vitest.config.ts` |
| Quick run command | `yarn workspace @happier-dev/cli vitest run src/settings/mcpToolsSettings.test.ts` |
| Full suite command | `yarn workspace @happier-dev/cli vitest run` |

Tests use `pool: 'forks'` and `isolate: true` (configured in `vitest.config.ts`). The `vitestSetup.ts` global setup assigns each forked process its own `HAPPIER_HOME_DIR` under `tmpdir()`, so tests that use `createTempDir` and `applyEnvValues` work correctly.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCHEMA-01 | Valid blob `{ v: 1, tools: { "change_title": { "enabled": false } } }` parses without error and returns the expected struct | unit | `yarn workspace @happier-dev/cli vitest run src/settings/mcpToolsSettings.test.ts` | No — Wave 0 |
| SCHEMA-01 | Blob with unrecognized extra keys at top level parses successfully (forward-compat) | unit | same | No — Wave 0 |
| SCHEMA-01 | Blob with missing `v` field (only `tools`) parses successfully due to `.default(1)` | unit | same | No — Wave 0 |
| SCHEMA-01 | `mcpToolsSettingsV1` absent from settings object → returns `DEFAULT_MCP_TOOLS_SETTINGS`, no warn | unit | same | No — Wave 0 |
| SCHEMA-01 | `mcpToolsSettingsV1` present but schema-invalid (e.g. `{ v: 2 }`, `{ v: 1, tools: "bad" }`) → returns default, emits `logger.warn` | unit | same | No — Wave 0 |
| SCHEMA-01 | `Settings` interface in `persistence.ts` accepts `mcpToolsSettingsV1` field with correct type (TypeScript compile-time) | unit (tsc) | `tsc --noEmit` in `apps/cli` | No — verified by type check |
| SCHEMA-02 | Tool name absent from `tools` map → `tools["anything"]` is `undefined`, not `{ enabled: false }` | unit | same | No — Wave 0 |
| SCHEMA-02 | `tools` map empty (`{}`) → all tool names treated as enabled | unit | same | No — Wave 0 |

### Sampling Rate

- **Per task commit:** `yarn workspace @happier-dev/cli vitest run src/settings/mcpToolsSettings.test.ts`
- **Per wave merge:** `yarn workspace @happier-dev/cli vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `apps/cli/src/settings/mcpToolsSettings.ts` — the module itself (schema + reader)
- [ ] `apps/cli/src/settings/mcpToolsSettings.test.ts` — unit test file

*(Existing test infrastructure — Vitest, `createTempDir`, `envSnapshot`, `vitestSetup.ts` — is fully present. No framework installation needed.)*

---

## Sources

### Primary (HIGH confidence)

- `apps/cli/src/persistence.ts` — `Settings` interface, `readSettings()`, `defaultSettings`, `migrateSettings`, Zod import style [VERIFIED: read in full]
- `apps/cli/src/configuration.ts` — `configuration.settingsFile` resolves to `join(happyHomeDir, 'settings.json')`; `HAPPIER_HOME_DIR` env var controls `happyHomeDir` [VERIFIED: read in full]
- `apps/cli/src/settings/memorySettings.ts` — template reader module pattern (calls `readSettings()`, returns typed value) [VERIFIED: read in full]
- `apps/cli/src/settings/memorySettings.test.ts` — canonical test pattern for settings modules (tempDir, envSnapshot, vi.resetModules, dynamic import) [VERIFIED: read in full]
- `packages/protocol/src/mcpServers/settingsV1.ts` — `McpServersSettingsV1Schema` using `z.preprocess` [VERIFIED: read in full]
- `apps/cli/src/mcp/servers/readMcpServersSettingsFromAccountSettings.ts` — reader returning typed empty struct on failure [VERIFIED: read in full]
- `apps/cli/vitest.config.ts` — test framework configuration (forks pool, 30s timeout, include/exclude globs) [VERIFIED: read in full]
- `apps/cli/src/vitestSetup.ts` — global test setup (per-process HAPPIER_HOME_DIR) [VERIFIED: read in full]
- `apps/cli/package.json` — Zod version `4.3.6` [VERIFIED: grep]
- `.planning/config.json` — `workflow.nyquist_validation: true` [VERIFIED: read]

### Secondary (MEDIUM confidence)

None required — all findings derive from first-party codebase reads.

### Flagged for Validation (LOW confidence)

None.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified from `package.json` and in-codebase imports
- Architecture: HIGH — derived from reading the four canonical reference files the CONTEXT.md specified
- Pitfalls: HIGH — derived from direct code reading and D-03/D-05/D-06 decision analysis
- Test patterns: HIGH — derived from reading `memorySettings.test.ts` and `vitest.config.ts` in full

**Research date:** 2026-04-18
**Valid until:** This research is stable — no external dependencies, no ecosystem churn risk. Valid until the referenced source files change.
