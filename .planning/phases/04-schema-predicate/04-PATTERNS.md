# Phase 4: Schema & Predicate - Pattern Map

**Mapped:** 2026-04-22
**Files analyzed:** 2 (1 modified source, 1 modified test)
**Analogs found:** 2 / 2

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `apps/cli/src/settings/sessionAgentToolsSettings.ts` | utility / settings module | transform (parse + predicate build) | `apps/cli/src/settings/actionsSettings.ts` | role-match (same settings layer, same `safeParse` + predicate pattern) |
| `apps/cli/src/settings/sessionAgentToolsSettings.test.ts` | test | — | `apps/cli/src/settings/sessionAgentToolsSettings.test.ts` (existing) | exact (extend in-place) |

---

## Pattern Assignments

### `apps/cli/src/settings/sessionAgentToolsSettings.ts` (utility, transform)

**Analog:** `apps/cli/src/settings/actionsSettings.ts` (same settings layer, `safeParse` + predicate pattern)
**Also verified against:** `apps/cli/src/backends/claude/types.ts` (confirms `z.boolean().optional()` usage under Zod 4.3.6)

---

**Imports pattern** (lines 10–12 of current file):

```typescript
import * as z from 'zod';
import { logger } from '@/ui/logger';
import type { Settings } from '@/persistence';
```

No import changes needed. The `default` field addition and identifier renames are entirely internal to the module.

---

**Zod optional boolean field pattern** — from `apps/cli/src/backends/claude/types.ts`, lines 27–28:

```typescript
isSidechain: z.boolean().optional(),
isMeta: z.boolean().optional(),
```

Apply this exact pattern for the new `default` field. Do NOT use `.default(true)` — absence must remain distinguishable from an explicit `true` value.

---

**Schema definition pattern** (lines 14–23 of current file — the block being modified):

```typescript
// CURRENT (v1.0):
export const SessionAgentToolsSettingsV1Schema = z.preprocess(
    (raw) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
        return raw;
    },
    z.object({
        v: z.literal(1).default(1 as const),
        tools: z.record(z.string(), z.object({ enabled: z.boolean() })).default({}),
    }),
);

// TARGET (v1.1 — add one line inside z.object()):
export const SessionAgentToolsSettingsSchema = z.preprocess(
    (raw) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
        return raw;
    },
    z.object({
        v: z.literal(1).default(1 as const),
        tools: z.record(z.string(), z.object({ enabled: z.boolean() })).default({}),
        default: z.boolean().optional(),
    }),
);
```

Note: identifier renamed from `SessionAgentToolsSettingsV1Schema` → `SessionAgentToolsSettingsSchema` per D-03.

---

**Type alias pattern** (line 25 of current file — rename only):

```typescript
// CURRENT:
export type SessionAgentToolsSettingsV1 = z.infer<typeof SessionAgentToolsSettingsV1Schema>;

// TARGET:
export type SessionAgentToolsSettings = z.infer<typeof SessionAgentToolsSettingsSchema>;
// Inferred type becomes: { v: 1; tools: Record<string, { enabled: boolean }>; default?: boolean }
```

---

**DEFAULT constant pattern** (line 27 of current file — rename only, value unchanged):

```typescript
// CURRENT:
export const DEFAULT_SESSION_AGENT_TOOLS_SETTINGS: SessionAgentToolsSettingsV1 = { v: 1, tools: {} };

// TARGET (only the type annotation identifier changes):
export const DEFAULT_SESSION_AGENT_TOOLS_SETTINGS: SessionAgentToolsSettings = { v: 1, tools: {} };
// The object literal { v: 1, tools: {} } is structurally compatible with the updated type
// because `default` is optional — TypeScript accepts it without adding `default: undefined`.
```

---

**Reader function pattern** (lines 37–48 of current file — rename only, no logic changes):

```typescript
// CURRENT:
export function readSessionAgentToolsSettingsV1(settings: Settings): SessionAgentToolsSettingsV1 {
    const raw = settings.sessionAgentToolsSettingsV1;
    if (raw === undefined || raw === null) {
        return DEFAULT_SESSION_AGENT_TOOLS_SETTINGS;
    }
    const parsed = SessionAgentToolsSettingsV1Schema.safeParse(raw);
    if (!parsed.success) {
        logger.warn(`[sessionAgentToolsSettings] sessionAgentToolsSettingsV1 failed schema validation — using defaults. Error: ${parsed.error.message}`);
        return DEFAULT_SESSION_AGENT_TOOLS_SETTINGS;
    }
    return parsed.data;
}

// TARGET (identifier renames only — the JSON key `sessionAgentToolsSettingsV1` in settings.json is NOT renamed):
export function readSessionAgentToolsSettings(settings: Settings): SessionAgentToolsSettings {
    const raw = settings.sessionAgentToolsSettingsV1;   // ← JSON key stays as-is (D-03)
    if (raw === undefined || raw === null) {
        return DEFAULT_SESSION_AGENT_TOOLS_SETTINGS;
    }
    const parsed = SessionAgentToolsSettingsSchema.safeParse(raw);
    if (!parsed.success) {
        logger.warn(`[sessionAgentToolsSettings] sessionAgentToolsSettingsV1 failed schema validation — using defaults. Error: ${parsed.error.message}`);
        return DEFAULT_SESSION_AGENT_TOOLS_SETTINGS;
    }
    return parsed.data;
}
```

The `safeParse` + `logger.warn` + DEFAULT fallback is the established no-throw reader pattern — copy from `apps/cli/src/settings/actionsSettings.ts` lines 24–25.

---

**Predicate builder pattern** (lines 57–61 of current file — logic change + rename):

```typescript
// CURRENT (v1.0):
/**
 * Builds the isSessionAgentToolEnabled predicate from a parsed settings blob.
 *
 * Returns true for any tool absent from the tools map (opt-out model, SCHEMA-02).
 * Returns true when enabled === true. Returns false when enabled === false.
 * Never throws.
 */
export function buildIsSessionAgentToolEnabled(
    settings: SessionAgentToolsSettingsV1,
): (toolName: string) => boolean {
    return (toolName: string) => settings.tools[toolName]?.enabled !== false;
}

// TARGET (v1.1 — updated JSDoc, updated parameter type, updated return body):
/**
 * Builds the isSessionAgentToolEnabled predicate from a parsed settings blob.
 *
 * Lookup order: per-tool entry → global default → true (opt-out model).
 * - Per-tool entry present: returns entry.enabled (true or false).
 * - Per-tool entry absent, default set: returns settings.default.
 * - Per-tool entry absent, default unset: returns true (backward-compatible opt-out).
 * Never throws.
 */
export function buildIsSessionAgentToolEnabled(
    settings: SessionAgentToolsSettings,
): (toolName: string) => boolean {
    return (toolName: string) => {
        const perTool = settings.tools[toolName];
        if (perTool !== undefined) {
            return perTool.enabled;
        }
        return settings.default ?? true;
    };
}
```

Critical: use `?? true` (not `?? false`). The `true` is the backward-compatible opt-out fallback (D-05).

---

**`findUnknownSessionAgentToolNames` pattern** (lines 73–79 of current file — rename of parameter type only):

```typescript
// CURRENT:
export function findUnknownSessionAgentToolNames(
    settings: SessionAgentToolsSettingsV1,
    knownNames: string[],
): string[] { ... }

// TARGET (only the parameter type identifier changes):
export function findUnknownSessionAgentToolNames(
    settings: SessionAgentToolsSettings,
    knownNames: string[],
): string[] { ... }
```

Body is unchanged.

---

**Call site update — `apps/cli/src/mcp/startHappyServer.ts`** (line 12 of that file):

```typescript
// CURRENT (line 12):
import { readSessionAgentToolsSettingsV1, buildIsSessionAgentToolEnabled, findUnknownSessionAgentToolNames } from '@/settings/sessionAgentToolsSettings';

// TARGET (renamed identifiers only):
import { readSessionAgentToolsSettings, buildIsSessionAgentToolEnabled, findUnknownSessionAgentToolNames } from '@/settings/sessionAgentToolsSettings';
```

Also update line 40 of `startHappyServer.ts`:
```typescript
// CURRENT (line 40):
    const toolsSettings = readSessionAgentToolsSettingsV1(settings);

// TARGET:
    const toolsSettings = readSessionAgentToolsSettings(settings);
```

`buildIsSessionAgentToolEnabled` and `findUnknownSessionAgentToolNames` are not renamed (D-03 only lists the V1-suffixed identifiers).

---

### `apps/cli/src/settings/sessionAgentToolsSettings.test.ts` (test, extend in-place)

**Analog:** The existing `apps/cli/src/settings/sessionAgentToolsSettings.test.ts` — extend the existing `describe('buildIsSessionAgentToolEnabled', ...)` block (lines 108–135).

---

**Test file structure pattern** (lines 1–27 of existing test — copy exactly for new tests):

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyEnvValues, restoreEnvValues, snapshotEnvValues } from '@/testkit/env/envSnapshot';
import { createTempDir, removeTempDir } from '@/testkit/fs/tempDir';

vi.mock('@/ui/logger', () => ({
    logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
```

All new tests go inside the outer `describe('sessionAgentToolsSettings', ...)` block. New `buildIsSessionAgentToolEnabled` tests join the existing inner `describe('buildIsSessionAgentToolEnabled', ...)` block (line 108).

---

**Existing predicate test pattern** (lines 109–135 — copy structure for new test cases):

```typescript
it('returns true for a tool absent from the tools map (opt-out model, SCHEMA-02)', async () => {
    const { readSessionAgentToolsSettingsV1, buildIsSessionAgentToolEnabled } =
        await import('./sessionAgentToolsSettings');
    const settings = readSessionAgentToolsSettingsV1({} as any);
    const predicate = buildIsSessionAgentToolEnabled(settings);
    expect(predicate('change_title')).toBe(true);
    expect(predicate('any_absent_tool')).toBe(true);
});
```

Pattern rules:
- Dynamic import inside each `it()` block (because `vi.resetModules()` runs in `beforeEach`)
- Import both `readSessionAgentToolsSettings` (renamed) and `buildIsSessionAgentToolEnabled` together
- Pass inline `{ sessionAgentToolsSettingsV1: { ... } } as any` to the reader for fixture data
- Assert with `.toBe(true)` / `.toBe(false)` — not `.toEqual()`

---

**New test cases to add inside `describe('buildIsSessionAgentToolEnabled', ...)`:**

```typescript
// SCHEMA-01: explicit default: true acts as explicit enable-all
it('returns true for absent tool when default is true', async () => {
    const { readSessionAgentToolsSettings, buildIsSessionAgentToolEnabled } =
        await import('./sessionAgentToolsSettings');
    const settings = readSessionAgentToolsSettings({
        sessionAgentToolsSettingsV1: { v: 1, tools: {}, default: true },
    } as any);
    expect(buildIsSessionAgentToolEnabled(settings)('any_absent_tool')).toBe(true);
});

// SCHEMA-02: default: false enables opt-in mode
it('returns false for absent tool when default is false (opt-in mode)', async () => {
    const { readSessionAgentToolsSettings, buildIsSessionAgentToolEnabled } =
        await import('./sessionAgentToolsSettings');
    const settings = readSessionAgentToolsSettings({
        sessionAgentToolsSettingsV1: { v: 1, tools: {}, default: false },
    } as any);
    expect(buildIsSessionAgentToolEnabled(settings)('any_absent_tool')).toBe(false);
});

// SCHEMA-03: absent default → same as v1.0 opt-out behavior
it('returns true for absent tool when default field is omitted (backward compat)', async () => {
    const { readSessionAgentToolsSettings, buildIsSessionAgentToolEnabled } =
        await import('./sessionAgentToolsSettings');
    const settings = readSessionAgentToolsSettings({
        sessionAgentToolsSettingsV1: { v: 1, tools: {} },
    } as any);
    expect(buildIsSessionAgentToolEnabled(settings)('any_absent_tool')).toBe(true);
});

// SCHEMA-04: per-tool entry overrides default in both directions
it('per-tool enabled:true overrides default:false', async () => {
    const { readSessionAgentToolsSettings, buildIsSessionAgentToolEnabled } =
        await import('./sessionAgentToolsSettings');
    const settings = readSessionAgentToolsSettings({
        sessionAgentToolsSettingsV1: { v: 1, tools: { change_title: { enabled: true } }, default: false },
    } as any);
    expect(buildIsSessionAgentToolEnabled(settings)('change_title')).toBe(true);
});

it('per-tool enabled:false overrides default:true', async () => {
    const { readSessionAgentToolsSettings, buildIsSessionAgentToolEnabled } =
        await import('./sessionAgentToolsSettings');
    const settings = readSessionAgentToolsSettings({
        sessionAgentToolsSettingsV1: { v: 1, tools: { change_title: { enabled: false } }, default: true },
    } as any);
    expect(buildIsSessionAgentToolEnabled(settings)('change_title')).toBe(false);
});

// VALID-01: non-boolean default causes safeParse failure → DEFAULT returned (no throw)
it('returns DEFAULT and warns when default field is non-boolean', async () => {
    const { logger } = await import('@/ui/logger');
    const warnSpy = vi.mocked(logger.warn);
    warnSpy.mockClear();
    const { readSessionAgentToolsSettings, DEFAULT_SESSION_AGENT_TOOLS_SETTINGS, buildIsSessionAgentToolEnabled } =
        await import('./sessionAgentToolsSettings');
    const settings = readSessionAgentToolsSettings({
        sessionAgentToolsSettingsV1: { v: 1, tools: {}, default: 'bad' },
    } as any);
    expect(settings).toEqual(DEFAULT_SESSION_AGENT_TOOLS_SETTINGS);
    expect(warnSpy).toHaveBeenCalledOnce();
    // Predicate on DEFAULT falls back to true (backward compat)
    expect(buildIsSessionAgentToolEnabled(settings)('any_tool')).toBe(true);
});
```

Note: the renamed imports (`readSessionAgentToolsSettings`, `DEFAULT_SESSION_AGENT_TOOLS_SETTINGS`) are used throughout these new tests, consistent with D-03.

---

## Shared Patterns

### No-throw safe reader (safeParse + warn + default)
**Source:** `apps/cli/src/settings/sessionAgentToolsSettings.ts` lines 37–48 (unchanged by this phase)
**Apply to:** The renamed `readSessionAgentToolsSettings` function — same structure, no new parse paths needed.

```typescript
const parsed = SessionAgentToolsSettingsSchema.safeParse(raw);
if (!parsed.success) {
    logger.warn(`[sessionAgentToolsSettings] sessionAgentToolsSettingsV1 failed schema validation — using defaults. Error: ${parsed.error.message}`);
    return DEFAULT_SESSION_AGENT_TOOLS_SETTINGS;
}
return parsed.data;
```

### Zod optional boolean field
**Source:** `apps/cli/src/backends/claude/types.ts` lines 27–28
**Apply to:** New `default` field in `SessionAgentToolsSettingsSchema`

```typescript
isSidechain: z.boolean().optional(),
isMeta: z.boolean().optional(),
// → for this phase:
default: z.boolean().optional(),
```

### Null-coalescing fallback with `?? true`
**Source:** New predicate body (no prior analog — this is the new pattern being established)
**Apply to:** `buildIsSessionAgentToolEnabled` return body

```typescript
return settings.default ?? true;
// NOT: settings.default ?? false  (breaks backward compat)
// NOT: settings.default || true   (wrong for explicit `false`)
```

---

## No Analog Found

None. Both files have clear analogs or can be extended in-place.

---

## Metadata

**Analog search scope:** `apps/cli/src/settings/`, `apps/cli/src/backends/claude/`, `apps/cli/src/mcp/`
**Files scanned:** 6 (sessionAgentToolsSettings.ts, sessionAgentToolsSettings.test.ts, actionsSettings.ts, startHappyServer.ts, claude/types.ts, persistence.ts)
**Pattern extraction date:** 2026-04-22
