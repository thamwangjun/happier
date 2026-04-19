# Phase 1: Schema & Reader - Pattern Map

**Mapped:** 2026-04-18
**Files analyzed:** 3 (2 new, 1 modified)
**Analogs found:** 3 / 3

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/cli/src/settings/mcpToolsSettings.ts` | utility / schema+reader | request-response (pure, in-memory) | `apps/cli/src/mcp/servers/readMcpServersSettingsFromAccountSettings.ts` + `packages/protocol/src/mcpServers/settingsV1.ts` | exact (same contract, same schema pattern) |
| `apps/cli/src/settings/mcpToolsSettings.test.ts` | test | — | `apps/cli/src/settings/memorySettings.test.ts` | exact |
| `apps/cli/src/persistence.ts` | config / interface | — | self (existing `Settings` interface, lines 43–113) | self-modification |

---

## Pattern Assignments

### `apps/cli/src/settings/mcpToolsSettings.ts` (utility, pure in-memory transform)

**Primary analog (reader contract):** `apps/cli/src/mcp/servers/readMcpServersSettingsFromAccountSettings.ts`
**Secondary analog (schema shape):** `packages/protocol/src/mcpServers/settingsV1.ts` lines 121–163

---

**File header comment pattern**
Source: `apps/cli/src/mcp/servers/readMcpServersSettingsFromAccountSettings.ts` lines 1–6

```typescript
/**
 * MCP settings access (account settings)
 *
 * Reads the server-synced MCP servers settings blob from the account settings object.
 * Invalid payloads are treated as empty settings (fail-closed on config).
 */
```

Adapt to:

```typescript
/**
 * MCP tool enable/disable configuration (CLI-local settings)
 *
 * Defines the McpToolsSettingsV1 schema and reader function.
 * The schema is validated from the `mcpToolsSettingsV1` field in ~/.happier/settings.json.
 * The reader accepts an already-loaded Settings object (not a file path) so it stays pure
 * and testable without filesystem access.
 */
```

---

**Imports pattern**
Source: `apps/cli/src/mcp/servers/readMcpServersSettingsFromAccountSettings.ts` lines 8–9 and `apps/cli/src/persistence.ts` line 16

```typescript
// persistence.ts uses namespace import — match this style in mcpToolsSettings.ts
import * as z from 'zod';
import { logger } from '@/ui/logger';
import type { Settings } from '@/persistence';
```

Note: `readMcpServersSettingsFromAccountSettings.ts` uses named import `{ McpServersSettingsV1Schema }` because the schema lives in another package. Here the schema is in the same file, so no schema import is needed. Match `persistence.ts`'s `import * as z from 'zod'` — not `import { z } from 'zod'` — for consistency with the adjacent file this module integrates with.

---

**Preprocess-wrapped Zod schema pattern**
Source: `packages/protocol/src/mcpServers/settingsV1.ts` lines 121–163

```typescript
export const McpServersSettingsV1Schema = z
  .preprocess(
    (raw) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
      return raw;
    },
    z
      .object({
        v: z.literal(1).default(1),
        strictMode: z.boolean().default(false),
        servers: z.array(McpServerCatalogEntryV1Schema).default([]),
        bindings: z.array(McpServerBindingV1Schema).default([]),
      })
      // ... superRefine ...
  );

export type McpServersSettingsV1 = z.infer<typeof McpServersSettingsV1Schema>;
```

Adapt for `mcpToolsSettings.ts`:

```typescript
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

Key decisions embedded in this pattern:
- `z.preprocess` (not plain `z.object`) — handles `null`/non-object raw values from `unknown` field in Settings before the object schema sees them.
- `z.literal(1).default(1 as const)` — allows blobs with no `v` field (only `tools`) to parse successfully.
- `.default({})` on `tools` — allows `{ "v": 1 }` (no `tools` key) to parse successfully; consistent with SCHEMA-02 opt-out semantics.
- No `.strict()` — forward-compatible: future schema additions will not break existing CLI readers.
- Named type export (`export type McpToolsSettingsV1`) — explicit alias, not left to use-site `z.infer<>`.

---

**Reader returning typed struct on failure — core pattern**
Source: `apps/cli/src/mcp/servers/readMcpServersSettingsFromAccountSettings.ts` lines 14–22

```typescript
export function readMcpServersSettingsFromAccountSettings(settingsLike: unknown): McpServersSettingsV1 {
  const rec = settingsLike && typeof settingsLike === 'object' && !Array.isArray(settingsLike)
    ? (settingsLike as Record<string, unknown>)
    : null;
  const raw = rec?.mcpServersSettingsV1;
  if (!raw) return emptySettings();
  const parsed = McpServersSettingsV1Schema.safeParse(raw);
  return parsed.success ? parsed.data : emptySettings();
}
```

Adapt for `mcpToolsSettings.ts`. Key differences from the analog:
- Parameter type is `Settings` (typed, from `persistence.ts`) — not `unknown` — because D-06 specifies the caller passes the already-loaded settings object.
- The absent-key fast path uses `raw === undefined || raw === null` (explicit, not truthy check) — avoids treating `0` or `false` as absent.
- `logger.warn` fires on parse failure (D-05 requires it); the analog silently returns empty on failure. Add the warn.

```typescript
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

---

**safeParse error handling pattern**
Source: `apps/cli/src/persistence.ts` lines 682–684 (`readDaemonState`) and `apps/cli/src/mcp/servers/readMcpServersSettingsFromAccountSettings.ts` line 21

```typescript
// persistence.ts: warn + return null on failure
const parsed = DaemonLocallyPersistedStateSchema.safeParse(JSON.parse(content));
if (!parsed.success) {
  logger.warn(`[PERSISTENCE] Daemon state file is invalid: ...`, parsed.error);
  return null;
}

// readMcpServersSettingsFromAccountSettings.ts: silent fallback
return parsed.success ? parsed.data : emptySettings();
```

For `mcpToolsSettings.ts`: combine both — warn (from persistence.ts pattern) AND return a typed default (from readMcpServersSettingsFromAccountSettings.ts pattern). Never return `null`. Never throw.

---

### `apps/cli/src/settings/mcpToolsSettings.test.ts` (test)

**Analog:** `apps/cli/src/settings/memorySettings.test.ts`

---

**Test file structure pattern**
Source: `apps/cli/src/settings/memorySettings.test.ts` lines 1–23

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyEnvValues, restoreEnvValues, snapshotEnvValues } from '@/testkit/env/envSnapshot';
import { createTempDir, removeTempDir } from '@/testkit/fs/tempDir';

describe('memorySettings', () => {
  const envBackup = snapshotEnvValues(['HAPPIER_HOME_DIR', 'HAPPIER_SERVER_URL', 'HAPPIER_WEBAPP_URL']);
  let homeDir: string | undefined;

  beforeEach(async () => {
    homeDir = await createTempDir('happier-memory-settings-');
    applyEnvValues({
      HAPPIER_HOME_DIR: homeDir,
      HAPPIER_SERVER_URL: 'https://api.example.test',
      HAPPIER_WEBAPP_URL: 'https://app.example.test',
    });
    vi.resetModules();
  });

  afterEach(async () => {
    restoreEnvValues(envBackup);
    vi.resetModules();
    if (homeDir) await removeTempDir(homeDir);
  });
```

Adapt for `mcpToolsSettings.test.ts`:
- Change `describe('memorySettings', ...)` to `describe('mcpToolsSettings', ...)`
- Change `createTempDir('happier-memory-settings-')` to `createTempDir('happier-mcp-tools-settings-')`
- Keep all three env keys (`HAPPIER_HOME_DIR`, `HAPPIER_SERVER_URL`, `HAPPIER_WEBAPP_URL`) — these are required by the CLI module graph

---

**Dynamic import pattern for module isolation**
Source: `apps/cli/src/settings/memorySettings.test.ts` lines 25–27

```typescript
it('returns defaults when unset', async () => {
  const { readMemorySettingsFromDisk } = await import('./memorySettings');
  const settings = await readMemorySettingsFromDisk();
```

Note: `memorySettings.ts` calls `readSettings()` internally (which reads the file), so it uses async `import` after `vi.resetModules()`. `mcpToolsSettings.ts`'s reader is pure (accepts a Settings object) — it does not call `readSettings()` itself. Tests can import the module statically or dynamically. Dynamic import is still appropriate if the module graph transitively uses any module-level config resolution that reads env vars. Follow the `vi.resetModules()` + `await import(...)` pattern to be safe.

---

**Test case pattern (schema validation assertions)**
Source: `apps/cli/src/settings/memorySettings.test.ts` lines 25–45

```typescript
it('returns defaults when unset', async () => {
  const { readMemorySettingsFromDisk } = await import('./memorySettings');
  const settings = await readMemorySettingsFromDisk();
  expect(settings.v).toBe(1);
  expect(settings.enabled).toBe(false);
  // ...
});

it('persists normalized settings into settings.json', async () => {
  const { readMemorySettingsFromDisk, writeMemorySettingsToDisk } = await import('./memorySettings');
  // write then read-back
});
```

For `mcpToolsSettings.test.ts`, the test cases are pure in-memory (no file I/O). Call `readMcpToolsSettingsV1(settingsObject)` directly. Required test cases per RESEARCH.md validation architecture:

1. Absent `mcpToolsSettingsV1` key → returns `DEFAULT_MCP_TOOLS_SETTINGS`, no `logger.warn`
2. Valid blob `{ v: 1, tools: { "change_title": { "enabled": false } } }` → parses, returns struct
3. Blob with only `tools` (no `v`) → parses via `.default(1 as const)`, returns struct
4. Blob with unrecognized top-level keys → parses successfully (forward-compat)
5. Schema-invalid blob (e.g. `{ v: 2 }`, `{ v: 1, tools: "bad" }`) → returns default, emits `logger.warn`
6. Empty `tools` map → all tool names implicitly enabled (`tools["anything"]` is `undefined`)

---

### `apps/cli/src/persistence.ts` (modified — Settings interface)

**Analog:** self (existing `Settings` interface, lines 43–113)

---

**Existing field documentation pattern**
Source: `apps/cli/src/persistence.ts` lines 108–112

```typescript
  /**
   * Device-local daemon memory settings (schema v5+; stored as an opaque JSON payload).
   * Parsed/normalized by `settings/memorySettings.ts`.
   */
  memory?: unknown
```

Adapt for the new field. Add immediately after `memory?: unknown` (line 112). Use `import type` at the top of the file to avoid a circular runtime dependency:

```typescript
// Add to top-of-file imports (after existing imports, before any code):
import type { McpToolsSettingsV1 } from '@/settings/mcpToolsSettings';

// Add inside the Settings interface after `memory?: unknown`:
  /**
   * Per-tool MCP enable/disable configuration (CLI-local; schema-validated).
   * Parsed/normalized by `settings/mcpToolsSettings.ts`.
   */
  mcpToolsSettingsV1?: McpToolsSettingsV1;
```

Key constraints:
- `import type` only — not a value import. This prevents a circular runtime dependency: `persistence.ts` is imported by `mcpToolsSettings.ts`'s callers, and `mcpToolsSettings.ts` imports `Settings` from `persistence.ts` via `import type`. The type-only import is erased at runtime, so no circular dep at runtime.
- No `SUPPORTED_SCHEMA_VERSION` bump — D-04 is explicit. The field is optional and `migrateSettings` round-trips unknown keys unchanged.
- Do not add `mcpToolsSettingsV1` to `defaultSettings` (line 115) — it is intentionally absent from the default, matching the `memory?: unknown` pattern.

---

## Shared Patterns

### Zod import style
**Source:** `apps/cli/src/persistence.ts` line 16
**Apply to:** `apps/cli/src/settings/mcpToolsSettings.ts`

```typescript
import * as z from 'zod';
```

Use namespace import (`import * as z`), not named import (`import { z }`). This matches `persistence.ts` — the file this module integrates with — and avoids potential shadowing if excerpts are copy-pasted from files that use named import.

---

### `safeParse` (never `parse`) for settings validation
**Source:** `apps/cli/src/persistence.ts` lines 648–651 and `apps/cli/src/mcp/servers/readMcpServersSettingsFromAccountSettings.ts` line 21
**Apply to:** `apps/cli/src/settings/mcpToolsSettings.ts`

```typescript
const parsed = SomeSchema.safeParse(raw);
if (!parsed.success) { /* handle */ }
return parsed.data;
```

Never use `.parse()` (throws on failure). `.safeParse()` is the project standard for settings reads. See also: `DaemonLocallyPersistedStateSchema.safeParse(...)` in `persistence.ts` line 648.

---

### `logger.warn` for non-fatal settings errors
**Source:** `apps/cli/src/persistence.ts` lines 317–320 and 683–684
**Apply to:** `apps/cli/src/settings/mcpToolsSettings.ts` (parse-failure branch only)

```typescript
logger.warn(`[PERSISTENCE] Daemon state file is invalid: ${configuration.daemonStateFile}`, parsed.error);
```

Pattern: bracketed module tag + human-readable message. For `mcpToolsSettings.ts`:

```typescript
logger.warn(`[mcpToolsSettings] mcpToolsSettingsV1 failed schema validation — using defaults. Error: ${parsed.error.message}`);
```

Only on `!parsed.success`. Never warn on absent key (D-05).

---

### Test env isolation pattern
**Source:** `apps/cli/src/settings/memorySettings.test.ts` lines 6–22
**Apply to:** `apps/cli/src/settings/mcpToolsSettings.test.ts`

```typescript
const envBackup = snapshotEnvValues(['HAPPIER_HOME_DIR', 'HAPPIER_SERVER_URL', 'HAPPIER_WEBAPP_URL']);
// beforeEach: createTempDir + applyEnvValues + vi.resetModules()
// afterEach:  restoreEnvValues + vi.resetModules() + removeTempDir
```

Three env keys always snapshotted together. `vi.resetModules()` in both `beforeEach` and `afterEach` to ensure module-level config is re-evaluated per test.

---

## No Analog Found

None. All three files have close matches in the codebase.

---

## Metadata

**Analog search scope:**
- `apps/cli/src/settings/` (direct)
- `apps/cli/src/mcp/servers/` (direct)
- `packages/protocol/src/mcpServers/` (direct)
- `apps/cli/src/persistence.ts` (direct)

**Files read:** 5 source files + 2 planning documents
**Pattern extraction date:** 2026-04-18
