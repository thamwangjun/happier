# Phase 5: Tests & Docs — Research

**Researched:** 2026-04-22
**Domain:** Vitest unit tests + Markdown documentation update
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Add a **new top-level `describe` block** for the 3-level lookup scenarios — separate from the existing `buildIsSessionAgentToolEnabled` describe block. Do not add into the existing nested block.
- **D-02:** The new describe block must cover all four scenarios: TEST-01 (backward compat — no default key), TEST-02 (default:false disables unset tools), TEST-03 (per-tool enabled:true overrides default:false), TEST-04 (per-tool enabled:false overrides default:true).
- **D-03:** The existing tests must not be deleted or conflict with the new block.
- **D-04:** Fix **all stale content** in Part 2 of `docs/mcp-tool-filtering.md`:
  - Update predicate formula from old single-expression to 3-level lookup description.
  - Update function name from `readSessionAgentToolsSettingsV1` to `readSessionAgentToolsSettings`.
  - Update schema reader contract section to reflect un-versioned identifier.
- **D-05:** Update the schema table in Part 1 to include the `default` field (`boolean`, optional, global enabled/disabled baseline for all unconfigured tools).
- **D-06:** Add Example E after Example D (disable all tools) — keeping progressive example structure.
- **D-07:** Example E format: short prose paragraph describing opt-in mode, followed by a copy-pasteable JSON snippet with `default: false` and at least one per-tool `enabled: true` override.

### Claude's Discretion

- Exact prose wording for the Example E explanation paragraph.
- Whether to include `default: true` as a second snippet in Example E (explicit opt-out) — may add if it aids clarity without bloating.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TEST-01 | Predicate returns `true` when tool has no per-tool entry and `default` is absent (backward compat) | Already exercised in existing `buildIsSessionAgentToolEnabled` block — new block adds dedicated top-level coverage |
| TEST-02 | Predicate returns `false` when tool has no per-tool entry and `default: false` | Already exercised in existing block — new top-level block adds explicit labelled coverage |
| TEST-03 | Predicate returns `true` when tool has `enabled: true` even when `default: false` (per-tool wins) | Already exercised in existing block — new top-level block confirms at a named describe level |
| TEST-04 | Predicate returns `false` when tool has `enabled: false` even when `default: true` (per-tool wins) | Already exercised in existing block — new top-level block confirms at a named describe level |
| DOCS-01 | `docs/mcp-tool-filtering.md` demonstrates `default: false` opt-in pattern with per-tool overrides | Requires Part 1 schema table update + Example E addition + Part 2 stale content fixes |
</phase_requirements>

---

## Summary

Phase 5 is a test-authoring and documentation-editing phase. No production source files change. There are two deliverables: (1) a new top-level `describe` block in `sessionAgentToolsSettings.test.ts` covering the four predicate requirements TEST-01..04, and (2) targeted edits to `docs/mcp-tool-filtering.md` addressing stale Part 2 content and adding the `default: false` opt-in example (Example E).

The predicate implementation in `sessionAgentToolsSettings.ts` is complete and correct. All 21 existing tests pass. The four required scenarios (TEST-01..04) are already tested inside the nested `buildIsSessionAgentToolEnabled` describe block added in Phase 4 — the Phase 5 task is to add a **separate top-level** describe block for explicit requirement traceability in test output. The new block is purely additive.

The documentation has three categories of stale content in Part 2: the predicate formula (old single-expression, now 3-level), the reader function name (`readSessionAgentToolsSettingsV1` → `readSessionAgentToolsSettings`), and the schema reader contract return-type reference. All are localized within Part 2 and require targeted in-place edits. The schema table in Part 1 needs one new row for `default`. Example E is a new section appended after Example D.

**Primary recommendation:** Single plan, one wave. Write the new `describe` block first (TEST-01..04), verify all 21+4 tests pass, then make the three Part 2 doc fixes and add Example E.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Predicate unit tests | CLI (test file) | — | Tests live co-located with source in `apps/cli/src/settings/` |
| Documentation | `/docs/` (repo-level) | — | `docs/mcp-tool-filtering.md` is not tier-specific; it serves both users and contributors |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vitest | 3.x [VERIFIED: apps/cli/vitest.config.ts] | Unit test runner | Already in use throughout CLI; all existing tests use it |
| TypeScript | 5.9.3 [VERIFIED: CLAUDE.md] | Language | Project-wide, strict mode |

### Test Utilities (Already Available)

| Utility | Location | Purpose |
|---------|----------|---------|
| `snapshotEnvValues` / `applyEnvValues` / `restoreEnvValues` | `@/testkit/env/envSnapshot` | Env var isolation per test — used by existing tests |
| `createTempDir` / `removeTempDir` | `@/testkit/fs/tempDir` | Temp dir lifecycle — used by existing tests |
| `vi.resetModules()` + dynamic `import()` | Vitest built-in | Module re-isolation per `it` block — existing pattern in the test file |

**Installation:** No new packages needed. [VERIFIED: test file passes 21/21 with existing deps]

---

## Architecture Patterns

### Existing Test File Structure (VERIFIED by reading the file)

```
describe('sessionAgentToolsSettings', () => {
    // Top-level setup: envSnapshot, createTempDir, beforeEach/afterEach
    // Top-level it() blocks: reader function tests (8 tests)

    describe('buildIsSessionAgentToolEnabled', () => {
        // 9 it() blocks covering opt-out model, per-tool overrides, 3-level lookup
        // (includes the Phase 4 tests for SCHEMA-01..04, TEST-01..04 scenarios)
    });

    describe('findUnknownSessionAgentToolNames', () => {
        // 3 it() blocks
    });
});
```

**Total existing:** 21 tests, all passing [VERIFIED: `cd apps/cli && npx vitest run src/settings/sessionAgentToolsSettings.test.ts` → 21 passed].

### Pattern for New `describe` Block

Per D-01, a new **top-level** `describe` block is added at the same nesting level as `buildIsSessionAgentToolEnabled` and `findUnknownSessionAgentToolNames` — inside the outer `describe('sessionAgentToolsSettings')` wrapper.

The existing `beforeEach`/`afterEach` in the outer describe already set up `HAPPIER_HOME_DIR` and call `vi.resetModules()`. The new describe block inherits this setup — no additional beforeEach needed.

Each `it` in the new block must follow the established pattern:

```typescript
// Source: apps/cli/src/settings/sessionAgentToolsSettings.test.ts (existing pattern)
it('description (REQ-ID)', async () => {
    const { readSessionAgentToolsSettings, buildIsSessionAgentToolEnabled } =
        await import('./sessionAgentToolsSettings');
    const settings = readSessionAgentToolsSettings({
        sessionAgentToolsSettingsV1: { v: 1, tools: { /* ... */ }, default: /* ... */ },
    } as any);
    expect(buildIsSessionAgentToolEnabled(settings)('tool_name')).toBe(true | false);
});
```

### New Describe Block — Four Required Tests

```typescript
// Source: derived from REQUIREMENTS.md TEST-01..04 + existing pattern
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

Note: Tests for TEST-01..04 are **logically equivalent** to existing tests already in the `buildIsSessionAgentToolEnabled` nested block. The new block provides dedicated traceability labels in test output. This is explicitly required by D-01 and the specifics note in CONTEXT.md.

### Docs Edits — Exact Stale Locations (VERIFIED by reading the file)

**Part 1 — Schema table** (lines 40-45 in `docs/mcp-tool-filtering.md`):
- Add new row: `| \`default\` | \`boolean\` | No | Global enabled/disabled baseline for all unconfigured tools. Omitting this field preserves the default opt-out behaviour (all tools enabled). |`

**Part 2 — Filter chain, step 1** (line 178):
- Change `readSessionAgentToolsSettingsV1(settings)` → `readSessionAgentToolsSettings(settings)`

**Part 2 — Schema reader contract** (lines 188-193):
- Change heading/copy from `readSessionAgentToolsSettingsV1` → `readSessionAgentToolsSettings`
- Update the return type reference: `SessionAgentToolsSettingsV1` → `SessionAgentToolsSettings`

**Part 2 — Predicate logic** (lines 196-204):
- Replace the old single-expression formula with the 3-level lookup description
- Old formula: `(toolName) => settings.tools[toolName]?.enabled !== false`
- New formula and description: show the 3-level lookup (per-tool → global default → `true`), matching the current implementation

**Example E** — append after line 149 (end of Example D block), before the "### Error handling" section:
- Prose paragraph describing opt-in mode
- JSON snippet with `"default": false` and at least one `"enabled": true` tool override

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Test env isolation | Custom env backup/restore | `snapshotEnvValues` / `applyEnvValues` / `restoreEnvValues` from `@/testkit/env/envSnapshot` | Already in use; prevents test pollution |
| Module re-isolation | Global module state manipulation | `vi.resetModules()` + dynamic `import()` per `it` | Established pattern in this test file |

---

## Common Pitfalls

### Pitfall 1: Adding tests inside the existing `buildIsSessionAgentToolEnabled` block instead of a new top-level block

**What goes wrong:** D-01 requires a new **top-level** describe block — adding to the existing nested block violates the decision.
**Why it happens:** The existing block already covers the same scenarios — it feels redundant to add a top-level block.
**How to avoid:** The new block label `'3-level lookup (TEST-01..04)'` makes the requirement traceability explicit in test output. Place it at the same level as `describe('buildIsSessionAgentToolEnabled')`, not inside it.
**Warning signs:** If the new `describe` appears inside the existing `buildIsSessionAgentToolEnabled` block in the diff.

### Pitfall 2: Missing the `vi.resetModules()` inheritance — adding a redundant `beforeEach`

**What goes wrong:** Adding a nested `beforeEach` that re-calls `vi.resetModules()` is harmless but unnecessary. Not adding it at all is correct — the outer `beforeEach` already handles it.
**How to avoid:** The new `describe` block inherits the outer `beforeEach`/`afterEach`. Do not add a nested beforeEach.

### Pitfall 3: Editing only the function name in one location in Part 2

**What goes wrong:** The stale identifier `readSessionAgentToolsSettingsV1` appears in two places in Part 2: the filter chain description (step 1) and the schema reader contract section heading/body.
**How to avoid:** Search for `readSessionAgentToolsSettingsV1` across the entire doc and update all occurrences. [VERIFIED: it appears on lines 178 and 188-193 of `docs/mcp-tool-filtering.md`]

### Pitfall 4: Forgetting the `SessionAgentToolsSettingsV1` type reference in the schema reader contract

**What goes wrong:** Line 193 in `docs/mcp-tool-filtering.md` references `SessionAgentToolsSettingsV1 object` — this must be updated to `SessionAgentToolsSettings` to match the renamed type.
**How to avoid:** Update both the function name and the return type name in the reader contract section.

### Pitfall 5: Placing Example E inside the wrong section

**What goes wrong:** Inserting Example E inside Part 2 (Architecture) instead of Part 1 (User Guide).
**How to avoid:** Example E belongs in Part 1, after Example D (line 149), before "### Error handling" (line 151).

---

## Code Examples

### Current predicate implementation (VERIFIED: `apps/cli/src/settings/sessionAgentToolsSettings.ts`)

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

Lookup order: `perTool.enabled` → `settings.default` → `true`.

### Correct docs Part 2 predicate description

The old formula `(toolName) => settings.tools[toolName]?.enabled !== false` is a two-level expression that does not reflect the current implementation (which has three levels). The updated Part 2 should describe the predicate as a 3-level lookup and show the current source, not an older simplified expression.

### Example E JSON snippet (to add to docs)

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

This snippet disables all tools by default and allows only the three read-only session inspection tools. It is a copy-pasteable starting point for opt-in mode.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `(toolName) => settings.tools[toolName]?.enabled !== false` (2-level) | 3-level: per-tool → `settings.default` → `true` | Phase 4 (2026-04-22) | Part 2 docs predicate formula is now stale |
| `readSessionAgentToolsSettingsV1` | `readSessionAgentToolsSettings` | Phase 4 (2026-04-22) | Part 2 docs reader name reference is now stale |
| `SessionAgentToolsSettingsV1` type | `SessionAgentToolsSettings` | Phase 4 (2026-04-22) | Part 2 docs type name reference is now stale |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| — | — | — | — |

**All claims in this research were verified or cited — no user confirmation needed.**

---

## Open Questions

None. All deliverables are fully specified by CONTEXT.md decisions and the source files are fully readable.

---

## Environment Availability

Step 2.6: SKIPPED — this phase is code/docs-only changes with no new external dependencies.

Test runner already verified available:

| Dependency | Available | Version | Notes |
|------------|-----------|---------|-------|
| Vitest | ✓ | 3.2.4 | Verified by running `npx vitest run` in `apps/cli/` |
| Node.js | ✓ | 22.x | Present in workspace |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.4 |
| Config file | `apps/cli/vitest.config.ts` |
| Quick run command | `cd apps/cli && npx vitest run src/settings/sessionAgentToolsSettings.test.ts` |
| Full suite command | `cd apps/cli && npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEST-01 | Predicate returns `true` when `default` absent and tool absent | unit | `cd apps/cli && npx vitest run src/settings/sessionAgentToolsSettings.test.ts` | ✅ (new `it` in new `describe`) |
| TEST-02 | Predicate returns `false` when `default: false` and tool absent | unit | same | ✅ (new `it` in new `describe`) |
| TEST-03 | Per-tool `enabled: true` overrides `default: false` | unit | same | ✅ (new `it` in new `describe`) |
| TEST-04 | Per-tool `enabled: false` overrides `default: true` | unit | same | ✅ (new `it` in new `describe`) |
| DOCS-01 | `docs/mcp-tool-filtering.md` has `default: false` example | manual review | N/A | ❌ Wave 0 — add Example E |

### Sampling Rate

- **Per task commit:** `cd apps/cli && npx vitest run src/settings/sessionAgentToolsSettings.test.ts`
- **Per wave merge:** `cd apps/cli && npx vitest run src/settings/sessionAgentToolsSettings.test.ts`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] 4 new `it` blocks inside `describe('3-level lookup (TEST-01..04)')` — covers TEST-01..04
- [ ] Example E in `docs/mcp-tool-filtering.md` — covers DOCS-01

---

## Security Domain

This phase adds no authentication, session management, access control, cryptography, or input validation code. No ASVS categories apply. `security_enforcement` is not overridden — this phase is test + doc only.

---

## Sources

### Primary (HIGH confidence)

- `apps/cli/src/settings/sessionAgentToolsSettings.ts` — verified predicate implementation, function names, type names
- `apps/cli/src/settings/sessionAgentToolsSettings.test.ts` — verified existing test structure, established patterns, test count
- `docs/mcp-tool-filtering.md` — verified current stale content locations (lines 178, 188-193, 196-204) and Example D placement
- `apps/cli/vitest.config.ts` — verified test runner configuration, pool strategy, timeouts
- `cd apps/cli && npx vitest run src/settings/sessionAgentToolsSettings.test.ts` — verified 21/21 tests pass

### Secondary (MEDIUM confidence)

- `.planning/phases/05-tests-docs/05-CONTEXT.md` — locked decisions D-01..D-07
- `.planning/REQUIREMENTS.md` — requirement definitions TEST-01..04, DOCS-01
- `.planning/phases/04-schema-predicate/04-CONTEXT.md` — phase 4 decisions confirming rename scope

---

## Metadata

**Confidence breakdown:**
- Test authoring: HIGH — existing pattern is clear, all 4 scenarios directly derivable from requirements + predicate source
- Docs edits: HIGH — stale locations verified by reading the file; exact line ranges identified
- Pitfalls: HIGH — derived from reading actual code and docs

**Research date:** 2026-04-22
**Valid until:** Stable — test file and docs are not fast-moving; valid until next phase modifies either file
