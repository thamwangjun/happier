# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MCP Tool Configuration

**Shipped:** 2026-04-19
**Phases:** 3 | **Plans:** 5 | **Timeline:** 2 days (2026-04-18 → 2026-04-19)

### What Was Built

- `sessionAgentToolsSettingsV1` Zod schema: per-tool enable/disable in `~/.happier-dev/settings.json` with opt-out model and no-throw reader
- Startup wiring: predicate built once at `startHappyServer`, threaded through `createHappierMcpServer` → `registerHappierMcpBuiltInTools`
- Integration test suite: `listTools` filtering, absent-key fallback, corrupt-config fallback, unknown-name no-crash
- Validation feedback: `findUnknownSessionAgentToolNames` pure function with `logger.warn` at daemon startup

### What Worked

- **Opt-out model decision made upfront** — choosing "absent = enabled" early meant zero backward-compat work and no migration path needed
- **Pure functions with call-site IO** — `readSessionAgentToolsSettingsV1` and `findUnknownSessionAgentToolNames` both return data; callers own the logger. This made unit testing clean without logger mocking
- **Integration tests alongside unit tests** — `startHappyServer.integration.test.ts` caught real wiring issues that unit tests couldn't see
- **Phase 2.01 rename sweep before wiring** — doing the rename as its own plan meant the threading plan had no naming debt to untangle

### What Was Inefficient

- **REQUIREMENTS.md traceability not updated during execution** — the status column stayed "Pending" throughout; PROJECT.md was kept up-to-date but REQUIREMENTS.md was not. Resolve by updating traceability at each plan completion.
- **ROADMAP.md progress table not updated during execution** — "Not started" persisted for all phases; only SUMMARY.md files and PROJECT.md reflected truth. Either auto-update or explicitly update at each phase completion.
- **`audit-open` CLI bug** — `gsd-tools.cjs` threw `ReferenceError: output is not defined` during milestone close; had to perform open-artifact audit manually.

### Patterns Established

- **Pure validation function + call-site IO** — separation of validation logic from IO enables clean unit tests; `logger.warn` belongs at the call site, not inside the validation function
- **Rename sweep as its own plan** — when a key name changes mid-milestone, isolate the rename into a dedicated plan before threading the new name through; avoids mixed naming in diffs
- **Opt-out tool model** — absent config key = tool enabled; only `enabled: false` disables; this is the correct pattern for all future tool configuration features

### Key Lessons

1. Keep REQUIREMENTS.md traceability and ROADMAP.md progress table in sync during execution — don't rely on PROJECT.md alone to track status
2. Run `audit-open` early in milestone close; if it fails, fix the CLI before proceeding rather than doing the audit manually
3. Integration tests on `startHappyServer` are high-value: they verify the full wiring chain that unit tests can't reach

### Cost Observations

- Sessions: ~4 sessions across 2 days
- Commits: 63 total (49 docs/chore, 14 feat/fix/test)
- Notable: high doc-to-code ratio typical of GSD workflow; actual feature code was ~634 LOC across 9 files

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 3 | 5 | First milestone on this fork; established settings schema + startup wiring patterns |

### Cumulative Quality

| Milestone | Tests Added | Key Coverage |
|-----------|-------------|--------------|
| v1.0 | ~16 (unit + integration) | `sessionAgentToolsSettings.ts`, `startHappyServer` tool filtering |

### Top Lessons (Verified Across Milestones)

1. Keep traceability artifacts (REQUIREMENTS.md, ROADMAP.md) in sync during execution, not just at milestone close
2. Pure functions + call-site IO is the right separation for validation + logging patterns
