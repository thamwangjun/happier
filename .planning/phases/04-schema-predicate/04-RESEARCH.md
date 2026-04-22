# Phase 4: Schema & Predicate - Research

**Researched:** 2026-04-22
**Domain:** Zod schema extension + predicate logic in CLI settings module
**Confidence:** HIGH

---

## Summary

Phase 4 is a surgically small change to a single TypeScript file: `apps/cli/src/settings/sessionAgentToolsSettings.ts`. The existing v1.0 implementation is clean, well-tested, and structured in a way that makes the `default` field addition straightforward. The file exports three things: a Zod schema (`SessionAgentToolsSettingsV1Schema`), a reader (`readSessionAgentToolsSettingsV1`), and a predicate builder (`buildIsSessionAgentToolEnabled`). Only the schema and predicate builder require edits. The reader already handles corrupt/missing values via `safeParse` — no changes needed there.

The predicate currently implements the rule `settings.tools[toolName]?.enabled !== false`, which returns `true` for absent tools (opt-out model). Adding `default` support means changing the fallback from the hardcoded `true` to `settings.default ?? true`. This is a one-expression change. The `DEFAULT_SESSION_AGENT_TOOLS_SETTINGS` constant also needs `default: undefined` (or the field omitted) to preserve backward-compat behavior.

There is exactly one call site for `buildIsSessionAgentToolEnabled` in the codebase: `apps/cli/src/mcp/startHappyServer.ts`. No changes are needed there — it already passes the entire `SessionAgentToolsSettingsV1` object and the predicate signature `(toolName: string) => boolean` does not change.

**Primary recommendation:** Extend the Zod schema with `default: z.boolean().optional()`, update the predicate to use `settings.default ?? true` as fallback, and update `DEFAULT_SESSION_AGENT_TOOLS_SETTINGS` to include `default: undefined`. Three targeted edits, one file.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Schema definition (`default` field) | CLI / local settings | — | Settings are CLI-local; parsed at daemon startup; server never sees this data |
| Predicate lookup order (per-tool → default → true) | CLI / local settings | — | Predicate is built once at startup in `startHappyServer.ts` and passed into the MCP server |
| No-throw safety on corrupt `default` | CLI / local settings | — | `safeParse` in `readSessionAgentToolsSettingsV1` already handles this; Zod `.optional()` makes non-boolean values fail at the field level, caught by `safeParse` |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Zod | 4.3.6 [VERIFIED: apps/cli/package.json] | Schema validation and type inference | Already the project-wide schema library; `import * as z from 'zod'` used in this file |
| TypeScript | 5.9.3 [VERIFIED: CLAUDE.md] | Type system | Strict mode; all inferred types flow from Zod schema |

### Supporting
No additional libraries needed. This is a pure in-process change.

**Installation:** No new dependencies.

---

## Architecture Patterns

### System Architecture Diagram

```
settings.json (disk)
        |
        v
readSettings() [persistence.ts]
        |
        v
readSessionAgentToolsSettingsV1(settings)   [sessionAgentToolsSettings.ts]
        |  safeParse(SessionAgentToolsSettingsV1Schema)
        |  → on fail: logger.warn + return DEFAULT
        |  → on success: return parsed
        v
SessionAgentToolsSettingsV1 { v, tools, default? }
        |
        v
buildIsSessionAgentToolEnabled(settings)   [sessionAgentToolsSettings.ts]
        |  returns: (toolName) => tools[toolName]?.enabled ?? default ?? true
        v
isSessionAgentToolEnabled predicate
        |
        v
startHappyServer.ts → passes predicate to createHappierMcpServer
        |
        v
MCP tool list filtered at request time (per D-06: snapshot at startup)
```

### Recommended Project Structure

No new files or folders. All changes are confined to:
```
apps/cli/src/settings/
├── sessionAgentToolsSettings.ts   ← schema + predicate edit (primary)
└── sessionAgentToolsSettings.test.ts  ← new predicate tests (Phase 5, not this phase)
```

### Pattern 1: Zod optional field with `.optional()`

**What:** Add an optional boolean field to an existing Zod object schema.
**When to use:** Any schema field that is optional and has no default — absence is meaningful (distinguished from `false`).
**Example:**
```typescript
// Source: [VERIFIED: apps/cli/src/backends/claude/types.ts — z.boolean().optional() pattern]
// The project already uses this exact pattern in claude/types.ts:
//   isSidechain: z.boolean().optional(),
//   isMeta: z.boolean().optional(),

// Applied to sessionAgentToolsSettings.ts:
export const SessionAgentToolsSettingsV1Schema = z.preprocess(
    (raw) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
        return raw;
    },
    z.object({
        v: z.literal(1).default(1 as const),
        tools: z.record(z.string(), z.object({ enabled: z.boolean() })).default({}),
        default: z.boolean().optional(),   // NEW: absent = use existing opt-out model
    }),
);
```

**Why `.optional()` and not `.default(true)`:** Using `.default(true)` would bake `true` into parsed objects even when the user did not set the field. This would prevent distinguishing "user set `default: true`" from "user omitted `default`". The lookup order (per-tool → default → true) must be expressible in code; storing an explicit `true` default in the object conflates "absent" with "explicitly true". [VERIFIED: codebase intent from STATE.md decision "Lookup order is per-tool entry → default → true (backward compatible)"]

### Pattern 2: Predicate fallback chain

**What:** Update `buildIsSessionAgentToolEnabled` to implement the three-level lookup.
**When to use:** Any time per-entity config has a global fallback that itself has a fallback.
**Example:**
```typescript
// Source: VERIFIED by reading current implementation at sessionAgentToolsSettings.ts:60
// Current:
return (toolName: string) => settings.tools[toolName]?.enabled !== false;

// Updated (v1.1):
return (toolName: string) => {
    const perTool = settings.tools[toolName];
    if (perTool !== undefined) {
        return perTool.enabled;
    }
    return settings.default ?? true;
};
```

**Why restructure from the one-liner:** The current one-liner `settings.tools[toolName]?.enabled !== false` works because "absent" and "enabled:true" both evaluate to `true`. With a `default` field, "absent tool + default:false" must evaluate to `false`, which the old one-liner cannot express without adding an additional condition. The restructured form is clearer, exhaustive, and directly maps the spec.

**Alternative one-liner (also valid):**
```typescript
return (toolName: string) =>
    settings.tools[toolName] !== undefined
        ? settings.tools[toolName]!.enabled
        : (settings.default ?? true);
```
Both forms are equivalent. Choose the one that matches team style (the existing code prefers concision).

### Pattern 3: DEFAULT_SESSION_AGENT_TOOLS_SETTINGS update

**What:** The exported constant must include `default: undefined` (or just omit the field, since the type is `default?: boolean`).
**Example:**
```typescript
// Current:
export const DEFAULT_SESSION_AGENT_TOOLS_SETTINGS: SessionAgentToolsSettingsV1 = { v: 1, tools: {} };

// Updated — no behavioral change, field is optional:
export const DEFAULT_SESSION_AGENT_TOOLS_SETTINGS: SessionAgentToolsSettingsV1 = { v: 1, tools: {} };
// ^ No change required IF the inferred type includes `default?: boolean`.
// The constant is structurally compatible because `default` is optional.
// Only update if the type checker complains — it should not.
```

**Conclusion:** `DEFAULT_SESSION_AGENT_TOOLS_SETTINGS` does not need to change. TypeScript will accept the object as `SessionAgentToolsSettingsV1` because `default` is optional. [VERIFIED: TypeScript structural subtyping rules — an object without an optional field satisfies the type]

### Anti-Patterns to Avoid

- **Using `.default(true)` on the `default` field:** Makes "absent" and "true" indistinguishable at the predicate layer. The lookup order requires distinguishing absence.
- **Adding `default` to `DEFAULT_SESSION_AGENT_TOOLS_SETTINGS` unnecessarily:** The constant is used by the no-throw reader's fallback path and by tests as a baseline. Keeping it as `{ v: 1, tools: {} }` preserves clarity that the default state has no opinion on the global default.
- **Changing the reader function (`readSessionAgentToolsSettingsV1`):** The reader uses `safeParse` and already handles unknown/corrupt values gracefully. The new `default` field is optional — Zod's `safeParse` will accept its absence and ignore non-boolean values by failing validation (returning `DEFAULT_SESSION_AGENT_TOOLS_SETTINGS`). No reader changes needed.
- **Changing the call site in `startHappyServer.ts`:** The predicate signature `(toolName: string) => boolean` does not change. The caller does not need to know about `default`.

---

## Solved Problems

| Problem | Build Nothing — Use Instead | Why |
|---------|-----------------------------|-----|
| Runtime schema validation with TypeScript type inference | Zod (already in use) | `z.infer<typeof Schema>` produces the TypeScript type; no separate interface needed |
| Optional field that distinguishes absent from false | `z.boolean().optional()` | Already established pattern in codebase; produces `boolean \| undefined` type |
| Corruption safety | Existing `safeParse` in reader | Already handles any Zod parse failure by returning `DEFAULT_SESSION_AGENT_TOOLS_SETTINGS` |

---

## Common Pitfalls

### Pitfall 1: `?? false` instead of `?? true` in predicate fallback

**What goes wrong:** Writing `settings.default ?? false` as the fallback makes "absent default" disable all tools, breaking backward compatibility.
**Root cause:** Confusing the fallback value with the `default: false` case.
**Prevention:** Always use `settings.default ?? true`. The `true` is the backward-compat default (opt-out model). Only `default: false` explicitly set by the user enables opt-in mode.
**Warning signs:** TEST-01 (`predicate returns true when default absent`) would fail.

### Pitfall 2: Treating `settings.tools[toolName]?.enabled !== false` as the full expression

**What goes wrong:** Keeping the current one-liner unchanged and appending `?? settings.default` without restructuring fails for the `default: false` + tool present case.
**Root cause:** The one-liner short-circuits: `settings.tools[toolName]?.enabled !== false` returns `true` for absent tools regardless of `settings.default`.
**Prevention:** Restructure to explicitly check `tools[toolName] !== undefined` before consulting `settings.default`.
**Warning signs:** TEST-02 would pass but TEST-03/04 might have edge-case failures if implemented carelessly.

### Pitfall 3: Forgetting `z.preprocess` strips unknown object keys

**What goes wrong:** Assuming `z.preprocess` will reject unknown keys. In fact, Zod's `z.object()` by default strips unrecognized keys (`.strip()` mode). The `future_key: true` test confirms this.
**Root cause:** Confusion about Zod's default behavior.
**Prevention:** The new `default` field is recognized by the schema — no issue. Existing tests cover forward-compat (unknown keys are stripped, not errored).
**Warning signs:** No warning sign — this is a non-issue, documenting for completeness.

### Pitfall 4: Zod 4 API differences

**What goes wrong:** Using Zod v3 API patterns that changed in v4. The project uses Zod 4.3.6.
**Root cause:** Training data mixing Zod v3 and v4 patterns.
**Prevention:** [VERIFIED: current file uses `import * as z from 'zod'` and `z.boolean().optional()` is already used in `apps/cli/src/backends/claude/types.ts` under Zod 4.3.6 — the API is identical for this use case]
**Warning signs:** TypeScript errors on the schema if API is wrong.

---

## Code Examples

### Full updated schema (verified diff)

```typescript
// Source: VERIFIED by reading apps/cli/src/settings/sessionAgentToolsSettings.ts

// BEFORE (current v1.0):
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

// AFTER (v1.1):
export const SessionAgentToolsSettingsV1Schema = z.preprocess(
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

export type SessionAgentToolsSettingsV1 = z.infer<typeof SessionAgentToolsSettingsV1Schema>;
// Type becomes: { v: 1; tools: Record<string, { enabled: boolean }>; default?: boolean }
```

### Full updated predicate (verified diff)

```typescript
// Source: VERIFIED by reading apps/cli/src/settings/sessionAgentToolsSettings.ts

// BEFORE (current v1.0):
export function buildIsSessionAgentToolEnabled(
    settings: SessionAgentToolsSettingsV1,
): (toolName: string) => boolean {
    return (toolName: string) => settings.tools[toolName]?.enabled !== false;
}

// AFTER (v1.1):
export function buildIsSessionAgentToolEnabled(
    settings: SessionAgentToolsSettingsV1,
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

### JSDoc update for predicate

```typescript
/**
 * Builds the isSessionAgentToolEnabled predicate from a parsed settings blob.
 *
 * Lookup order: per-tool entry → global default → true (opt-out model).
 * - Per-tool entry present: returns entry.enabled (true or false).
 * - Per-tool entry absent, default set: returns settings.default.
 * - Per-tool entry absent, default unset: returns true (backward-compatible opt-out).
 * Never throws.
 */
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hard-coded `true` fallback | `settings.default ?? true` fallback | v1.1 (this phase) | Enables opt-in mode without breaking existing users |

**No deprecated items.** The v1.0 pattern is not deprecated — v1.1 is an additive extension.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `DEFAULT_SESSION_AGENT_TOOLS_SETTINGS` does not need to change — TypeScript accepts the existing `{ v: 1, tools: {} }` as compatible with the updated type that adds `default?: boolean` | Code Examples | Low: if wrong, add `default: undefined` to the constant; trivial fix |
| A2 | The `z.preprocess` coercion (null/non-object → `{}`) does not interfere with the new `default` field — a null/array input still normalizes to `{}` which has no `default`, and Zod `.optional()` produces `undefined` | Standard Stack | Low: Zod's `.optional()` is well-understood; the preprocess coercion is already tested |

**All other claims are verified from the codebase or from documented project decisions.**

---

## Open Questions

1. **JSDoc comment on the predicate**
   - What we know: the current JSDoc says "Returns true for any tool absent from the tools map (opt-out model, SCHEMA-02)"
   - What is unclear: whether to update it to describe the three-level lookup or leave it as-is
   - Recommendation: Update the JSDoc to describe the new lookup order — the planner should include this as part of the task

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — this is a code-only change within the CLI package).

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x [VERIFIED: apps/cli/package.json `"vitest": "^3.2.4"`] |
| Config file | `apps/cli/vitest.config.ts` |
| Quick run command | `cd apps/cli && yarn test:unit --reporter=verbose src/settings/sessionAgentToolsSettings.test.ts` |
| Full suite command | `cd apps/cli && yarn test:unit` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCHEMA-01 | Schema accepts `default: true` and parses correctly | unit | `cd apps/cli && yarn test:unit src/settings/sessionAgentToolsSettings.test.ts` | yes (extend existing test file) |
| SCHEMA-02 | Schema accepts `default: false` and parses correctly | unit | same | yes |
| SCHEMA-03 | Schema with absent `default` produces `default: undefined`; predicate returns `true` for unconfigured tools | unit | same | yes |
| SCHEMA-04 | Per-tool `enabled: true` overrides `default: false`; per-tool `enabled: false` overrides `default: true` | unit | same | yes |
| VALID-01 | Non-boolean `default` (e.g., `"bad"`, `null`, `42`) causes `safeParse` to fail → returns `DEFAULT_SESSION_AGENT_TOOLS_SETTINGS`; no throw | unit | same | yes |

**Note:** TEST-01 through TEST-04 (listed in REQUIREMENTS.md) are formally scoped to Phase 5. Phase 4 only needs to pass the implementation — however, adding the four predicate tests to `sessionAgentToolsSettings.test.ts` at the same time as the implementation is the most efficient approach (one PR). The planner should decide whether to include Phase 5 tests in Phase 4 tasks or keep them separate per the roadmap split.

### Sampling Rate
- **Per task commit:** `cd apps/cli && yarn test:unit src/settings/sessionAgentToolsSettings.test.ts`
- **Per wave merge:** `cd apps/cli && yarn test:unit`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
None — `sessionAgentToolsSettings.test.ts` already exists and the Vitest infrastructure is fully configured.

---

## Security Domain

Phase 4 adds an optional boolean to a CLI-local settings schema. No network transmission, no authentication changes, no cryptographic operations, no user input paths. ASVS categories do not apply to this change.

| ASVS Category | Applies | Rationale |
|---------------|---------|-----------|
| V2 Authentication | no | No auth changes |
| V3 Session Management | no | No session changes |
| V4 Access Control | no | Setting is purely local; already read from the user's own settings file |
| V5 Input Validation | yes (trivially) | Zod `safeParse` already handles malformed input; `.optional()` extension maintains this |
| V6 Cryptography | no | No crypto |

**V5 note:** The existing `safeParse` + warn + default pattern already satisfies input validation for this surface. The new `default` field is handled identically to other fields — invalid values cause parse failure, which returns the safe default.

---

## Sources

### Primary (HIGH confidence)
- [VERIFIED: codebase] `apps/cli/src/settings/sessionAgentToolsSettings.ts` — full source read; exact line positions confirmed
- [VERIFIED: codebase] `apps/cli/src/settings/sessionAgentToolsSettings.test.ts` — full test read; existing test patterns confirmed
- [VERIFIED: codebase] `apps/cli/src/mcp/startHappyServer.ts` — confirmed single call site for `buildIsSessionAgentToolEnabled`
- [VERIFIED: codebase] `apps/cli/src/backends/claude/types.ts` — confirmed `z.boolean().optional()` pattern in use under Zod 4.3.6
- [VERIFIED: codebase] `apps/cli/src/persistence.ts` — confirmed `sessionAgentToolsSettingsV1?: unknown` field in `Settings` interface
- [VERIFIED: apps/cli/package.json] Zod 4.3.6, Vitest ^3.2.4
- [VERIFIED: .planning/STATE.md] Decision: "Lookup order is per-tool entry → default → true (backward compatible)"

### Secondary (MEDIUM confidence)
- [CITED: CLAUDE.md] TypeScript strict mode, 4-space indent, named exports, no classes, functional patterns

### Flagged for Validation (LOW confidence)
None.

---

## Phase Requirements

<phase_requirements>

| ID | Description | Research Support |
|----|-------------|-----------------|
| SCHEMA-01 | User can set `default: true` in `sessionAgentToolsSettingsV1` to explicitly enable all tools globally | Add `default: z.boolean().optional()` to schema; predicate returns `settings.default ?? true` = `true` |
| SCHEMA-02 | User can set `default: false` in `sessionAgentToolsSettingsV1` to disable all tools by default, enabling opt-in mode | Same schema change; predicate returns `settings.default ?? true` = `false` when `default: false` and tool absent |
| SCHEMA-03 | When `default` is absent, behavior is identical to existing opt-out model | Predicate fallback `settings.default ?? true` = `true` when `default` is `undefined`; `DEFAULT_SESSION_AGENT_TOOLS_SETTINGS` unchanged |
| SCHEMA-04 | Per-tool entry always overrides the global `default` regardless of direction | Predicate checks `tools[toolName] !== undefined` first; if present, returns `perTool.enabled` directly, bypassing `settings.default` |
| VALID-01 | No-throw reader handles the new `default` field gracefully without crashing on corrupt or missing values | `z.boolean().optional()` in schema ensures non-boolean `default` values cause `safeParse` failure → reader returns `DEFAULT_SESSION_AGENT_TOOLS_SETTINGS` with `logger.warn`; no throw |

</phase_requirements>

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Zod version verified in package.json; pattern verified in codebase
- Architecture: HIGH — all files read directly; single call site confirmed
- Pitfalls: HIGH — derived from direct code analysis; fallback arithmetic verified manually
- Predicate logic: HIGH — three-level lookup confirmed from STATE.md decision + implementation analysis

**Research date:** 2026-04-22
**Valid until:** 2026-05-22 (stable library; no fast-moving ecosystem concerns)
