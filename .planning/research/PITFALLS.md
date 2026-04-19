# Pitfalls: Adding settings.json Tool Configuration to the Happier MCP Bridge

**Domain:** CLI tool settings file (JSON config for MCP tool filtering)
**Researched:** 2026-04-18
**Overall confidence:** HIGH — all findings grounded in direct codebase inspection

---

## Pitfalls

| Pitfall | Risk | Prevention | Phase |
|---------|------|------------|-------|
| Silent failure on schema validation errors | HIGH | Use `safeParse` + warn to log, never swallow | Schema design |
| File-not-found treated as fatal error | HIGH | Treat missing file as "all tools enabled" (graceful default-open) | File reading |
| Tool name typos go unnoticed at startup | HIGH | Validate every name in config against `HAPPIER_BUILT_IN_TOOL_NAMES` at read time; log unknown names as warnings | Schema design |
| Breaking existing users who have no settings file | HIGH | Default must be all tools enabled; no settings file = no change in behavior | File reading |
| Config read on every MCP request instead of once | MEDIUM | Read file once at MCP server startup, not inside the per-request `createHappierMcpServer` call | Integration point |
| Precedence conflict between env var actions settings and file-based tool filter | MEDIUM | File controls which tools are registered; env `HAPPIER_ACTIONS_SETTINGS_V1` controls action enablement — document that these are orthogonal, not merged | Precedence design |
| `settings.json` key name collides with upstream schema evolution | MEDIUM | Use a namespaced key (`mcpToolsV1`) under the existing `settings.json` structure, not a new top-level file; audit upstream `Settings` interface before adding | Upstream compatibility |
| Config schema version not tracked | MEDIUM | Add a `v: 1` discriminant in the config blob from day one; enables safe future migrations | Schema design |
| Corrupt / partially written file causes startup failure | MEDIUM | Wrap `JSON.parse` in try-catch; treat `SyntaxError` as "file corrupt, fall back to defaults" and log a user-visible warning | File reading |
| Filter applied before dynamic tool catalog is resolved | MEDIUM | The tool catalog (`HAPPIER_BUILT_IN_TOOLS`) is built at import time from `listActionSpecs()`; filter must run after catalog is stable, i.e. inside `registerHappierMcpBuiltInTools` or its call site | Integration point |
| Per-request `createHappierMcpServer` creates a new filter on each HTTP call | LOW | Settings should be read once and passed as a frozen config object through `startHappyServer` → `createHappierMcpServer` → `registerHappierMcpBuiltInTools` | Integration point |
| File permissions allow world-read of tool preferences | LOW | `chmod 0600` on write, consistent with how `persistence.ts` handles `access.key` and `settings.json` | File reading |
| Settings file path hardcoded to `~/.happier-dev/` instead of `configuration.happyHomeDir` | LOW | Use `configuration.happyHomeDir` (already respects `HAPPIER_HOME_DIR` env override); never hardcode `~/.happier-dev` | Integration point |
| Upstream merge introduces a conflicting `mcpTools` field in `Settings` | LOW | Add the feature under a clearly fork-local namespace; track upstream `Settings` interface changes via `persistence.ts` diff on each upstream merge | Upstream compatibility |

---

## Critical Pitfalls (detail)

### 1. Silent failure on schema validation errors

**What goes wrong:** A user hand-edits `settings.json` and introduces a typo or wrong type. If the reader uses `JSON.parse` + a plain cast (no Zod validation), the invalid value silently becomes `undefined` mid-filter and all tools become enabled or disabled in unexpected ways.

**Why it happens:** The codebase already has a pattern for this — `readMcpServersSettingsFromAccountSettings` uses `McpServersSettingsV1Schema.safeParse` and falls back to `emptySettings()`. The same discipline must be applied here. The `actionsSettings.ts` reader does the same for `HAPPIER_ACTIONS_SETTINGS_V1`.

**Evidence:** Both `readMcpServersSettingsFromAccountSettings.ts` and `actionsSettings.ts` use `safeParse` with explicit fallback to safe defaults. Deviating from this pattern breaks the established invariant.

**Prevention:** Use Zod `safeParse`. On failure, log a user-visible warning to file (`logger.warn`) and fall back to enabling all tools. Never throw. Return a typed result so callers cannot ignore the parse outcome.

**Detection:** Warning in `~/.happier-dev/logs/` mentioning "settings.json schema invalid".

---

### 2. Tool name typos in config go unnoticed

**What goes wrong:** A user writes `"change-title": false` (hyphen instead of underscore). The filter finds no match in `HAPPIER_BUILT_IN_TOOL_NAMES`, silently keeps the tool enabled, and the user wonders why their config has no effect.

**Why it happens:** Filter-by-name approaches without explicit unknown-key detection are invisible errors.

**Evidence:** `HAPPIER_BUILT_IN_TOOL_NAMES` is already exported from `catalog.ts` as a frozen array of canonical tool names. Validation against this list is a one-liner.

**Prevention:** After parsing the config, iterate over every tool name in the config and check it against `HAPPIER_BUILT_IN_TOOL_NAMES`. Log an explicit warning for each name not found: `"settings.json: unknown tool name 'change-title' — did you mean 'change_title'?"`. This runs at startup only, not per request.

---

### 3. Breaking users who have no settings file

**What goes wrong:** New code path returns `[]` (empty allowed list) instead of `undefined` (no filter) when the file does not exist. Every existing user's MCP bridge suddenly exposes zero tools.

**Why it happens:** A filter that defaults to "deny all" is a safe-closed policy appropriate for security features. For a usability feature like tool visibility, the right default is "allow all" (no filter). The absence of a file must be explicitly handled as a distinct case from "file exists but specifies no tools".

**Evidence:** The existing `readMcpServersSettingsFromAccountSettings` pattern returns `emptySettings()` (no servers configured) rather than crashing or returning null. The same principle applies: missing file = `null` config = no filter applied.

**Prevention:** Reader function must return a discriminated union: `{ found: false }` vs `{ found: true; config: McpToolsConfigV1 }`. The caller applies the filter only when `found === true`.

---

### 4. `settings.json` key collision with upstream schema evolution

**What goes wrong:** This fork adds a new top-level key (e.g. `mcpTools`) to `~/.happier-dev/settings.json`. Upstream later adds a key with the same name but different semantics. On the next upstream merge, the settings migration code conflicts or silently reinterprets the fork-local data.

**Why it happens:** The upstream `Settings` interface in `persistence.ts` is versioned (`SUPPORTED_SCHEMA_VERSION = 6`) with explicit migration steps. Adding to it in the fork creates a merge conflict zone.

**Evidence:** `persistence.ts` contains a `migrateSettings` function with version-gated migrations from v2 through v6. Each migration deletes or renames keys. A fork-local addition that isn't aware of upstream migrations can be silently wiped.

**Prevention options (pick one):**
- Option A (preferred for v1.0): Use a separate file, `~/.happier-dev/happier-settings.json`, outside the upstream `Settings` object entirely. No migration logic needed. Zero merge conflict risk.
- Option B: Add the key under a namespaced umbrella (e.g. `forkLocalV1`) in `Settings` and add a guard in the migration runner that preserves it across versions.

Option A is lower risk for v1.0. The milestone scope says "hand-edit only" and "user-global settings first", which does not require tight integration with the existing `Settings` migration chain.

---

## Moderate Pitfalls (detail)

### 5. Precedence conflict: env var vs file config

**What goes wrong:** A developer sets `HAPPIER_ACTIONS_SETTINGS_V1` to disable an action. The file-based config enables the corresponding tool. They conflict. The behavior is undefined.

**Clarification of the actual layering:** The env-based `actionsSettings` system controls whether an *action* is enabled for a surface (this drives `isActionEnabledByEnv`). The proposed file-based config controls whether an MCP tool *name* is registered at all. These are orthogonal:

- Env setting: "is this action allowed to execute?"
- File setting: "is this tool name exposed in the MCP tool list?"

A tool can be listed but its underlying action disabled by env. A tool can be hidden from the MCP list even if its action is env-enabled.

**Prevention:** Document this precedence explicitly in the settings file schema comment and in the code. Do not merge or "override" the two systems. The file filter runs at registration time (`registerHappierMcpBuiltInTools`); the env action check runs at dispatch time (`dispatchBuiltInHappierTool`). Keep them at their natural call sites.

---

### 6. Config read on every MCP request

**What goes wrong:** `startHappyServer.ts` creates a fresh `createHappierMcpServer` on every HTTP request (this is by design for stateless transports). If file reading is done inside `createHappierMcpServer`, the settings file is stat'd and parsed on every incoming MCP call, adding I/O latency and making the daemon sensitive to file system errors mid-session.

**Evidence:** `startHappyServer.ts` line 57: `const { mcp } = createHappierMcpServer(client, ...)` is inside the `createServer` handler. The comment at line 51 explains this is intentional for stateless transport reasons.

**Prevention:** Read the settings file once in `startHappyServer` before the HTTP server is created. Pass the resolved tool filter (a frozen set of enabled tool names, or `null` for "no filter") as a parameter through `startHappierMcpServer` → `createHappierMcpServer` → `registerHappierMcpBuiltInTools`. The filter is immutable for the lifetime of the MCP server instance.

---

### 7. `configuration.happyHomeDir` ignored

**What goes wrong:** New code hardcodes `path.join(os.homedir(), '.happier-dev', 'happier-settings.json')`. A user who has set `HAPPIER_HOME_DIR=/opt/happier` to isolate their config gets the file read from the wrong location.

**Evidence:** `configuration.ts` line 230-235 shows `HAPPIER_HOME_DIR` overrides the default home directory. `configuration.happyHomeDir` is the canonical source of truth.

**Prevention:** Always derive the settings file path from `configuration.happyHomeDir`. Never import `os.homedir()` in new settings-reading code.

---

## Minor Pitfalls

### 8. Schema version not tracked from day one

**What goes wrong:** v1 ships with no version discriminant in the settings blob. When v2 needs to change the shape (e.g. add per-surface tool overrides), there is no way to distinguish an old file from a new one without heuristic detection.

**Prevention:** Include `"v": 1` in the Zod schema from the start. This is zero cost now and eliminates an entire class of future migration bugs.

---

### 9. Filter applied to dynamic action-backed tools incorrectly

**What goes wrong:** `catalog.ts` builds `HAPPIER_BUILT_IN_TOOLS` by combining `MANUAL_TOOLS` with `buildActionBackedTools()` (which calls `listActionSpecs()` at import time). A naive filter that only checks against `MANUAL_TOOLS` names would silently pass all action-backed tool names through.

**Prevention:** The filter must operate on the final merged `HAPPIER_BUILT_IN_TOOLS` array (post-dedup), not on either subset. Use `HAPPIER_BUILT_IN_TOOL_NAMES` as the validation source.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|----------------|------------|
| Schema design | No version discriminant → future migration pain | Add `v: 1` to Zod schema from the start |
| File reader implementation | Missing file treated as error | Return `{ found: false }` discriminant; caller enables all tools |
| File reader implementation | Corrupt file causes startup crash | Wrap in try-catch; log warning; fall back to all-enabled |
| Validation | Unknown tool names silently ignored | Check all configured names against `HAPPIER_BUILT_IN_TOOL_NAMES`; warn on mismatch |
| Integration into `registerHappierMcpBuiltInTools` | Filter runs per-request instead of per-startup | Read file in `startHappyServer`, pass as frozen param |
| Precedence documentation | Devs assume file overrides env settings | Document orthogonality of file filter vs `HAPPIER_ACTIONS_SETTINGS_V1` |
| Upstream merge | Fork key collides with upstream `Settings` migration | Use separate `happier-settings.json` file or a clearly namespaced key |
| File path resolution | Hardcoded `~/.happier-dev` ignores `HAPPIER_HOME_DIR` | Use `configuration.happyHomeDir` exclusively |

---

## Sources

All findings are grounded in direct codebase inspection (HIGH confidence):

- `apps/cli/src/persistence.ts` — existing `Settings` schema, `migrateSettings`, `SUPPORTED_SCHEMA_VERSION = 6`, and file-reading patterns
- `apps/cli/src/configuration.ts` — `happyHomeDir`, `HAPPIER_HOME_DIR` env override, `settingsFile` derivation
- `apps/cli/src/mcp/servers/readMcpServersSettingsFromAccountSettings.ts` — established `safeParse` + fallback pattern
- `apps/cli/src/settings/actionsSettings.ts` — env-based settings precedence, `safeParse` + silent-fallback pattern
- `apps/cli/src/mcp/startHappyServer.ts` — per-request `createHappierMcpServer` construction (integration point)
- `apps/cli/src/mcp/server/registerHappierMcpBuiltInTools.ts` — where tool registration happens (correct insertion point for filter)
- `apps/cli/src/agent/tools/happierTools/catalog.ts` — `HAPPIER_BUILT_IN_TOOLS`, `HAPPIER_BUILT_IN_TOOL_NAMES`, dynamic action-backed tool construction
- `apps/cli/src/agent/tools/happierTools/listBuiltInHappierTools.ts` — surface-based tool filtering using `isActionEnabledByEnv`
- `apps/cli/src/agent/tools/happierTools/actionToolCatalog.ts` — `filterBuiltInToolsForSurface`, surface-checking logic
