# Phase 3: Validation Feedback - Research

**Researched:** 2026-04-19
**Domain:** TypeScript/Vitest — settings module extension, warn-level startup logging
**Confidence:** HIGH

## Summary

Phase 3 adds a single exported function `findUnknownSessionAgentToolNames` to `apps/cli/src/settings/sessionAgentToolsSettings.ts` and a call site in `apps/cli/src/mcp/startHappyServer.ts`. The function compares the keys of `settings.tools` against a caller-supplied `knownNames: string[]` and returns the unknown subset. The caller emits a `logger.warn` when the result is non-empty.

All user decisions are locked (D-01 through D-03 from 03-CONTEXT.md). The only discretionary choices are (1) whether the function emits the warn itself or returns names for the caller to log, and (2) the exact warn message wording. Both are explicitly marked "Claude's Discretion" in CONTEXT.md.

This is a pure addition — no existing logic is changed. The Phase 2 codebase is fully wired and the insertion point in `startHappyServer.ts` is already identified. The test infrastructure (`sessionAgentToolsSettings.test.ts`, `startHappyServer.integration.test.ts`) exists and follows a clear pattern that Phase 3 tests must match.

**Primary recommendation:** Implement `findUnknownSessionAgentToolNames(settings, knownNames)` as a pure function that returns `string[]`; emit the warn in `startHappyServer.ts` at the call site. This keeps the settings module free of side effects, makes the function easy to unit-test without a `logger` mock, and places all IO decisions in the caller — consistent with how `buildIsSessionAgentToolEnabled` works today.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Two log levels, two moments:
  - At startup (config load time): `logger.warn` — fires once per daemon start, visible in the daemon log file. Satisfies VALID-01.
  - At processing time (filtering per tool invocation): `logger.debug` — silent in default log setups. Satisfies TOOLS-02.
  - The startup warn is the primary deliverable of Phase 3. The processing-time debug path is secondary and may be deferred.
- **D-02:** Add `findUnknownSessionAgentToolNames(settings: SessionAgentToolsSettingsV1, knownNames: string[]): string[]` to `apps/cli/src/settings/sessionAgentToolsSettings.ts`. The caller (`startHappyServer.ts`) supplies the known-names list; the settings module does not import `listBuiltInHappierTools` directly.
- **D-03:** One aggregated `logger.warn` listing all unknown names AND the full valid tool catalog inline. Example format: `[sessionAgentToolsSettings] Unknown tool names in sessionAgentToolsSettingsV1: ["change-title", "typo_tool"] — these will be ignored. Valid tool names: ["change_title", "memory_search", ...]`

### Claude's Discretion

- Whether `findUnknownSessionAgentToolNames` returns `string[]` (unknown names) or emits the warn itself — caller can emit or function can emit; planner decides based on what makes tests cleaner.
- Exact warn message wording and array formatting (JSON-like vs comma-separated vs line-separated).
- Whether the processing-time `debug` log (TOOLS-02) is added in the same plan or a separate follow-up; the startup warn (VALID-01) takes priority.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TOOLS-02 | Unknown tool names in config are silently handled (debug-level log) so settings files survive tool renames and catalog additions | `logger.debug` call in `startHappyServer.ts` (or deferred per D-01); confirmed `logger.debug` writes to file only — no console output |
| VALID-01 | Unknown tool names in the config produce a `logger.warn` log entry at startup identifying which names were unrecognized | `logger.warn` call in `startHappyServer.ts` after `findUnknownSessionAgentToolNames`; confirmed `logger.warn` writes to both console and file |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Find unknown tool names | CLI settings layer | — | Pure comparison function; no IO, no framework dependency. Belongs in `sessionAgentToolsSettings.ts` alongside `buildIsSessionAgentToolEnabled` |
| Emit startup warn | CLI daemon startup | — | `startHappyServer.ts` owns startup IO; it has `logger` already imported and knows the known-names list |
| Known-names source | CLI tool catalog | — | `listBuiltInHappierTools({ surface: 'session_agent' })` is the canonical catalog; already called in `startHappyServer.ts` for `toolNamesSnapshot` |

---

## Standard Stack

### Core

All libraries below are already present in the codebase; no new dependencies are introduced.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vitest | 3.x [VERIFIED: codebase grep] | Unit testing | Established test runner for CLI package |
| TypeScript | 5.9.3 [VERIFIED: CLAUDE.md] | Implementation language | Required by project |
| `logger` (internal) | N/A | Warn/debug emission | `@/ui/logger` already imported in both touch-point files |

### No New Dependencies

Phase 3 is a pure TypeScript addition within existing modules. No npm installs are needed.

---

## Architecture Patterns

### System Architecture Diagram

```
startHappyServer()
    |
    |-- readSettings()                          [already exists]
    |-- readSessionAgentToolsSettingsV1()       [already exists]
    |-- buildIsSessionAgentToolEnabled()        [already exists]
    |
    |-- listBuiltInHappierTools({ surface: 'session_agent' })
    |       |
    |       +-- .map(t => t.name)  → knownNames[]   [new: extract names without filter]
    |
    |-- findUnknownSessionAgentToolNames(toolsSettings, knownNames)   [NEW FUNCTION]
    |       |
    |       +-- Object.keys(settings.tools)           [configured names]
    |       +-- Set difference against knownNames[]   [pure computation]
    |       +-- returns unknownNames: string[]
    |
    |-- if (unknownNames.length > 0)
    |       +-- logger.warn(aggregated message)        [NEW CALL SITE]
    |       +-- logger.debug(processing-time note)    [NEW CALL SITE — TOOLS-02]
    |
    |-- toolNamesSnapshot = listBuiltInHappierTools(...)
    |       .filter(isSessionAgentToolEnabled).map(t => t.name)  [already exists]
    |
    v
    createHappierMcpServer(client, { ..., isSessionAgentToolEnabled })
```

### Recommended Project Structure

No new files or folders. Changes are additions to two existing files:

```
apps/cli/src/settings/
└── sessionAgentToolsSettings.ts   ← add findUnknownSessionAgentToolNames
    sessionAgentToolsSettings.test.ts  ← add unit tests for new function

apps/cli/src/mcp/
└── startHappyServer.ts            ← add call site + logger.warn + logger.debug
    startHappyServer.integration.test.ts  ← add integration tests for warn behavior
```

### Pattern 1: Pure comparison function (matches Phase 2 precedent)

**What:** `findUnknownSessionAgentToolNames` computes unknown names from settings and a known-names array; returns `string[]`; caller decides what to do with the result.

**When to use:** When the function has no IO side effects and the caller owns the decision to emit a warning. Matches the existing `buildIsSessionAgentToolEnabled` pattern — that function also receives settings and returns a value for the caller to use.

**Example (implementation sketch):**
```typescript
// Source: consistent with buildIsSessionAgentToolEnabled in same file
export function findUnknownSessionAgentToolNames(
    settings: SessionAgentToolsSettingsV1,
    knownNames: string[],
): string[] {
    const knownSet = new Set(knownNames);
    return Object.keys(settings.tools).filter((name) => !knownSet.has(name));
}
```

**Call site in startHappyServer.ts (insertion point ~line 44):**
```typescript
// Source: consistent with existing pattern in startHappyServer.ts
const allKnownNames = listBuiltInHappierTools({ surface: 'session_agent' }).map((t) => t.name);
const unknownNames = findUnknownSessionAgentToolNames(toolsSettings, allKnownNames);
if (unknownNames.length > 0) {
    logger.warn(
        `[sessionAgentToolsSettings] Unknown tool names in sessionAgentToolsSettingsV1: ` +
        `${JSON.stringify(unknownNames)} — these will be ignored. ` +
        `Valid tool names: ${JSON.stringify(allKnownNames)}`,
    );
    logger.debug(
        `[sessionAgentToolsSettings] Ignoring unknown tool names at processing time: ${JSON.stringify(unknownNames)}`,
    );
}
```

**Note on `allKnownNames` vs `toolNamesSnapshot`:** The existing `toolNamesSnapshot` line applies `isSessionAgentToolEnabled` (the filter predicate) on top of `listBuiltInHappierTools`. For the warn, we need the unfiltered list (all valid names the user could reference), so we derive `allKnownNames` separately using `.map(t => t.name)` without `.filter(...)`. This uses `listBuiltInHappierTools` twice — once for validation, once for the filtered snapshot. The duplication is small and avoids confusing the two concerns.

### Pattern 2: Existing warn message format (prefix consistency)

**What:** The existing warn in `readSessionAgentToolsSettingsV1` uses `[sessionAgentToolsSettings]` prefix. The new warn must use the same prefix so developers can `grep` for all settings-module warnings consistently.

**Existing example (for prefix reference):**
```typescript
// Source: apps/cli/src/settings/sessionAgentToolsSettings.ts line 44 [VERIFIED: file read]
logger.warn(`[sessionAgentToolsSettings] sessionAgentToolsSettingsV1 failed schema validation — using defaults. Error: ${parsed.error.message}`);
```

### Anti-Patterns to Avoid

- **`findUnknownSessionAgentToolNames` importing `listBuiltInHappierTools` directly:** The CONTEXT.md D-02 decision explicitly forbids this to keep dependency direction clean. The settings module must remain agnostic of the tool catalog.
- **Filtering known names before validation:** The validation must use the unfiltered catalog (all valid tool names a user could specify), not the post-filter snapshot (tools remaining after `isSessionAgentToolEnabled` is applied). Using `toolNamesSnapshot` would wrongly mark a disabled-but-valid tool name as unknown.
- **Multiple `logger.warn` calls per unknown name:** D-03 specifies a single aggregated message. Emitting one warn per unknown name pollutes the log.
- **Emitting `logger.warn` when `unknownNames` is empty:** Success case (only valid names) must produce no warn log (Phase 3 success criterion 2).

---

## Solved Problems

| Problem | Build Nothing — Use Instead | Why |
|---------|-----------------------------|-----|
| String set difference | `new Set(knownNames)` + `Array.filter` | Standard JS; no library needed for this scale |
| Warn-level logging | `logger.warn(...)` from `@/ui/logger` | Already imported; writes to console + file |
| Debug-level logging | `logger.debug(...)` from `@/ui/logger` | Already imported; writes to file only (no console disruption) |

---

## Common Pitfalls

### Pitfall 1: Using toolNamesSnapshot as the known-names source

**What goes wrong:** If `allKnownNames` is derived from `toolNamesSnapshot` (which applies `isSessionAgentToolEnabled`), a tool that exists in the catalog but is disabled by the same config will appear in `unknownNames` even though the user spelled it correctly.

**Root cause:** `toolNamesSnapshot` excludes tools where `enabled: false` — the exact entries the user is trying to control.

**Prevention:** Derive `allKnownNames` from `listBuiltInHappierTools({ surface: 'session_agent' }).map(t => t.name)` — no filter applied.

**Warning signs:** A test for "valid tool name with enabled: false produces no warn" fails.

### Pitfall 2: Calling listBuiltInHappierTools inside sessionAgentToolsSettings.ts

**What goes wrong:** Creates an import cycle or unintended coupling from the settings layer into the tool catalog layer.

**Root cause:** D-02 prohibits this direction of dependency.

**Prevention:** `startHappyServer.ts` passes `knownNames` into `findUnknownSessionAgentToolNames` — the function never imports the catalog itself.

### Pitfall 3: Processing-time debug log location

**What goes wrong:** The TOOLS-02 `logger.debug` is placed inside `findUnknownSessionAgentToolNames` or the settings module, rather than at the filter application site in `registerHappierMcpBuiltInTools.ts` or `startHappyServer.ts`.

**Root cause:** TOOLS-02 is about per-tool-invocation silently ignoring unknown names (not an aggregated check). The natural site is where the filtering predicate is applied — `buildIsSessionAgentToolEnabled` already handles this silently (returns `true` for names not in config); no additional debug is strictly needed at that layer.

**Prevention:** Place the TOOLS-02 debug call at the call site in `startHappyServer.ts` inside the same `if (unknownNames.length > 0)` guard as the warn — co-located, single location, guarded against noise on clean configs.

### Pitfall 4: Test uses logger.warn spy without vi.mock setup

**What goes wrong:** The existing `sessionAgentToolsSettings.test.ts` already sets up `vi.mock('@/ui/logger', ...)` with a `warn` spy. New tests in the same file inherit this mock. But if a new test file is created, it must re-declare the mock.

**Root cause:** Vitest module isolation (per the `isolate: true` config).

**Prevention:** Add new unit tests for `findUnknownSessionAgentToolNames` inside the existing `sessionAgentToolsSettings.test.ts` to reuse the established mock setup. Integration tests in `startHappyServer.integration.test.ts` test observable daemon-log behavior, not the spy directly.

---

## Code Examples

### Unit test pattern (consistent with existing file)

```typescript
// Source: apps/cli/src/settings/sessionAgentToolsSettings.test.ts [VERIFIED: file read]
// Add inside the existing describe('sessionAgentToolsSettings') block:

describe('findUnknownSessionAgentToolNames', () => {
    it('returns empty array when all configured names are known', async () => {
        const { findUnknownSessionAgentToolNames, DEFAULT_SESSION_AGENT_TOOLS_SETTINGS } =
            await import('./sessionAgentToolsSettings');
        // settings with valid name, knownNames includes it
        const settings = { v: 1 as const, tools: { change_title: { enabled: false } } };
        expect(findUnknownSessionAgentToolNames(settings, ['change_title', 'memory_search'])).toEqual([]);
    });

    it('returns unknown names when configured names are not in the known list', async () => {
        const { findUnknownSessionAgentToolNames } = await import('./sessionAgentToolsSettings');
        const settings = { v: 1 as const, tools: { 'change-title': { enabled: false }, typo_tool: { enabled: true } } };
        const result = findUnknownSessionAgentToolNames(settings, ['change_title', 'memory_search']);
        expect(result).toContain('change-title');
        expect(result).toContain('typo_tool');
        expect(result).toHaveLength(2);
    });

    it('returns empty array when settings.tools is empty (default state)', async () => {
        const { findUnknownSessionAgentToolNames, DEFAULT_SESSION_AGENT_TOOLS_SETTINGS } =
            await import('./sessionAgentToolsSettings');
        expect(findUnknownSessionAgentToolNames(DEFAULT_SESSION_AGENT_TOOLS_SETTINGS, ['change_title'])).toEqual([]);
    });
});
```

### Integration test pattern for warn (matches startHappyServer.integration.test.ts structure)

```typescript
// Source: apps/cli/src/mcp/startHappyServer.integration.test.ts [VERIFIED: file read]
// Add as new describe block inside 'startHappyServer (MCP integration)':

describe('sessionAgentToolsSettingsV1 validation (VALID-01)', () => {
    const envBackup = snapshotEnvValues(['HAPPIER_HOME_DIR', 'HAPPIER_SERVER_URL', 'HAPPIER_WEBAPP_URL']);
    let homeDir: string | undefined;

    beforeEach(async () => {
        homeDir = await createTempDir('happier-mcp-warn-integration-');
        applyEnvValues({
            HAPPIER_HOME_DIR: homeDir,
            HAPPIER_SERVER_URL: 'https://api.example.test',
            HAPPIER_WEBAPP_URL: 'https://app.example.test',
        });
        reloadConfiguration();
    });

    afterEach(async () => {
        restoreEnvValues(envBackup);
        reloadConfiguration();
        if (homeDir) await removeTempDir(homeDir);
    });

    it('emits a warn-level log at startup when config contains an unknown tool name (VALID-01)', async () => {
        // Write settings with a misspelled tool name
        const settings = {
            schemaVersion: 6,
            onboardingCompleted: false,
            sessionAgentToolsSettingsV1: { v: 1, tools: { 'change-title': { enabled: false } } },
        };
        await writeFile(join(homeDir!, 'settings.json'), JSON.stringify(settings), { mode: 0o600 });

        // Observe logger.warn via the daemon log file (or spy approach)
        // ... spy on logger or read log file after startHappyServer
    });

    it('emits no warn log when config contains only valid tool names', async () => {
        const settings = {
            schemaVersion: 6,
            onboardingCompleted: false,
            sessionAgentToolsSettingsV1: { v: 1, tools: { change_title: { enabled: false } } },
        };
        await writeFile(join(homeDir!, 'settings.json'), JSON.stringify(settings), { mode: 0o600 });
        // assert no warn was emitted
    });
});
```

**Note on integration test spy strategy:** `startHappyServer.integration.test.ts` does NOT mock the logger (it's a real integration test). To assert warn behavior in integration tests, two options exist: (a) capture `logger.logFilePath` after startup and read the log file for the warn text, or (b) add a thin spy in a `beforeEach` block specific to the warn describe block. Option (b) is cleaner and consistent with how the unit tests work. The planner should choose one approach. Option (a) avoids mocking but is slower; option (b) requires `vi.mock` at the module level which can conflict with `vi.resetModules()` in the outer `beforeEach`. **Recommendation:** Test warn behavior in the unit test file via mock spy, and test "unknown names don't crash startup" in the integration test. This separates concerns cleanly.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `mcpToolsSettingsV1` naming | `sessionAgentToolsSettingsV1` naming | Phase 2 (2026-04-19) | All Phase 3 code must use `sessionAgentToolsSettingsV1` everywhere |
| No unknown-name feedback | `logger.warn` at startup (Phase 3) | This phase | Developer typos are surfaced in daemon log; no crash, no behavior change |

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — Phase 3 is a pure TypeScript code addition with no CLI tools, services, or runtimes beyond the existing Node.js/Vitest setup).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file | `apps/cli/vitest.config.ts` |
| Quick run command | `cd apps/cli && yarn test:unit --reporter=verbose src/settings/sessionAgentToolsSettings.test.ts` |
| Full suite command | `cd apps/cli && yarn test:unit` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VALID-01 | Unknown tool names produce `logger.warn` at startup | unit | `cd apps/cli && yarn test:unit src/settings/sessionAgentToolsSettings.test.ts` | yes — add test block |
| VALID-01 | Valid-only config produces no warn | unit | same file | yes — add test case |
| VALID-01 | Unknown names do not crash startup | integration | `cd apps/cli && yarn test:integration src/mcp/startHappyServer.integration.test.ts` | yes — add test case |
| TOOLS-02 | Unknown names silently handled at processing time (debug-level) | unit | `cd apps/cli && yarn test:unit src/settings/sessionAgentToolsSettings.test.ts` | yes — add if implemented |

### Sampling Rate

- **Per task commit:** `cd apps/cli && yarn test:unit src/settings/sessionAgentToolsSettings.test.ts`
- **Per wave merge:** `cd apps/cli && yarn test:unit`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

None — existing test infrastructure covers all phase requirements. No new test files, no new config, no new fixtures are required. New test cases are added to existing test files.

---

## Security Domain

Phase 3 adds no authentication, no data storage, no user input processing, no network endpoints, and no cryptography. It reads already-validated settings (post-Zod-parse) and emits a log string. ASVS categories V2 (Authentication), V3 (Session), V4 (Access Control), V5 (Input Validation), and V6 (Cryptography) are not applicable.

The only security-adjacent concern is log content: the warn message includes tool names from the user's own local config file. These are not secrets. [VERIFIED: `sessionAgentToolsSettingsV1.tools` keys are tool names (e.g., `change_title`), not credentials or tokens.]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `listBuiltInHappierTools({ surface: 'session_agent' })` is already called twice in `startHappyServer.ts` (once for `toolNamesSnapshot`) — calling it a third time for `allKnownNames` is acceptable | Architecture Patterns | If the call is expensive, the planner should cache the result and reuse it. Inspection of `listBuiltInHappierTools` shows it reads `HAPPIER_BUILT_IN_TOOLS` and filters in memory — no IO, not expensive. [VERIFIED: file read] Risk: LOW |

**If this table is empty:** No — A1 is flagged for completeness even though risk is LOW.

---

## Open Questions (RESOLVED)

1. **TOOLS-02 debug log: same plan or follow-up?**
   - What we know: D-01 explicitly defers TOOLS-02 to a follow-up if the planner judges it out of scope for a single plan.
   - What is unclear: Whether the planner includes it in the same plan (small addition) or defers it.
   - Recommendation: Include it. The implementation is trivial — a single `logger.debug` in `startHappyServer.ts` (or inside `buildIsSessionAgentToolEnabled`'s returned closure) — and it closes TOOLS-02 completely in the same plan.
   - **RESOLVED:** Included in the same plan (03-01). A `logger.debug` call is placed inside the `if (unknownNames.length > 0)` guard in `startHappyServer.ts`, co-located with the `logger.warn`. TOOLS-02 is covered in the requirements frontmatter of 03-01-PLAN.md.

2. **Integration test warn assertion strategy: spy vs log-file read**
   - What we know: The integration test file does not mock `logger`. The unit test file does mock `logger`.
   - What is unclear: Whether the planner puts the VALID-01 integration assertion in a new integration test case (using a spy) or relies solely on unit tests for warn content.
   - Recommendation: Assert warn behavior in unit tests (spy, clean), assert no-crash behavior in integration tests (listTools call succeeds despite bad config name). This matches the existing pattern in the Phase 2 integration test suite.
   - **RESOLVED:** Warn content (spy) is asserted in unit tests only. The integration test asserts no-crash + `listTools` functional behavior. This is the approach in 03-01-PLAN.md Task 2.

---

## Sources

### Primary (HIGH confidence)
- `apps/cli/src/settings/sessionAgentToolsSettings.ts` [VERIFIED: file read] — current implementation including `buildIsSessionAgentToolEnabled` pattern and existing warn format
- `apps/cli/src/mcp/startHappyServer.ts` [VERIFIED: file read] — confirmed insertion point, existing imports, `listBuiltInHappierTools` already called
- `apps/cli/src/agent/tools/happierTools/listBuiltInHappierTools.ts` [VERIFIED: file read] — `surface: 'session_agent'` confirmed; returns array with `.name` property
- `apps/cli/src/ui/logger.ts` [VERIFIED: file read] — `logger.warn` writes to console + file; `logger.debug` writes to file only
- `apps/cli/src/settings/sessionAgentToolsSettings.test.ts` [VERIFIED: file read] — vi.mock setup, dynamic import pattern, spy assertion pattern
- `apps/cli/src/mcp/startHappyServer.integration.test.ts` [VERIFIED: file read] — integration test structure, `createTempDir`/`writeFile` pattern for settings injection
- `apps/cli/vitest.config.ts` [VERIFIED: file read] — `isolate: true`, `pool: 'forks'`, test commands
- `.planning/phases/03-validation-feedback/03-CONTEXT.md` [VERIFIED: file read] — locked decisions D-01, D-02, D-03

### Secondary (MEDIUM confidence)
- `apps/cli/src/agent/tools/happierTools/catalog.ts` [VERIFIED: file read] — tool names include `change_title`, `action_execute`, `execution_run_start` plus action-backed names; confirms the catalog is the correct known-names source

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all existing code verified by direct file reads
- Architecture: HIGH — insertion point verified, function signature and call pattern confirmed by reading both touch-point files in full
- Pitfalls: HIGH — pitfalls derived from reading actual code structure, not assumptions
- Test patterns: HIGH — all test examples derived from existing files in the same test suite

**Research date:** 2026-04-19
**Valid until:** 2026-05-19 (stable codebase; no fast-moving ecosystem dependency)
