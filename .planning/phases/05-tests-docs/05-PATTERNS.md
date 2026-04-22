# Phase 5: Tests & Docs - Pattern Map

**Mapped:** 2026-04-22
**Files analyzed:** 2 modified files
**Analogs found:** 2 / 2

## File Classification

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------|------|-----------|----------------|---------------|
| `apps/cli/src/settings/sessionAgentToolsSettings.test.ts` | test | request-response | itself (existing describe blocks in same file) | exact — new block added at same nesting level |
| `docs/mcp-tool-filtering.md` | documentation | — | itself (existing Part 1 + Part 2 structure) | exact — in-place targeted edits |

## Pattern Assignments

### `apps/cli/src/settings/sessionAgentToolsSettings.test.ts` (test, unit)

**Analog:** Same file — existing `describe('buildIsSessionAgentToolEnabled')` block at lines 108–194.

**Imports pattern** (lines 1–7):
```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyEnvValues, restoreEnvValues, snapshotEnvValues } from '@/testkit/env/envSnapshot';
import { createTempDir, removeTempDir } from '@/testkit/fs/tempDir';

vi.mock('@/ui/logger', () => ({
    logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
```

**Outer describe setup — inherited by all nested describe blocks** (lines 9–27):
```typescript
describe('sessionAgentToolsSettings', () => {
    const envBackup = snapshotEnvValues(['HAPPIER_HOME_DIR', 'HAPPIER_SERVER_URL', 'HAPPIER_WEBAPP_URL']);
    let homeDir: string | undefined;

    beforeEach(async () => {
        homeDir = await createTempDir('happier-session-agent-tools-settings-');
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
    // ...
});
```

**Core pattern — `it` block structure with dynamic import** (lines 109–115 — representative example):
```typescript
it('returns true for a tool absent from the tools map (opt-out model, SCHEMA-02)', async () => {
    const { readSessionAgentToolsSettings, buildIsSessionAgentToolEnabled } =
        await import('./sessionAgentToolsSettings');
    const settings = readSessionAgentToolsSettings({} as any);
    const predicate = buildIsSessionAgentToolEnabled(settings);
    expect(predicate('change_title')).toBe(true);
    expect(predicate('any_absent_tool')).toBe(true);
});
```

**Existing nested describe pattern — placement reference** (lines 108 and 196):
```typescript
describe('buildIsSessionAgentToolEnabled', () => {  // line 108 — sibling level for new block
    // ...
});

describe('findUnknownSessionAgentToolNames', () => {  // line 196 — sibling level for new block
    // ...
});
```

**New describe block to add — placed at sibling level after line 194 (end of `buildIsSessionAgentToolEnabled` block), before line 196 (`findUnknownSessionAgentToolNames`):**
```typescript
describe('3-level lookup (TEST-01..04)', () => {
    it('returns true for absent tool when default is absent — backward compat (TEST-01)', async () => {
        const { readSessionAgentToolsSettings, buildIsSessionAgentToolEnabled } =
            await import('./sessionAgentToolsSettings');
        const settings = readSessionAgentToolsSettings({
            sessionAgentToolsSettingsV1: { v: 1, tools: {} },
        } as any);
        expect(buildIsSessionAgentToolEnabled(settings)('any_absent_tool')).toBe(true);
    });

    it('returns false for absent tool when default is false — opt-in mode (TEST-02)', async () => {
        const { readSessionAgentToolsSettings, buildIsSessionAgentToolEnabled } =
            await import('./sessionAgentToolsSettings');
        const settings = readSessionAgentToolsSettings({
            sessionAgentToolsSettingsV1: { v: 1, tools: {}, default: false },
        } as any);
        expect(buildIsSessionAgentToolEnabled(settings)('any_absent_tool')).toBe(false);
    });

    it('returns true for per-tool enabled:true when default is false — per-tool wins (TEST-03)', async () => {
        const { readSessionAgentToolsSettings, buildIsSessionAgentToolEnabled } =
            await import('./sessionAgentToolsSettings');
        const settings = readSessionAgentToolsSettings({
            sessionAgentToolsSettingsV1: { v: 1, tools: { memory_search: { enabled: true } }, default: false },
        } as any);
        expect(buildIsSessionAgentToolEnabled(settings)('memory_search')).toBe(true);
    });

    it('returns false for per-tool enabled:false when default is true — per-tool wins (TEST-04)', async () => {
        const { readSessionAgentToolsSettings, buildIsSessionAgentToolEnabled } =
            await import('./sessionAgentToolsSettings');
        const settings = readSessionAgentToolsSettings({
            sessionAgentToolsSettingsV1: { v: 1, tools: { memory_search: { enabled: false } }, default: true },
        } as any);
        expect(buildIsSessionAgentToolEnabled(settings)('memory_search')).toBe(false);
    });
});
```

**Key rules (derived from existing tests):**
- Do NOT add a nested `beforeEach` — the outer `beforeEach` at lines 13–21 already calls `vi.resetModules()` and sets up `HAPPIER_HOME_DIR`. All nested describes inherit it automatically.
- Each `it` must call `await import('./sessionAgentToolsSettings')` fresh — module re-isolation is per-`it` via the outer `beforeEach`'s `vi.resetModules()`.
- Use `as any` for the raw settings blob passed to `readSessionAgentToolsSettings` — this matches the existing test pattern throughout the file.

---

### `docs/mcp-tool-filtering.md` (documentation)

**Analog:** Same file — existing Part 1 schema table (lines 40–45), Example D block (lines 101–149), and Part 2 section (lines 169–213).

**Edit 1 — Part 1 schema table: add `default` row** (after line 44, which ends the `tools` row):

Current table (lines 40–45):
```markdown
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `v` | `1` (literal) | Yes | Schema version. Must be `1`. |
| `tools` | object | No | Map of tool name → `{ "enabled": boolean }`. An empty object (or omitting the key entirely) enables all tools. |
```

Add new row after the `tools` row:
```markdown
| `default` | `boolean` | No | Global enabled/disabled baseline for all unconfigured tools. Omitting this field preserves the default opt-out behaviour (all tools enabled). |
```

**Edit 2 — Example E: append after line 149 (end of Example D block), before line 151 (`### Error handling`):**

Format matches existing examples A–D: heading + prose paragraph + JSON code block.
```markdown
#### Example E — Opt-in mode (allow only specific tools)

To restrict the session agent to a small explicit allowlist, set `"default": false` to disable all tools by default, then selectively re-enable only the tools you need. Any tool without an explicit `"enabled": true` entry will be blocked:

```json
{
  "sessionAgentToolsSettingsV1": {
    "v": 1,
    "default": false,
    "tools": {
      "session_status_get": { "enabled": true },
      "session_history_get": { "enabled": true },
      "session_messages_recent_get": { "enabled": true }
    }
  }
}
```

This configuration exposes only the three read-only session inspection tools and blocks everything else — useful for automated pipelines or auditing scenarios where write operations must be prevented.
```

**Edit 3 — Part 2, filter chain step 1 (line 178): rename function reference**

Current (line 178):
```
1. **Read settings** — `apps/cli/src/mcp/startHappyServer.ts` calls `readSettings()`, then passes the result to `readSessionAgentToolsSettingsV1(settings)` and `buildIsSessionAgentToolEnabled(toolsSettings)` to produce the `isSessionAgentToolEnabled` predicate. This happens once; the predicate is reused for every subsequent MCP request.
```

Replace `readSessionAgentToolsSettingsV1(settings)` with `readSessionAgentToolsSettings(settings)`.

**Edit 4 — Part 2, schema reader contract section (lines 188–193): rename function and type**

Current (lines 188–193):
```markdown
### Schema reader contract

`readSessionAgentToolsSettingsV1` in `apps/cli/src/settings/sessionAgentToolsSettings.ts` **never throws**. Its behavior on edge cases:

- Absent key → returns `DEFAULT_SESSION_AGENT_TOOLS_SETTINGS` (`{ v: 1, tools: {} }`) silently.
- Zod parse failure → returns the same default and emits `logger.warn`.

Callers can rely on always receiving a valid `SessionAgentToolsSettingsV1` object.
```

Replace:
- `readSessionAgentToolsSettingsV1` → `readSessionAgentToolsSettings` (heading and body)
- `SessionAgentToolsSettingsV1 object` → `SessionAgentToolsSettings object` (last sentence)

**Edit 5 — Part 2, predicate logic section (lines 196–203): replace old 2-level formula with 3-level description**

Current (lines 196–203):
```markdown
### Predicate logic

The predicate built by `buildIsSessionAgentToolEnabled` is:

```typescript
(toolName) => settings.tools[toolName]?.enabled !== false
```

This is the opt-out model: anything not explicitly set to `false` (including missing entries) is treated as enabled.
```

Replace with:
```markdown
### Predicate logic

The predicate built by `buildIsSessionAgentToolEnabled` uses a three-level lookup:

```typescript
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

Lookup order:
1. **Per-tool entry** — if `settings.tools[toolName]` exists, its `enabled` field is authoritative.
2. **Global default** — if no per-tool entry exists, fall back to `settings.default`.
3. **Hardcoded fallback** — if `settings.default` is also absent, return `true` (backward-compatible opt-out model).
```

**Edit 6 — Part 2, settings field location section (lines 210–213): rename reader reference**

Current (line 213):
```
It is typed as `unknown` to decouple the persistence layer from the settings schema version. Always access it through `readSessionAgentToolsSettingsV1(settings)` — never cast or read the raw field directly.
```

Replace `readSessionAgentToolsSettingsV1(settings)` with `readSessionAgentToolsSettings(settings)`.

---

## Shared Patterns

### Module re-isolation per `it` (test file)
**Source:** `apps/cli/src/settings/sessionAgentToolsSettings.test.ts` lines 13–26
**Apply to:** All new `it` blocks in the new `describe('3-level lookup (TEST-01..04)')` block

The outer `beforeEach` calls `vi.resetModules()` before each test. Each `it` then calls `await import('./sessionAgentToolsSettings')` to get a fresh module instance. Do not add a redundant nested `beforeEach`.

### Env isolation (test file)
**Source:** `apps/cli/src/settings/sessionAgentToolsSettings.test.ts` lines 10, 15–19, 24
**Apply to:** Inherited — no action needed in the new block

`snapshotEnvValues` / `applyEnvValues` / `restoreEnvValues` are already wired at the outer describe level. New tests inherit the isolated `HAPPIER_HOME_DIR` environment automatically.

---

## No Analog Found

None. Both files are fully self-analog — the new content follows patterns already present in the same files.

---

## Metadata

**Analog search scope:** `apps/cli/src/settings/`, `docs/`
**Files scanned:** 2 (both are the files being modified; their existing content provides all necessary patterns)
**Pattern extraction date:** 2026-04-22
