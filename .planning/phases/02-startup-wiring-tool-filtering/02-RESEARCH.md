# Phase 2: Startup Wiring & Tool Filtering - Research

**Researched:** 2026-04-19
**Domain:** TypeScript / Node.js CLI — MCP server startup wiring, settings reader pattern, tool registration predicate
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** All Phase 1 naming changes to `sessionAgentToolsSettingsV1` — the schema type (`SessionAgentToolsSettingsV1`), the settings key in `settings.json` (`sessionAgentToolsSettingsV1`), the file (`apps/cli/src/settings/sessionAgentToolsSettings.ts`), and the `Settings` interface field (`sessionAgentToolsSettingsV1?`). The rename happens as part of the Phase 2 plan, not a separate fixup commit.
- **D-02:** Any new interfaces or parameter names introduced in Phase 2 (e.g., the predicate passed to `createHappierMcpServer`) must use `sessionAgent`-reflecting names — not `mcp`-branded names (e.g., `isSessionAgentToolEnabled`, not `isMcpToolEnabled`).
- **D-03:** The filter predicate uses `session_agent` surface as the reference tool set. Rationale: 9 confirmed divergences between `session_agent` and `mcp` surfaces exist in `actionSpecs.ts`; using `mcp` surface would allow users to name tools that never register (`session_spawn_new`) and make `memory_search` unfilterable. The filter reference and the registration surface must agree.
- **D-04:** `startHappyServer` reads `sessionAgentToolsSettingsV1` from the settings object once (STARTUP-01). It computes the filter predicate at startup and passes it into `createHappierMcpServer` as a parameter. Each per-request call uses the pre-computed predicate — settings are not re-read per request.
- **D-05:** Absent settings file, absent `sessionAgentToolsSettingsV1` key, or schema validation failure → all tools enabled, no crash (STARTUP-02, STARTUP-03). Inherited from Phase 1 reader contract.
- **D-06:** `startHappyServer`'s returned `toolNames` snapshot reflects only enabled (filtered) tools.
- **D-07:** The filter applies to built-in tools only (`registerHappierMcpBuiltInTools`). `registerHappierMcpResources` is intentionally unaffected — add a one-line comment at that call site.

### Claude's Discretion
- Exact parameter shape for threading the predicate into `createHappierMcpServer` (e.g., extend `opts`, new named param, or separate config object)
- Whether to compute the predicate in `startHappyServer` or build a helper in `sessionAgentToolsSettings.ts`
- Zod schema `.strict()` / `.passthrough()` ergonomics for the rename (preserve Phase 1 decisions)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STARTUP-01 | MCP server reads `mcpToolsSettingsV1` (to be renamed `sessionAgentToolsSettingsV1`) from `~/.happier/settings.json` once at `startHappyServer` startup (not per-request) | Wiring pattern in §Architecture Patterns; predicate threading §Code Examples |
| STARTUP-02 | Absent settings file or absent key → all tools enabled (safe default) | Reader already provides this; §Edge Cases |
| STARTUP-03 | Config fails Zod validation → all tools enabled, `logger.warn` emitted, no crash | Reader already provides this; §Edge Cases |
| TOOLS-01 | Only tools with `enabled: true` (or absent from config) are registered with the `McpServer` instance | Predicate application in `registerHappierMcpBuiltInTools`; §Architecture Patterns and §Code Examples |
</phase_requirements>

---

## Summary

Phase 2 has two distinct work streams: (1) a rename sweep that promotes all Phase 1 `mcpToolsSettingsV1` identifiers to `sessionAgentToolsSettingsV1`, and (2) startup wiring that reads the renamed settings once in `startHappyServer`, computes a `(toolName: string) => boolean` predicate, and threads it through `createHappierMcpServer` → `registerHappierMcpBuiltInTools`.

The Phase 1 reader (`readMcpToolsSettingsV1`) already provides the fault-tolerant behavior required by STARTUP-02 and STARTUP-03 — the predicate computation simply wraps the reader's output: `(toolName) => settings.tools[toolName]?.enabled !== false`. The predicate defaults to `true` for any absent tool name (opt-out model), satisfying SCHEMA-02 from Phase 1.

The registration surface is `session_agent`. Both `startHappyServer` (toolNamesSnapshot) and `registerHappierMcpBuiltInTools` (registration loop) already operate on `session_agent`, so the filter plugs in at exactly the right level. Per D-07, `registerHappierMcpResources` is explicitly excluded from this filter — it uses a separate `isActionEnabled` callback mechanism.

**Primary recommendation:** Add `isSessionAgentToolEnabled?: (toolName: string) => boolean` to the existing `opts` parameter of `createHappierMcpServer`. Compute this predicate once in `startHappyServer` by calling `readSessionAgentToolsSettingsV1(settings)` (renamed reader), then pass it through `opts`. Inside `registerHappierMcpBuiltInTools`, filter `enabledTools` with the predicate before registering.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Rename `mcpToolsSettingsV1` → `sessionAgentToolsSettingsV1` | CLI (apps/cli) | — | All artifacts are CLI-local: file, type, key in Settings interface, reader function |
| Read settings once at startup | CLI daemon / startup | — | `startHappyServer` is the MCP server startup function; reads settings once before creating the HTTP server |
| Compute `isSessionAgentToolEnabled` predicate | CLI (startHappyServer) | Helper in sessionAgentToolsSettings.ts (optional) | Predicate is derived from the settings blob; close coupling to the reader keeps the logic testable without touching the HTTP layer |
| Thread predicate through server factory | CLI (createHappierMcpServer opts) | — | opts already carries `credentials`; same pattern applies |
| Apply predicate during tool registration | CLI (registerHappierMcpBuiltInTools) | — | This is where tools are iterated and registered; the predicate gates each iteration |
| Snapshot filtered toolNames at startup | CLI (startHappyServer return value) | — | `toolNamesSnapshot` is already computed from `listBuiltInHappierTools`; filter applied at same point |

---

## Standard Stack

Phase 2 introduces no new external dependencies. All required capabilities are already present.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | 4.3.6 (pinned) [VERIFIED: codebase grep] | Schema validation for settings | Already used throughout; `McpToolsSettingsV1Schema` uses Zod |
| @modelcontextprotocol/sdk | ^1.25.3 [VERIFIED: codebase grep] | `McpServer` tool registration | Already wired; `registerTool` accepts `ToolRegistrar` interface |
| vitest | 3.x [VERIFIED: vitest.config.ts] | Unit tests | All existing tests use Vitest |

### No New Dependencies
This phase is entirely internal wiring. All required modules already exist in the repo.

---

## Architecture Patterns

### System Architecture Diagram

```
Daemon startup
     │
     ▼
startHappyServer(client, opts)
     │
     ├── readSettings()                          ← async call to persistence layer
     │       └── returns Settings (raw JSON)
     │
     ├── readSessionAgentToolsSettingsV1(settings)  ← renamed reader from Phase 1
     │       └── returns { v:1, tools: {...} }
     │           (defaults silently on absent key; warns on schema failure)
     │
     ├── buildIsSessionAgentToolEnabled(toolsSettings)
     │       └── returns (toolName: string) => boolean
     │           where: toolName absent from tools → true; enabled:true → true; enabled:false → false
     │
     ├── toolNamesSnapshot = listBuiltInHappierTools({ surface: 'session_agent' })
     │       │                .filter(t => isSessionAgentToolEnabled(t.name))
     │       │                .map(t => t.name)
     │       └── [filtered list — only enabled tools]
     │
     └── createServer(async (req, res) => {                   ← per-request HTTP handler
             createHappierMcpServer(client, {
                 credentials,
                 isSessionAgentToolEnabled,              ← predicate passed via opts (computed once above)
             })
             ...
         })

createHappierMcpServer(client, opts)
     │
     ├── registerHappierMcpResources(mcp, ...)
     │       └── // resources use their own isActionEnabled callback —
     │           // not subject to sessionAgentToolsSettingsV1 filtering
     │
     └── registerHappierMcpBuiltInTools(mcp, {
             surface: 'session_agent',
             isSessionAgentToolEnabled: opts.isSessionAgentToolEnabled,   ← threaded in
             deps: ...
         })
             │
             └── enabledTools = listBuiltInHappierTools({ surface: 'session_agent' })
                     .filter(t => (isSessionAgentToolEnabled ?? (() => true))(t.name))
                 for (const tool of enabledTools) { server.registerTool(...) }
```

### Recommended Project Structure

No structural changes. Changes are within existing files plus one rename:

```
apps/cli/src/settings/
├── sessionAgentToolsSettings.ts   ← renamed from mcpToolsSettings.ts (Phase 1 file)
├── memorySettings.ts              ← unchanged (reference pattern)
└── ...

apps/cli/src/mcp/
├── startHappyServer.ts            ← modified: reads settings, computes predicate, passes to createHappierMcpServer
├── createHappierMcpServer.ts      ← modified: accepts isSessionAgentToolEnabled in opts, passes to registerHappierMcpBuiltInTools
└── server/
    └── registerHappierMcpBuiltInTools.ts  ← modified: accepts and applies predicate
```

### Pattern 1: Rename Sweep (D-01)

All 5 touch points must change atomically:

| Location | Old | New |
|----------|-----|-----|
| `apps/cli/src/settings/mcpToolsSettings.ts` | filename | `sessionAgentToolsSettings.ts` |
| `McpToolsSettingsV1Schema` | schema export name | `SessionAgentToolsSettingsV1Schema` |
| `McpToolsSettingsV1` | type export | `SessionAgentToolsSettingsV1` |
| `DEFAULT_MCP_TOOLS_SETTINGS` | constant export | `DEFAULT_SESSION_AGENT_TOOLS_SETTINGS` |
| `readMcpToolsSettingsV1` | function export | `readSessionAgentToolsSettingsV1` |
| `apps/cli/src/persistence.ts` Settings interface | `mcpToolsSettingsV1?: unknown` | `sessionAgentToolsSettingsV1?: unknown` |
| `apps/cli/src/persistence.ts` JSDoc comment | refers to `mcpToolsSettings.ts` | update to `sessionAgentToolsSettings.ts` |
| `apps/cli/src/settings/mcpToolsSettings.test.ts` | filename | `sessionAgentToolsSettings.test.ts` |
| Test internals | `readMcpToolsSettingsV1`, `DEFAULT_MCP_TOOLS_SETTINGS`, `mcpToolsSettingsV1` key | updated names |

**Note on the Zod schema warn message:** The reader currently emits `[mcpToolsSettings] mcpToolsSettingsV1 failed schema validation`. This should be updated to reference `sessionAgentToolsSettings` and `sessionAgentToolsSettingsV1` after the rename (per D-01).

### Pattern 2: Predicate Computation

The predicate is a pure function derived from the reader's output. It should be implemented either inline in `startHappyServer` or as a named helper in `sessionAgentToolsSettings.ts`. The helper approach is recommended (per Claude's discretion) because it keeps the predicate logic testable in isolation alongside the reader tests.

```typescript
// Source: derived from Phase 1 reader contract + actionToolCatalog pattern [VERIFIED: codebase]

// Option A — helper in sessionAgentToolsSettings.ts (recommended)
export function buildIsSessionAgentToolEnabled(
    settings: SessionAgentToolsSettingsV1,
): (toolName: string) => boolean {
    return (toolName) => settings.tools[toolName]?.enabled !== false;
}
// Note: returns true for absent keys (opt-out model, SCHEMA-02)

// Option B — inline in startHappyServer (simpler, no helper)
const isSessionAgentToolEnabled = (toolName: string) =>
    toolsSettings.tools[toolName]?.enabled !== false;
```

### Pattern 3: Threading the Predicate

Extend the existing `opts` parameter of `createHappierMcpServer`:

```typescript
// Source: current createHappierMcpServer.ts signature [VERIFIED: codebase]

// CURRENT:
export function createHappierMcpServer(
    client: HappyMcpSessionClient,
    opts?: Readonly<{ credentials?: Credentials | null }>,
): { mcp: McpServer; toolNames: string[] }

// AFTER CHANGE:
export function createHappierMcpServer(
    client: HappyMcpSessionClient,
    opts?: Readonly<{
        credentials?: Credentials | null;
        isSessionAgentToolEnabled?: (toolName: string) => boolean;
    }>,
): { mcp: McpServer; toolNames: string[] }
```

**Rationale for extending `opts` vs. new param:** `opts` is already `Readonly<{...}>` and passed as an optional second argument. Adding a new field is backward-compatible — existing callers (`createHappierMcpBridge`) pass only `{ credentials }` and will continue to work without modification because absent `isSessionAgentToolEnabled` means the predicate defaults to "all enabled".

### Pattern 4: Applying the Predicate in registerHappierMcpBuiltInTools

```typescript
// Source: current registerHappierMcpBuiltInTools.ts [VERIFIED: codebase]

// CURRENT params type:
params: Readonly<{
    sessionId: string;
    surface: BuiltInHappierToolsSurface;
    deps: DispatchDeps;
    resolveSessionId?: (toolArgs: unknown) => string;
}>

// AFTER CHANGE — add optional predicate:
params: Readonly<{
    sessionId: string;
    surface: BuiltInHappierToolsSurface;
    deps: DispatchDeps;
    resolveSessionId?: (toolArgs: unknown) => string;
    isSessionAgentToolEnabled?: (toolName: string) => boolean;
}>

// CURRENT registration loop (line 19):
const enabledTools = listBuiltInHappierTools({ surface: params.surface });

// AFTER CHANGE:
const allTools = listBuiltInHappierTools({ surface: params.surface });
const predicate = params.isSessionAgentToolEnabled ?? (() => true);
const enabledTools = allTools.filter((tool) => predicate(tool.name));
```

The rest of the function is unchanged — `enabledTools` is already iterated and the return `toolNames` is already `enabledTools.map((tool) => tool.name)`.

### Pattern 5: startHappyServer Wiring

```typescript
// Source: derived from current startHappyServer.ts + readSettings pattern [VERIFIED: codebase]

export async function startHappyServer(
    client: HappyMcpSessionClient,
    opts?: Readonly<{ credentials?: Credentials | null }>,
) {
    // Read settings once at startup (STARTUP-01)
    const settings = await readSettings();
    const toolsSettings = readSessionAgentToolsSettingsV1(settings);
    const isSessionAgentToolEnabled = (toolName: string) =>
        toolsSettings.tools[toolName]?.enabled !== false;

    // Snapshot filtered toolNames (D-06)
    const toolNamesSnapshot = listBuiltInHappierTools({ surface: 'session_agent' })
        .filter((tool) => isSessionAgentToolEnabled(tool.name))
        .map((tool) => tool.name);

    const keepAliveIntervalMs = configuration.mcpSseKeepAliveIntervalMs;

    const server = createServer(async (req, res) => {
        // ... (unchanged)
        const { mcp } = createHappierMcpServer(client, {
            credentials: opts?.credentials ?? null,
            isSessionAgentToolEnabled,         // ← added, computed once above
        });
        // ... (unchanged)
    });
    // ... (unchanged)
    return { url, toolNames: toolNamesSnapshot, stop };
}
```

### Pattern 6: Comment at registerHappierMcpResources (D-07)

```typescript
// In createHappierMcpServer.ts, at the registerHappierMcpResources call:
// resources use their own isActionEnabled callback — not subject to sessionAgentToolsSettingsV1 filtering
registerHappierMcpResources(mcp as any, {
    surface: toolSurface,
    isActionEnabled: (id) => isActionEnabledByEnv(id, { surface: toolSurface }),
});
```

### Anti-Patterns to Avoid

- **Re-reading settings per request:** `startHappyServer` creates a fresh `McpServer` per HTTP request (stateless mode). If `readSettings()` is called inside the per-request handler, settings would be read on every request. This violates D-04 and adds unnecessary I/O. The fix: compute predicate in the outer `startHappyServer` body, before `createServer(...)`.
- **Branching on predicate undefined inside registerHappierMcpBuiltInTools:** Using `if (!params.isSessionAgentToolEnabled) return allTools` breaks when a future caller passes an explicit "all-false" predicate. Use `params.isSessionAgentToolEnabled ?? (() => true)` so the default is a no-op, not a bypass.
- **Using `mcp` surface instead of `session_agent` surface in the predicate reference:** Per D-03, the predicate must match the registration surface. Both `startHappyServer` and `registerHappierMcpBuiltInTools` already use `session_agent`. The predicate must be applied against the same tool list.
- **Renaming `DEFAULT_MCP_TOOLS_SETTINGS` in tests without updating import references:** Tests currently `import { DEFAULT_MCP_TOOLS_SETTINGS }` by name — failing to update the test file will cause a compile error.

---

## Solved Problems

| Problem | Build Nothing — Use Instead | Why |
|---------|-----------------------------|-----|
| Fault-tolerant settings reading | `readSessionAgentToolsSettingsV1` (renamed Phase 1 reader) | Already handles absent key (silent), schema failure (warn + default), null/undefined (silent). Matches D-05. |
| Settings file path | `configuration.settingsFile` via `readSettings()` | `readSettings()` already uses `configuration.settingsFile` internally. Never hardcode. |
| Opt-out tool default | `settings.tools[toolName]?.enabled !== false` | Returns `true` for absent keys. Matches SCHEMA-02. |
| Tool surface filtering | `listBuiltInHappierTools({ surface: 'session_agent' })` | Already filters by surface internally via `filterBuiltInToolsForSurface`. |

---

## Runtime State Inventory

Step 2.5 SKIPPED — this phase involves a rename of in-codebase identifiers only. The JSON key `mcpToolsSettingsV1` in `~/.happier/settings.json` is being renamed to `sessionAgentToolsSettingsV1`. Because this is a new feature (Phase 1 schema was never shipped), no users have existing `mcpToolsSettingsV1` keys in their settings files. No data migration is required.

**Stored data:** None — `mcpToolsSettingsV1` key was introduced in Phase 1, which has not been released. No existing user settings files contain this key.
**Live service config:** None — this is a CLI-local settings key.
**OS-registered state:** None.
**Secrets/env vars:** None — no env var references this key.
**Build artifacts:** None — the renamed file is a TypeScript source file; no compiled artifacts need special handling beyond the normal build.

---

## Common Pitfalls

### Pitfall 1: `readSettings()` is Async — Must Await Before `createServer`

**What goes wrong:** `readSettings()` returns a `Promise<Settings>`. If called inside the synchronous part of `createServer`'s request handler, it would be called per-request (violating D-04) or may silently return before resolution.
**Root cause:** `startHappyServer` already has an `await` budget before `createServer(...)` is called (for the `server.listen(0, ...)` promise). Reading settings must happen in this same outer `async` body.
**Prevention:** Place `const settings = await readSettings()` before the `createServer(...)` call.
**Warning signs:** Seeing settings-related code inside `const server = createServer(async (req, res) => { ... })`.

### Pitfall 2: Test File Rename Breaks Existing Tests

**What goes wrong:** `mcpToolsSettings.test.ts` imports `readMcpToolsSettingsV1` and `DEFAULT_MCP_TOOLS_SETTINGS` by name. After rename, these names no longer exist.
**Root cause:** Test files must be renamed alongside source files in the same task.
**Prevention:** Rename file to `sessionAgentToolsSettings.test.ts`; update all import identifiers in the same commit.
**Warning signs:** TypeScript errors like `Module has no exported member 'readMcpToolsSettingsV1'`.

### Pitfall 3: `persistence.ts` JSDoc Comment Still References Old File Name

**What goes wrong:** The `mcpToolsSettingsV1?` field has a JSDoc comment that says `Parsed/normalized by settings/mcpToolsSettings.ts`. After rename, the comment is stale but TypeScript won't catch it.
**Root cause:** Comments are not type-checked.
**Prevention:** Update the JSDoc comment when renaming the field.
**Warning signs:** Developer reads `persistence.ts` and navigates to the wrong file.

### Pitfall 4: `createHappierMcpServer` Tests That Mock `registerHappierMcpBuiltInTools`

**What goes wrong:** `createHappierMcpServer.test.ts` mocks `registerHappierMcpBuiltInTools` in several tests. These mocks return `{ toolNames: [] }` without inspecting params. If the new `isSessionAgentToolEnabled` param is not forwarded in `createHappierMcpServer`, existing tests still pass (returning empty names) and the bug is invisible.
**Root cause:** Over-mocking hides parameter forwarding errors.
**Prevention:** Add a new test that asserts `isSessionAgentToolEnabled` is forwarded to `registerHappierMcpBuiltInTools` when provided.
**Warning signs:** No test failing when `isSessionAgentToolEnabled` is omitted from the `registerHappierMcpBuiltInTools` call.

### Pitfall 5: `startHappyServer` Integration Tests Don't Reload Configuration

**What goes wrong:** `startHappyServer.integration.test.ts` calls `reloadConfiguration()` to reset environment state between tests. After Phase 2 changes, tests that set `HAPPIER_HOME_DIR` to a temp dir and write a settings file there need to also call `reloadConfiguration()` if the settings path changed.
**Root cause:** `configuration.settingsFile` is derived from `HAPPIER_HOME_DIR` at construction time. `reloadConfiguration()` re-derives the path.
**Prevention:** Any integration test that exercises the settings-reading path must set `HAPPIER_HOME_DIR` and call `reloadConfiguration()` before calling `startHappyServer`.
**Warning signs:** Test reads from real `~/.happier/settings.json` instead of the temp dir.

---

## Code Examples

### Verified Predicate Logic

```typescript
// Source: opt-out model per SCHEMA-02 [VERIFIED: mcpToolsSettings.ts + test file]

// Given: settings = readSessionAgentToolsSettingsV1(rawSettings)
// settings.tools is Record<string, { enabled: boolean }> (default {})

const isSessionAgentToolEnabled = (toolName: string): boolean =>
    settings.tools[toolName]?.enabled !== false;

// Edge cases:
// settings.tools['change_title'] === undefined  → true  (absent = enabled)
// settings.tools['change_title'] === { enabled: true }  → true
// settings.tools['change_title'] === { enabled: false }  → false
```

### registerHappierMcpBuiltInTools — Current vs Modified

```typescript
// CURRENT (line 19 of registerHappierMcpBuiltInTools.ts):
const enabledTools = listBuiltInHappierTools({ surface: params.surface });

// AFTER CHANGE:
const allTools = listBuiltInHappierTools({ surface: params.surface });
const predicate = params.isSessionAgentToolEnabled ?? (() => true);
const enabledTools = allTools.filter((tool) => predicate(tool.name));

// Return value unchanged:
return { toolNames: enabledTools.map((tool) => tool.name) };
```

### toolNamesSnapshot in startHappyServer — Current vs Modified

```typescript
// CURRENT (line 38 of startHappyServer.ts):
const toolNamesSnapshot = listBuiltInHappierTools({ surface: 'session_agent' }).map((tool) => tool.name);

// AFTER CHANGE:
const toolNamesSnapshot = listBuiltInHappierTools({ surface: 'session_agent' })
    .filter((tool) => isSessionAgentToolEnabled(tool.name))
    .map((tool) => tool.name);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `mcpToolsSettingsV1` key everywhere | `sessionAgentToolsSettingsV1` key everywhere | Phase 2 (this phase) | Rename of all Phase 1 artifacts |
| No tool filtering in `registerHappierMcpBuiltInTools` | `isSessionAgentToolEnabled` predicate applied before registration loop | Phase 2 (this phase) | Only enabled tools appear in MCP tool list |

**No deprecated features involved.** The Phase 1 reader already uses `.passthrough()`-compatible preprocessing (`z.preprocess`). The rename preserves all schema behavior.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | No user has a `mcpToolsSettingsV1` key in their settings file (Phase 1 was never shipped) | Runtime State Inventory | If wrong: rename breaks existing user settings. Mitigation: verify Phase 1 was never released before finalizing the plan. |

**All other claims in this research were verified by direct codebase inspection (`[VERIFIED: codebase]`).**

---

## Open Questions

1. **Should `buildIsSessionAgentToolEnabled` live in `sessionAgentToolsSettings.ts` or inline in `startHappyServer`?**
   - What we know: The predicate is a one-liner. Either location is valid.
   - Recommendation: Add it as a named export in `sessionAgentToolsSettings.ts` for testability. Tests for the predicate logic (edge cases: absent key, `enabled: true`, `enabled: false`) can live alongside the existing reader tests without touching `startHappyServer` fixtures.

2. **Does `createHappierMcpBridge` need any changes?**
   - What we know: `createHappierMcpBridge.ts` calls `startHappyServer(session, { credentials })`. `startHappyServer` reads settings internally after Phase 2. No changes needed at the `createHappierMcpBridge` level.
   - Recommendation: No changes — `createHappierMcpBridge` is a thin wrapper and the predicate is encapsulated inside `startHappyServer`.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 2 is a TypeScript code/settings change with no new external dependencies (no new CLI tools, databases, or services required beyond what already runs the daemon).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file | `apps/cli/vitest.config.ts` |
| Quick run command (unit) | `yarn workspace @happier-dev/cli vitest run src/settings/sessionAgentToolsSettings.test.ts src/mcp/createHappierMcpServer.test.ts src/mcp/server/registerHappierMcpBuiltInTools.test.ts` |
| Integration run command | `yarn workspace @happier-dev/cli vitest run --reporter=verbose src/mcp/startHappyServer.integration.test.ts` |
| Full suite command | `yarn workspace @happier-dev/cli vitest run` |

**Note:** Integration tests are in `*.integration.test.ts` files, excluded from the default `vitest run` include pattern. Run them explicitly when validating STARTUP-01.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STARTUP-01 | `startHappyServer` reads settings once, not per-request | integration | `yarn workspace @happier-dev/cli vitest run src/mcp/startHappyServer.integration.test.ts` | yes — extend existing |
| STARTUP-01 | Predicate computed once; used in per-request `createHappierMcpServer` call | unit | `yarn workspace @happier-dev/cli vitest run src/mcp/createHappierMcpServer.test.ts` | yes — extend existing |
| STARTUP-02 | Absent settings file → all tools enabled | unit | `yarn workspace @happier-dev/cli vitest run src/settings/sessionAgentToolsSettings.test.ts` | yes (after rename) |
| STARTUP-02 | Absent key → all tools enabled | unit | same | yes (after rename) |
| STARTUP-03 | Schema validation failure → all tools enabled + `logger.warn` emitted | unit | same | yes (after rename) |
| TOOLS-01 | `enabled: false` tool absent from `listTools()` response | integration | `yarn workspace @happier-dev/cli vitest run src/mcp/startHappyServer.integration.test.ts` | no — new test |
| TOOLS-01 | `enabled: true` tool present in `listTools()` response | integration | same | no — new test |
| TOOLS-01 | `registerHappierMcpBuiltInTools` filters with predicate before registering | unit | `yarn workspace @happier-dev/cli vitest run src/mcp/server/registerHappierMcpBuiltInTools.test.ts` | no — new file |
| TOOLS-01 | `createHappierMcpServer` forwards `isSessionAgentToolEnabled` to `registerHappierMcpBuiltInTools` | unit | `yarn workspace @happier-dev/cli vitest run src/mcp/createHappierMcpServer.test.ts` | no — new test |
| D-06 | `startHappyServer.toolNames` contains only enabled tools | unit/integration | extend existing startHappyServer tests | no — new assertion |

### Sampling Rate

- **Per task commit:** `yarn workspace @happier-dev/cli vitest run src/settings/sessionAgentToolsSettings.test.ts src/mcp/createHappierMcpServer.test.ts`
- **Per wave merge:** `yarn workspace @happier-dev/cli vitest run` (unit suite only)
- **Phase gate:** Unit suite green + integration test for TOOLS-01 green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `apps/cli/src/mcp/server/registerHappierMcpBuiltInTools.test.ts` — no test file exists for this module; needed for TOOLS-01 unit coverage
- [ ] New tests in `apps/cli/src/mcp/createHappierMcpServer.test.ts` — assert `isSessionAgentToolEnabled` forwarding
- [ ] New integration tests in `apps/cli/src/mcp/startHappyServer.integration.test.ts` — end-to-end: write settings with `enabled: false` to temp dir, verify tool absent from `listTools()`
- [ ] Rename `apps/cli/src/settings/mcpToolsSettings.test.ts` → `sessionAgentToolsSettings.test.ts` + update internals (prerequisite for all settings tests)

---

## Security Domain

Phase 2 does not introduce authentication, authorization, cryptographic operations, or network endpoints. The settings file is CLI-local and already protected by the existing `readSettings()` and `writeSettings()` permission model (`chmod 0o600`). No ASVS categories apply.

**Security enforcement: no security-sensitive changes in this phase.**

---

## Sources

### Primary (HIGH confidence)
- `[VERIFIED: codebase]` — direct inspection of all 9 canonical ref files listed in CONTEXT.md
- `apps/cli/src/settings/mcpToolsSettings.ts` — full Phase 1 implementation confirmed
- `apps/cli/src/persistence.ts` — Settings interface, `readSettings()` confirmed; `mcpToolsSettingsV1?: unknown` field at line 118
- `apps/cli/src/mcp/startHappyServer.ts` — current `toolNamesSnapshot` computation at line 38; `createHappierMcpServer` call at line 57
- `apps/cli/src/mcp/createHappierMcpServer.ts` — current `opts` type; `registerHappierMcpBuiltInTools` call signature
- `apps/cli/src/mcp/server/registerHappierMcpBuiltInTools.ts` — `listBuiltInHappierTools` call; registration loop; return structure
- `apps/cli/src/agent/tools/happierTools/listBuiltInHappierTools.ts` — `session_agent` surface; `filterBuiltInToolsForSurface` delegation
- `apps/cli/src/agent/tools/happierTools/actionToolCatalog.ts` — `filterBuiltInToolsForSurface` implementation; `isActionEnabled` predicate pattern
- `apps/cli/src/settings/mcpToolsSettings.test.ts` — test infrastructure; env/tempDir fixtures; Vitest mock pattern
- `apps/cli/src/mcp/startHappyServer.integration.test.ts` — integration test structure; `reloadConfiguration()` pattern; temp settings wiring pattern
- `apps/cli/vitest.config.ts` — test framework version; include/exclude globs; `forks` pool mode

### Secondary (MEDIUM confidence)
- `apps/cli/src/settings/memorySettings.ts` — adjacent reader pattern (confirmed: `readSettings()` → reader function chain)
- `apps/cli/src/mcp/servers/readMcpServersSettingsFromAccountSettings.ts` — empty-struct-on-failure reader pattern (confirmed)
- `apps/cli/src/agent/runtime/createHappierMcpBridge.ts` — confirmed only caller of `startHappyServer` in non-test code; discards `toolNames`

### Flagged for Validation (LOW confidence)
- A1: Assumption that Phase 1 was never shipped — verify before plan finalization.

---

## Metadata

**Confidence breakdown:**
- Rename touch points: HIGH — all 9 files directly inspected, exact line numbers confirmed
- Predicate threading: HIGH — existing `opts` pattern and `registerHappierMcpBuiltInTools` signature confirmed
- Test infrastructure: HIGH — vitest config and existing test patterns confirmed
- Phase 1 never shipped (A1): LOW — requires release/branch history check

**Research date:** 2026-04-19
**Valid until:** 2026-05-19 (stable TypeScript codebase; no fast-moving external dependencies)

---

## RESEARCH COMPLETE
