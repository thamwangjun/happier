# Architecture Analysis: MCP Tool Configuration via ~/.happier-dev/settings.json

**Project:** Happier — MCP Tool Configuration (v1.0)
**Researched:** 2026-04-18
**Confidence:** HIGH — all claims are derived from direct source reading

---

## Architecture Analysis

### Integration Point

**Where settings.json lives:** `configuration.happyHomeDir` resolves to `~/.happier` (or `$HAPPIER_HOME_DIR`) by default, but the milestone context references `~/.happier-dev/settings.json`. The existing `configuration.settingsFile` already points to `join(this.happyHomeDir, 'settings.json')` (configuration.ts line 239). The `happyHomeDir` defaults to `join(homedir(), '.happier')`. If the product branding uses `.happier-dev`, the `HAPPIER_HOME_DIR` env var must be set to `~/.happier-dev`; otherwise the canonical path under the existing system is `~/.happier/settings.json`. **Verify with the team which path is canonical for the v1.0 target.** The rest of this analysis treats `configuration.settingsFile` (i.e. `configuration.happyHomeDir/settings.json`) as the source of truth.

**Where MCP tool filtering currently happens:**

The active filter call chain, traced from source, is:

```
startHappyServer (per HTTP request)
  └─ createHappierMcpServer
       ├─ isActionEnabledByEnv(id, { surface: 'session_agent' })   [resources]
       ├─ createActionToolExecutorBridge({ isActionEnabled: ... })  [action tools]
       └─ registerHappierMcpBuiltInTools
            └─ listBuiltInHappierTools({ surface: 'session_agent' })
                 └─ filterBuiltInToolsForSurface(
                      HAPPIER_BUILT_IN_TOOLS,
                      { isActionEnabled: (id) => isActionEnabledByEnv(id, { surface }) }
                    )
```

`isActionEnabledByEnv` (actionsSettings.ts) reads `process.env.HAPPIER_ACTIONS_SETTINGS_V1` on every call, parses it as JSON, validates against `ActionsSettingsV1Schema`, and calls `isActionEnabledByActionsSettings`. There is no caching.

The filter is applied at **registration time** inside `createHappierMcpServer`, which is called **once per HTTP request** (stateless mode, `startHappyServer` line 57). This means any change to the env var becomes visible on the next MCP request without daemon restart.

**What `ActionsSettingsV1Schema` accepts:**

```json
{
  "v": 1,
  "actions": {
    "<actionId>": {
      "enabled": false,
      "disabledSurfaces": ["session_agent"],
      "disabledPlacements": [],
      "enabledPlacements": [],
      "approvalRequiredSurfaces": []
    }
  }
}
```

This schema already handles per-surface and per-placement disabling. The file format for `~/.happier-dev/settings.json` only needs to carry an `actionsSettings` key (or equivalent) that maps to this shape.

---

### Proposed Data Flow

**Recommended approach: read at daemon startup, pass as env var to child session processes.**

This recommendation is based on three evidence-backed reasons:

1. **The env-var read path (`isActionEnabledByEnv`) is called per MCP request, not per daemon start.** The MCP server process (`startHappyServer`) is a session-local HTTP server spawned per session runner, not by the daemon itself. The daemon spawns session runner child processes using `spawnHappyCLI` with an explicit `env` built by `buildSpawnChildProcessEnv` (which merges `process.env` with `extraEnv`). `HAPPIER_ACTIONS_SETTINGS_V1` flows to the session runner because it is already in the daemon's `process.env` — the child inherits the whole env.

2. **Fresh-per-request file reads would be operationally fragile.** The MCP server is stateless and creates a new `McpServer` per HTTP request. A synchronous file read per request (or async blocking) inside the hot path would add latency and failure modes (missing file, malformed JSON) at the worst possible moment. The existing env-var pattern already handles the parse-fail-gracefully case by returning an empty settings object on any error.

3. **Reading at daemon startup aligns with how all other configuration is handled.** `configuration.ts` reads `settings.json` synchronously at module load time (see `readActiveServerFromSettingsFile`). The pattern is established: settings are stable for the lifetime of a daemon run.

**Concretely, the data flow becomes:**

```
~/.happier-dev/settings.json
        |
        | read once at daemon start
        v
readLocalMcpSettingsFromFile(configuration.settingsFile)
        |
        | returns ActionsSettingsV1 | null
        v
serialize to JSON string
        |
        | injected into daemon's process.env as HAPPIER_ACTIONS_SETTINGS_V1
        v (daemon process.env inherited by all child spawns via buildSpawnChildProcessEnv)
session runner child process
        |
        | isActionEnabledByEnv reads process.env.HAPPIER_ACTIONS_SETTINGS_V1
        v
MCP server (per request) — existing filter logic unchanged
```

Note: the daemon process itself does not run an MCP server. MCP servers are created inside session runner processes via `startHappyServer`. The env var propagation through `buildSpawnChildProcessEnv` (which does `{ ...processEnv, ...extraEnv }`) is the correct injection point.

**Alternative considered and rejected: read fresh per MCP request from file.**

This would require passing a file path or a reader function into `createHappierMcpServer` → `listBuiltInHappierTools` → `filterBuiltInToolsForSurface`. It would change the synchronous predicate `isActionEnabled: (id) => boolean` into an async one, which would require cascading async changes through `registerHappierMcpBuiltInTools`, `filterBuiltInToolsForSurface`, and `isActionAvailableOnToolSurface`. That is significant churn for a benefit (live reload without daemon restart) that is out of scope for v1.0.

---

### New vs Modified Components

**New: `readLocalMcpSettingsFromFile`** (suggested path: `apps/cli/src/settings/localMcpSettings.ts`)

Responsibility: Read `~/.happier-dev/settings.json` (or `configuration.settingsFile`), extract the tool-filter sub-key, validate it against `ActionsSettingsV1Schema`, and return a serialized JSON string suitable for `HAPPIER_ACTIONS_SETTINGS_V1`, or `null` if absent or invalid.

The file format decision: Two options exist.

**Option A — Standalone `~/.happier-dev/settings.json` with a top-level `mcpTools` key:**
```json
{
  "mcpTools": {
    "v": 1,
    "actions": {
      "session.title.set": { "enabled": false }
    }
  }
}
```
This keeps tool config separate from the existing internal `Settings` interface and avoids schema version conflicts.

**Option B — Extend the existing `Settings` interface with an `actionsSettings` field.**
This would reuse the already-versioned Settings migration path but risks coupling user-facing configuration to internal schema versioning.

**Recommendation: Option A.** The existing `Settings` object is an internal CLI persistence format with a migration system and schema version. A user-facing hand-edit file should have its own top-level key with its own validation, not be subject to CLI-internal migrations. The `readLocalMcpSettingsFromFile` function reads `configuration.settingsFile`, checks for the `mcpTools` key (or whatever key the team decides), validates it with `ActionsSettingsV1Schema.safeParse`, and returns the serialized JSON or `null`.

**Modified: `startDaemon.ts`** — after credentials are resolved and before the daemon enters its main loop, call `readLocalMcpSettingsFromFile` and inject the result into `process.env[ENV_KEY]` if not already set. This mirrors how `applyAccountSettingsToProcessEnv.ts` injects account settings into the process env.

The correct injection point is after `configuration` is ready (it already is at daemon startup) and before the first session spawn. The cleanest spot is immediately after `auth` is resolved (line ~226 in startDaemon.ts), before `spawnSession` is ever called.

**No changes required to:**
- `actionsSettings.ts` — `isActionEnabledByEnv` already reads from env and handles missing/invalid JSON gracefully
- `listBuiltInHappierTools.ts` — predicate-based, no path changes needed
- `registerHappierMcpBuiltInTools.ts` — no changes
- `createHappierMcpServer.ts` — no changes
- `startHappyServer.ts` — no changes
- `ActionsSettingsV1Schema` in protocol — already supports the target shape
- `buildSpawnChildProcessEnv.ts` — child processes inherit `process.env` which will contain the key

---

### Suggested Build Order

**Step 1: Schema + reader function** (`apps/cli/src/settings/localMcpSettings.ts`)

Implement `readLocalMcpSettingsFromFile(filePath: string): string | null`. This function is pure and synchronously reads the file, parses the `mcpTools` key, validates against `ActionsSettingsV1Schema`, and returns `JSON.stringify(result)` or `null`. Write unit tests with Vitest covering: file absent, file malformed JSON, `mcpTools` key absent, `mcpTools` key present and valid, and `mcpTools` key present but schema-invalid.

**Step 2: Daemon startup injection** (`apps/cli/src/daemon/startDaemon.ts`)

After `configuration` is available and before the first `spawnSession`, add:
```typescript
const serializedMcpSettings = readLocalMcpSettingsFromFile(configuration.settingsFile);
if (serializedMcpSettings !== null && !process.env[ENV_KEY]) {
  process.env[ENV_KEY] = serializedMcpSettings;
}
```
The guard `!process.env[ENV_KEY]` ensures an explicitly set env var (e.g. in tests or via shell) is not overridden by the file.

**Step 3: Document the settings.json format**

Add a `~/.happier-dev/settings.json.example` or equivalent inline doc comment showing the hand-edit format. Keep it minimal: only the `mcpTools` key, with a single example of disabling one action.

**Step 4: Integration smoke test**

Verify that a session runner child process correctly sees the `HAPPIER_ACTIONS_SETTINGS_V1` env var populated from the file. This is best tested by checking `process.env[ENV_KEY]` in the session runner after daemon spawn, or by observing the MCP tool list via the MCP inspector.

---

### Confidence Assessment

| Decision | Confidence | Evidence |
|----------|------------|---------|
| Daemon startup is the correct injection point | HIGH | Source-traced: child processes inherit daemon's `process.env` via `buildSpawnChildProcessEnv` |
| Env var is the correct transport | HIGH | `isActionEnabledByEnv` already reads env; no code changes needed downstream |
| Registration-time filter is correct (not dispatch-time) | HIGH | `listBuiltInHappierTools` called inside `createHappierMcpServer` which is per-request |
| Option A (standalone top-level key) for file format | MEDIUM | Based on architectural separation principle; team may prefer a different key name |
| `configuration.settingsFile` is the canonical path | MEDIUM | Path is `~/.happier/settings.json` by default, but milestone context says `~/.happier-dev/settings.json` — verify `HAPPIER_HOME_DIR` default in the deployed environment |

### Gaps

- The milestone context says `~/.happier-dev/settings.json` but `configuration.happyHomeDir` defaults to `~/.happier`. If the deployed `HAPPIER_HOME_DIR` is set to `~/.happier-dev`, they are the same path. Confirm the correct canonical path before implementing the reader.
- The `mcp` surface value exists in `BuiltInHappierToolsSurface` but `createHappierMcpServer` uses `session_agent`. The external MCP surface (`mcp`) appears unused by the session bridge. Confirm whether per-surface filtering for `mcp` vs `session_agent` is in scope for v1.0.
