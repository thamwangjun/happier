# Phase 5: Tests & Docs - Context

**Gathered:** 2026-04-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Verify all four predicate unit tests pass (TEST-01..04) by adding a new top-level describe block, and update `docs/mcp-tool-filtering.md` with the `default: false` opt-in example plus all stale Part 2 content.

</domain>

<decisions>
## Implementation Decisions

### Test Structure
- **D-01:** Add a **new top-level `describe` block** for the 3-level lookup scenarios — separate from the existing `buildIsSessionAgentToolEnabled` describe block. Do not add into the existing nested block.
- **D-02:** The new describe block must cover all four scenarios from REQUIREMENTS.md: TEST-01 (backward compat — no default key), TEST-02 (default:false disables unset tools), TEST-03 (per-tool enabled:true overrides default:false), TEST-04 (per-tool enabled:false overrides default:true).
- **D-03:** The existing tests in the `buildIsSessionAgentToolEnabled` describe block from Phase 4 already cover these scenarios. The new block is additive and must not delete or conflict with existing tests.

### Docs: Stale Content (Part 2)
- **D-04:** Fix **all stale content** in Part 2 of `docs/mcp-tool-filtering.md`:
  - Update the predicate formula from the old single-expression form to show the 3-level lookup (per-tool → global default → `true`).
  - Update the function name reference from `readSessionAgentToolsSettingsV1` to `readSessionAgentToolsSettings`.
  - Update the schema reader contract section to reflect the un-versioned identifier.
- **D-05:** Also update the schema table in Part 1 to include the `default` field (`boolean`, optional, description: global enabled/disabled baseline for all unconfigured tools).

### Docs: Opt-in Example (DOCS-01)
- **D-06:** Add as **Example E** — after the existing Example D (disable all tools) — keeping the progressive example structure.
- **D-07:** Format: short explanatory prose paragraph describing opt-in mode, followed by a copy-pasteable JSON snippet showing `default: false` with at least one per-tool `enabled: true` override.

### Claude's Discretion
- Exact prose wording for the Example E explanation paragraph.
- Whether to include `default: true` as a second snippet in Example E (explicit opt-out) — Claude may add it if it aids clarity without bloating the section.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — TEST-01 through TEST-04 and DOCS-01 define the acceptance criteria for this phase

### Roadmap
- `.planning/ROADMAP.md` §Phase 5 — Success criteria and linked requirements

### Existing Implementation
- `apps/cli/src/settings/sessionAgentToolsSettings.ts` — Source of truth for predicate logic and function names
- `apps/cli/src/settings/sessionAgentToolsSettings.test.ts` — Existing test file; new top-level describe block goes here

### Docs File to Update
- `docs/mcp-tool-filtering.md` — The file being updated; read in full before editing

### Prior Phase Context
- `.planning/phases/04-schema-predicate/04-CONTEXT.md` — D-03 (identifier rename), D-04 (opt-in framing language), D-05 (fallback is `true`)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `buildIsSessionAgentToolEnabled` in `sessionAgentToolsSettings.ts`: 3-level lookup already implemented — tests verify existing behavior
- `readSessionAgentToolsSettings` (un-versioned, renamed in Phase 4): this is the correct name to use in docs Part 2

### Established Patterns
- Test file uses `vi.resetModules()` + dynamic `import()` inside each `it` block — new tests must follow the same pattern
- `describe` blocks at top level in the test file are thematically grouped (e.g., `buildIsSessionAgentToolEnabled`, `findUnknownSessionAgentToolNames`)

### Integration Points
- No new source files modified — test file and docs file only

</code_context>

<specifics>
## Specific Ideas

- The existing Phase 4 tests for the 3-level lookup are inside the `buildIsSessionAgentToolEnabled` describe block. The new Phase 5 describe block should be clearly labelled (e.g., `'3-level lookup (TEST-01..04)'`) so requirements traceability is visible in test output.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 05-tests-docs*
*Context gathered: 2026-04-22*
