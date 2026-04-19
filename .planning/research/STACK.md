# Stack Analysis: MCP Tool Configuration via settings.json

**Project:** Happier — MCP Tool Configuration (v1.0 milestone)
**Researched:** 2026-04-18
**Scope:** What stack additions or changes are needed to read per-tool enable/disable config from `~/.happier-dev/settings.json` at MCP server startup?

---

## Stack Analysis

### Existing (no changes needed)

**File I/O primitives — already in use in `apps/cli/src/persistence.ts`**
- `node:fs/promises` (`readFile`, `writeFile`, `mkdir`, `existsSync`, `stat`) — used throughout
- `node:path` (`join`, `dirname`) — used throughout
- `node:os` (`homedir`) — used via `configuration.ts`
- Pattern: `existsSync(path)` → `readFile(path, 'utf8')` → `JSON.parse(content)` — see `readSettings()` in `persistence.ts:302–362`

**Schema validation — already in use**
- `zod` (v4.3.6, pinned workspace-wide) — used for all config parsing
- `ActionsSettingsV1Schema` from `@happier-dev/protocol` — already parses and validates the per-action enable/disable structure used by the existing `HAPPIER_ACTIONS_SETTINGS_V1` env var flow
- `ActionsSettingsV1` TypeScript type already inferred from that schema

**Settings resolution infrastructure — already in use**
- `configuration.happyHomeDir` (`~/.happier`, overridable via `HAPPIER_HOME_DIR` env) — canonical home dir accessor, see `configuration.ts:229–236`
- `configuration.settingsFile` — resolves to `join(happyHomeDir, 'settings.json')` — see `configuration.ts:239`
- `readSettings()` in `persistence.ts` — full async read + migrate + merge pattern already established

**Actions enablement layer — already in use**
- `isActionEnabledByActionsSettings()` in `@happier-dev/protocol` — core per-action predicate
- `isActionEnabledByEnv()` in `apps/cli/src/settings/actionsSettings.ts` — wraps env-var-based settings into the same predicate interface
- `listBuiltInHappierTools({ surface })` in `apps/cli/src/agent/tools/happierTools/listBuiltInHappierTools.ts` — accepts a custom `isActionEnabled` predicate and filters the tool list; currently hardwired to call `isActionEnabledByEnv`
- `filterBuiltInToolsForSurface()` in `actionToolCatalog.ts` — the underlying filter function, takes an injected predicate

**MCP registration entry point — already in use**
- `registerHappierMcpBuiltInTools()` in `apps/cli/src/mcp/server/registerHappierMcpBuiltInTools.ts` — calls `listBuiltInHappierTools({ surface })` at registration time; tool list is resolved once per call
- `createHappierMcpServer()` in `apps/cli/src/mcp/createHappierMcpServer.ts` — calls `registerHappierMcpBuiltInTools`; this is where the surface and `isActionEnabled` predicate chain is assembled
- `startHappyServer()` in `apps/cli/src/mcp/startHappyServer.ts` — the HTTP server entry point; calls `createHappierMcpServer` per request (stateless mode)

### Additions needed

**New function: `readMcpToolSettingsFromFile()`**
- Location: `apps/cli/src/settings/actionsSettings.ts` (extend existing file) or a new `apps/cli/src/settings/mcpToolSettings.ts`
- Responsibility: read `configuration.settingsFile`, extract the `mcpTools` (or equivalent top-level key — TBD by roadmap), parse it with `ActionsSettingsV1Schema` or a purpose-built Zod schema, return a typed settings object
- Pattern to follow exactly: `readSettings()` in `persistence.ts` — `existsSync` guard → async `readFile` → `JSON.parse` → `safeParse` → fallback to defaults on any error
- This is ~20 lines of new code; no new dependencies

**New top-level key in `settings.json` format**
- The existing `settings.json` structure (governed by the `Settings` interface in `persistence.ts`) does not include a `mcpTools` or `actionsSettings` key
- A new optional field must be added to the `Settings` interface and to `defaultSettings`, following the existing `memory?: unknown` pattern (store as opaque, parse in the settings module)
- No schema version bump is strictly required for a purely additive optional field (existing `migrateSettings` is forward-compatible), but `SUPPORTED_SCHEMA_VERSION` bump is conventional if the field is expected to be read-back — confirm in roadmap

**Wire the file-read result into the MCP startup predicate**
- `listBuiltInHappierTools()` currently calls `isActionEnabledByEnv()` directly (hardwired)
- The function already accepts `isActionEnabled` as an injected predicate via `filterBuiltInToolsForSurface()` — but `listBuiltInHappierTools` does not yet expose a parameter to override it
- Option A (minimal): add an optional `isActionEnabled?` override parameter to `listBuiltInHappierTools()`, then pass a file-read predicate from `startHappyServer()` or `createHappierMcpServer()`
- Option B (preferred for clarity): call the new `readMcpToolSettingsFromFile()` inside `createHappierMcpServer()` and pass a derived predicate directly to `registerHappierMcpBuiltInTools()` — `registerHappierMcpBuiltInTools` already accepts any surface/deps and calls `listBuiltInHappierTools` internally, so the injection point is one level up

### Integration points

**Where to read the file (HIGH confidence)**
- `startHappyServer()` (`apps/cli/src/mcp/startHappyServer.ts`) — HTTP server entry point; called once at MCP startup. Reading the file here (once, before the HTTP server loop) is the correct startup-time integration point. The result is passed into `createHappierMcpServer` via existing opts pattern.
- Do NOT read inside the per-request handler (`createHappierMcpServer` is called per HTTP request in stateless mode); read once at server startup and pass the loaded config down.

**What predicate to inject (HIGH confidence)**
- `isActionEnabledByActionsSettings(actionId, loadedSettings, { surface: 'mcp' })` from `@happier-dev/protocol` — this is the canonical predicate and already handles the `disabledSurfaces`, `enabled: false`, and per-placement logic
- Surface key to use for the external MCP bridge: `'mcp'` (defined in `BuiltInHappierToolsSurface` — `'mcp' | 'cli' | 'session_agent'`) as distinct from `'session_agent'` which is the in-session surface

**File path (MEDIUM confidence — discrepancy flagged)**
- The milestone context document references `~/.happier-dev/settings.json`
- The codebase uses `~/.happier/settings.json` (see `configuration.ts:235`: `join(homedir(), '.happier')`) overridable via `HAPPIER_HOME_DIR` env var
- `configuration.settingsFile` is the correct reference — do not hardcode the path; always use `configuration.settingsFile`
- **ACTION REQUIRED:** Confirm with the roadmap author whether the milestone intended the existing `settings.json` at `~/.happier/` or a separate file at `~/.happier-dev/`. The codebase evidence strongly points to `~/.happier/settings.json`.

**Zod schema reuse (HIGH confidence)**
- `ActionsSettingsV1Schema` in `@happier-dev/protocol` is already the correct schema for per-action enable/disable overrides; it handles `enabled: false`, `disabledSurfaces`, and legacy id normalization
- No new schema is needed if the settings file uses the same `{ v: 1, actions: { "<actionId>": { "enabled": false } } }` envelope that the existing env-var flow already parses
- If a simpler `{ mcpTools: { "<toolName>": { "enabled": false } } }` shape is preferred for hand-editability, a new Zod schema is needed — but this is a UX decision for the roadmap, not a stack gap

**Error handling (HIGH confidence)**
- Follow `readActionsSettingsFromEnv()` pattern: on any JSON parse or schema validation error, log a warning and return defaults (all tools enabled) — never throw at startup
- Use `logger.warn()` (file-based logger, not console) per CLI logging conventions

---

## Sources

- `apps/cli/src/persistence.ts` — `readSettings()` pattern (lines 302–362): verified codebase read
- `apps/cli/src/settings/actionsSettings.ts` — `readActionsSettingsFromEnv()` and `isActionEnabledByEnv()`: verified codebase read
- `apps/cli/src/configuration.ts` — `happyHomeDir` (line 235), `settingsFile` (line 239): verified codebase read
- `apps/cli/src/agent/tools/happierTools/listBuiltInHappierTools.ts` — predicate injection point: verified codebase read
- `apps/cli/src/agent/tools/happierTools/actionToolCatalog.ts` — `filterBuiltInToolsForSurface()`: verified codebase read
- `apps/cli/src/mcp/server/registerHappierMcpBuiltInTools.ts` — tool registration entry point: verified codebase read
- `apps/cli/src/mcp/createHappierMcpServer.ts` — MCP server assembly: verified codebase read
- `apps/cli/src/mcp/startHappyServer.ts` — HTTP startup entry point: verified codebase read
- `packages/protocol/src/actions/actionSettings.ts` — `ActionsSettingsV1Schema`, `isActionEnabledByActionsSettings()`: verified codebase read
