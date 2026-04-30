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

## Milestone: v1.1 — Distinguish Parent vs Subagent Turn Completion

**Shipped:** 2026-04-20
**Phases:** 2 | **Plans:** 3 | **Timeline:** 2 days (2026-04-19 → 2026-04-20)

### What Was Built

- `finalizeSubagentTurn()` closure in `claudeRemoteAgentSdk.ts`: Phase A bookkeeping only (no ready notification)
- `finalizeCurrentTurn()` retained for parent path with full Phase A + Phase B logic
- `onSubagentFlush?` optional callback added to opts type; wired in `claudeRemoteLauncher.ts`
- 4 subagent turn completion tests (TEST-01–03b) + 2 TURN-06 baseline/multi-subagent tests — all GREEN
- VERIFICATION.md with SC-1 code inspection evidence at exact source lines

### What Worked

- **TDD RED→GREEN** — writing 3 failing tests before implementation locked the behavioral contract and caught the double-flush bug (TEST-03a) before code was written; saved a debugging cycle
- **Two-function split over flag argument** — eliminating `isSubagent: boolean` in favor of `finalizeSubagentTurn()` produced cleaner call sites with no conditional logic at the point of use
- **Parameterised test factory `makeBaselineQuery(taskCount, includeResult)`** — a single factory covered both TURN-06 baseline (taskCount=0) and multi-subagent (taskCount=2) scenarios without duplicating loop logic
- **VERIFICATION.md with exact line citations** — reading `claudeRemoteAgentSdk.ts` before writing the verification doc and citing exact line numbers (1554–1561) gave high-confidence SC-1 evidence

### What Was Inefficient

- **REQUIREMENTS.md checkboxes not updated during execution** — same issue as v1.0; traceability table was updated but raw `[ ]` checkboxes were not ticked off at plan completion. Reconciled at milestone close.
- **ROADMAP.md progress table stayed "Not started"** — carried over from v1.0; same fix needed: update at phase completion, not just milestone close.
- **Worktree path confusion in Phase 5** — the Write tool wrote to the main repo path instead of the active worktree; required manual copy + removal before commit. Worktree discipline needs to be explicitly verified before each Write in worktree sessions.

### Patterns Established

- **Two-function split for behavioral branching** — prefer `functionA()` / `functionB()` over `function(flag: boolean)` when branches share a prefix but diverge at a clear boundary; eliminates flag argument anti-pattern and makes call sites self-documenting
- **`didFlushTranscriptCleanly` guard for conditional flush suppression** — when a clean-path flush must prevent a redundant safety-flush, use a boolean flag set by the clean path rather than restructuring the control flow
- **TDD RED phase as spec validation** — running tests in RED before implementation confirms the test contract is correct and that the production bug is exercised; don't skip RED even on small refactors

### Key Lessons

1. Tick off REQUIREMENTS.md checkboxes at each plan completion — do not defer to milestone close (second time this has been an issue)
2. Update ROADMAP.md progress table status at phase completion, not only at milestone close
3. In worktree sessions, verify the active path before Write/Edit to avoid writing to the main repo accidentally

### Cost Observations

- Sessions: ~3 sessions across 2 days
- Commits: 31 (v1.1 range)
- Notable: small milestone (2 phases, 3 plans) executed in ~36 min total plan time; TDD RED phase added ~5 min but prevented a regression

---

## Milestone: v1.1 — Session Agent Tools — Global Default

**Shipped:** 2026-04-22
**Phases:** 2 (4-5) | **Plans:** 2 | **Timeline:** 1 day (2026-04-22)

### What Was Built

- `default?: boolean` field in `SessionAgentToolsSettingsSchema` using `z.boolean().optional()` — absence distinguishable from explicit `false`
- 3-level predicate lookup in `buildIsSessionAgentToolEnabled`: per-tool entry → `settings.default` → `true` fallback
- Renamed all V1-suffixed TypeScript identifiers (JSON key `sessionAgentToolsSettingsV1` preserved for backward compat)
- `describe('3-level lookup (TEST-01..04)')` block: 4 requirement-labeled tests; total suite 26 passing
- `docs/mcp-tool-filtering.md`: schema table `default` row, Example E opt-in mode config, full 3-level predicate implementation, and corrected V1 identifier references throughout Part 2.

### What Worked

- **`z.boolean().optional()` without `.default()`** — correct upfront; absence-distinguishability is exactly what the predicate needs
- **Sibling describe block for TEST-01..04** — explicit requirement-ID traceability without restructuring 21 existing tests
- **Nyquist validation pass** — caught IN-01..03 (dead test scaffolding, duplicate describe block, missing staleness note)
- **Small focused scope** — 2 phases, 2 plans, 1 day; near-zero deviation from plan

### What Was Inefficient

- **Worktree node_modules symlink issue (repeated from v1.0)** — executor worktree lacked `node_modules`; requires manual symlinks before tests run. Should be automated or documented as a prerequisite.
- **HUMAN-UAT.md left with open items at milestone start** — required extra resolution step before archiving.

### Patterns Established

- **`z.boolean().optional()` for 3-state config fields** — use optional without `.default()` when "unset / true / false" semantics are needed; `.default()` collapses absence
- **`?? true` fallback in opt-out predicates** — null-coalescing to `true` is the idiomatic opt-out pattern
- **Requirement-labeled test blocks** — `describe('3-level lookup (TEST-01..04)')` creates direct spec-to-test traceability

### Key Lessons

1. Worktree executor lacks `node_modules` — symlink fix should be automated or in CLAUDE.md
2. Nyquist validation is proportionally more valuable on small-scope changes; always run it
3. Requirement-labeled describe blocks are low overhead and high traceability value

### Cost Observations

- Sessions: ~3 sessions
- Commits: ~25 total
- Notable: 32 files changed but only 2 source files; planning artifacts dominate changeset

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 3 | 5 | First milestone on this fork; established settings schema + startup wiring patterns |
| v1.1 (turn completion) | 2 | 3 | TDD RED→GREEN introduced; two-function split over flag argument established as pattern |
| v1.1 (global default) | 2 | 2 | Incremental feature; validated Nyquist + requirement-labeled test patterns |

### Cumulative Quality

| Milestone | Tests Added | Key Coverage |
|-----------|-------------|--------------|
| v1.0 | ~16 (unit + integration) | `sessionAgentToolsSettings.ts`, `startHappyServer` tool filtering |
| v1.1 (turn completion) | 6 (unit, TDD) | `claudeRemoteAgentSdk` subagent/parent turn completion paths, TURN-06 baseline + multi-subagent |
| v1.1 (global default) | +10 (4 new 3-level lookup + 6 schema tests, Nyquist) | 3-level predicate, `default` field, backward compat |

### Top Lessons (Verified Across Milestones)

1. Keep traceability artifacts (REQUIREMENTS.md, ROADMAP.md) in sync during execution, not just at milestone close — confirmed across v1.0 and v1.1
2. Pure functions + call-site IO is the right separation for validation + logging patterns
3. TDD RED phase is worth the 5 min overhead — behavioral contract locked before implementation prevents regressions and scope creep
4. Worktree executor reliably lacks `node_modules` — symlink workaround needed for CLI test runs; automate or document
5. Nyquist validation catches real issues even for small scopes; always run it
