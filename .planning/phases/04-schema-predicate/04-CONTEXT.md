# Phase 4: Schema & Predicate - Context

**Gathered:** 2026-04-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend `sessionAgentToolsSettingsV1` schema with `default?: boolean` and update `buildIsSessionAgentToolEnabled` to implement a 3-level lookup (per-tool → global default → `true`). Also rename the V1 code identifiers to remove the version suffix throughout the codebase.

</domain>

<decisions>
## Implementation Decisions

### Field Name
- **D-01:** The new schema field is named `default` (not `toolDefault` or `fallbackEnabled`). It matches the literal key users write in `settings.json` and keeps the type ergonomic.

### Schema Version
- **D-02:** Keep `v: z.literal(1)` — do not bump to v: 2. The `default` field is optional; its absence preserves existing behavior (SCHEMA-03). No migration needed.

### Identifier Rename
- **D-03:** Rename all TypeScript code identifiers from the `V1` suffix variant to the un-versioned form:
  - `SessionAgentToolsSettingsV1Schema` → `SessionAgentToolsSettingsSchema`
  - `SessionAgentToolsSettingsV1` (type) → `SessionAgentToolsSettings`
  - `readSessionAgentToolsSettingsV1` → `readSessionAgentToolsSettings`
  - All downstream import sites must be updated to use the new names.
  - ~~The settings.json JSON key (`sessionAgentToolsSettingsV1`) is **not** renamed — it is a user-visible config key and renaming it would break existing configs.~~ **Superseded by D-06.**

- **D-06 (2026-05-01, supersedes D-03 JSON key exception):** The settings.json JSON key is renamed from `sessionAgentToolsSettingsV1` to `sessionAgentToolsSettings`. The V1 suffix is permanently stripped from all surfaces — TypeScript identifiers, JSON keys, comments, and test data. No migration shim is provided; old configs with `sessionAgentToolsSettingsV1` silently fall through to the permissive default (all tools enabled). Users must update their `~/.happier/settings.json` manually.

### JSDoc / Comment Framing
- **D-04:** Frame `default: false` mode as "opt-in mode" in JSDoc and inline comments, consistent with the existing "opt-out model" language already present in the file.

### Predicate Fallback
- **D-05 (from requirements):** Fallback when `default` is absent is `true`, not `false`. `settings.default ?? true` is the correct expression. This preserves backward compatibility (SCHEMA-03).

### Claude's Discretion
- Test placement: add new tests inside the existing describe blocks in `sessionAgentToolsSettings.test.ts`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — SCHEMA-01 through SCHEMA-04 and VALID-01 define the acceptance criteria for this phase

### Roadmap
- `.planning/ROADMAP.md` §Phase 4 — Success criteria and linked requirements

### Existing Implementation
- `apps/cli/src/settings/sessionAgentToolsSettings.ts` — The file being modified; read in full before touching anything
- `apps/cli/src/settings/sessionAgentToolsSettings.test.ts` — Existing tests; all must continue to pass after changes

### Prior Plan (created before context — may need revision)
- `.planning/phases/04-schema-predicate/04-01-PLAN.md` — Review against D-03 (identifier rename) which was not in the original plan

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SessionAgentToolsSettingsV1Schema`: `z.preprocess` wrapper guards against non-object input; same guard applies after the schema change
- `readSessionAgentToolsSettingsV1`: already uses `safeParse` + `logger.warn` + fallback — the `default` field adds no new parse path; VALID-01 is covered by existing infrastructure

### Established Patterns
- Zod `z.boolean().optional()` for optional boolean fields (no `.default()` on the field — absence must remain distinguishable from explicit `true`)
- `?? true` null-coalescing fallback in predicate (not `?? false`)
- 4-space indentation throughout

### Integration Points
- `startHappyServer.ts` calls `buildIsSessionAgentToolEnabled` and imports `readSessionAgentToolsSettingsV1` — both import sites need updating to the renamed identifiers
- `findUnknownSessionAgentToolNames` is also exported from the same file — its signature is unchanged

</code_context>

<specifics>
## Specific Ideas

- User explicitly wants the identifier rename (V1 suffix removal) as part of this phase, not deferred to a cleanup phase.
- The settings.json JSON key `sessionAgentToolsSettingsV1` must be preserved to avoid breaking existing user configs.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 04-schema-predicate*
*Context gathered: 2026-04-22*
