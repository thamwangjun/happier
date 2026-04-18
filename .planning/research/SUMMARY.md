# Research Summary: MCP Tool Configuration (v1.0)

**Project:** Happier — MCP Tool Configuration
**Domain:** CLI settings file — per-tool enable/disable for the MCP bridge
**Researched:** 2026-04-18
**Confidence:** HIGH

---

## Stack additions

No new runtime dependencies are needed. All primitives exist:

- `node:fs/promises` + `node:path` + `node:os` — already used in `persistence.ts`
- `zod` v4.3.6 — already used for all config parsing
- `ActionsSettingsV1Schema` from `@happier-dev/protocol` — already handles the per-action `enabled: false` / `disabledSurfaces` structure
- `configuration.settingsFile` — already resolves `HAPPIER_HOME_DIR/settings.json`
- `HAPPIER_BUILT_IN_TOOL_NAMES` from `catalog.ts` — already exported for name validation

**New code required:** one ~20-line reader function (`readMcpToolSettingsFromFile`) and a Zod schema (`McpToolsSettingsV1Schema`). No new packages.

---

## Feature table stakes

| Feature | Rationale |
|---------|-----------|
| Per-tool `enabled: false` by exact tool name | The foundational ask; must work before anything else |
| All tools on by default (opt-out, not opt-in) | Existing users must see no behavior change if they have no settings file |
| Settings read from `configuration.settingsFile` | Consistent with existing `Settings` infrastructure; respects `HAPPIER_HOME_DIR` override |
| Graceful handling of missing or corrupt file | Missing = all enabled; corrupt JSON = log warning + all enabled; never crash |
| Settings take effect at MCP server startup | Consistent with existing `HAPPIER_ACTIONS_SETTINGS_V1` env-read pattern |
| JSON format, hand-editable | Explicitly required by PROJECT.md; no UI in v1.0 |
| Schema version discriminant `v: 1` in the blob | Zero-cost now; required for any future migration |

**Defer to v2+:** per-project overrides, hot-reload, wildcard/glob matching, UI editor, category-based grouping, explicit opt-in allowlist mode.

---

## Settings format

**Recommended key:** `mcpToolsSettingsV1` — matches the `actionsSettingsV1` / `mcpServersSettingsV1` naming convention already established in the codebase.

```json
{
  "schemaVersion": 6,
  "mcpToolsSettingsV1": {
    "v": 1,
    "tools": {
      "change_title": { "enabled": false },
      "execution_run_start": { "enabled": false }
    }
  }
}
```

**Field semantics:**

| Field | Type | Default | Meaning |
|-------|------|---------|---------|
| `mcpToolsSettingsV1.v` | `1` (literal) | required | Schema version |
| `mcpToolsSettingsV1.tools` | `Record<string, { enabled: boolean }>` | `{}` | Per-tool overrides; absent key = tool enabled |
| `tools["<name>"].enabled` | `boolean` | `true` (implicit) | `false` hides the tool from the MCP surface |

**Zod schema pattern** (mirrors `ActionsSettingsV1Schema`):

```typescript
export const McpToolsSettingsV1Schema = z
  .object({
    v: z.literal(1),
    tools: z.record(z.string(), z.object({ enabled: z.boolean().optional() }).strict()).default({}),
  })
  .passthrough();
```

Unknown tool names: silently ignore in the filter; log at DEBUG in the reader (not per-request). This matches `ActionsSettingsV1Schema` behavior and ecosystem standards (Claude Code, OpenCode).

**Rejected alternatives:**

- Flat denylist array — loses extensibility, can't carry per-tool metadata later
- New separate file (`happier-settings.json`) — cleaner upstream isolation (PITFALLS.md recommends this as Option A), but splits the user's mental model; the `mcpToolsSettingsV1` namespaced key in the existing file is the better v1.0 tradeoff
- Extending `Settings` interface directly (no new key) — risks silent wipe by upstream `migrateSettings` version steps

---

## Architecture recommendation

**Read once at `startHappyServer.ts`, pass as a frozen param — not at daemon startup via env var.**

The current filter chain is:

```
startHappyServer (one MCP HTTP server instance per session runner)
  └─ createHappierMcpServer  [called once per HTTP request — stateless transport]
       └─ registerHappierMcpBuiltInTools
            └─ listBuiltInHappierTools({ surface: 'session_agent' })
                 └─ filterBuiltInToolsForSurface(HAPPIER_BUILT_IN_TOOLS, { isActionEnabled })
```

**Recommended data flow:**

```
configuration.settingsFile
  └─ read once in startHappyServer (before HTTP server loop)
       └─ readMcpToolSettingsFromFile(path) → McpToolsSettingsV1 | null
            └─ derive isMcpToolEnabled(name) predicate
                 └─ passed into createHappierMcpServer → registerHappierMcpBuiltInTools
                      └─ applied inside filterBuiltInToolsForSurface (after existing surface filter)
```

**Why this approach over ARCHITECTURE.md's env-var injection at daemon startup:**

- The env-var approach (inject `HAPPIER_ACTIONS_SETTINGS_V1` from `startDaemon.ts`) touches the daemon startup path and merges tool-visibility config with action-enablement config, making the two orthogonal concerns harder to reason about.
- The param approach is more surgical: one read in `startHappyServer`, one new parameter through the existing call chain. No daemon changes, no env pollution.
- PITFALLS.md explicitly calls out that file filter (registration-time) and env action check (dispatch-time) are orthogonal and should stay separate.

**Conflict to resolve:** ARCHITECTURE.md notes that `createHappierMcpServer` currently passes surface `'session_agent'`, not `'mcp'`, to `listBuiltInHappierTools`. The `mcp` surface key exists in `BuiltInHappierToolsSurface` but is unused in the current session bridge. The roadmapper must decide: filter against `'mcp'` surface (semantically correct) or `'session_agent'` (current runtime surface). This is open question 2 below.

**Build order:**

1. `McpToolsSettingsV1Schema` + `isMcpToolEnabled` (pure, testable — in `apps/cli/src/settings/` or `packages/protocol`)
2. `readMcpToolSettingsFromFile` reader function (thin file I/O wrapper — `apps/cli/src/settings/mcpToolSettings.ts`)
3. Wire into `startHappyServer.ts` — read once before server starts, pass predicate into `createHappierMcpServer`
4. Apply predicate inside `filterBuiltInToolsForSurface` or as additional post-filter in `registerHappierMcpBuiltInTools`
5. Unit tests: missing file, corrupt file, valid config, unknown tool names
6. Log unknown tool names at startup (DEBUG level, single pass, not per-request)

**No changes required to:** `actionsSettings.ts`, `listBuiltInHappierTools.ts`, `registerHappierMcpBuiltInTools.ts`, `ActionsSettingsV1Schema`, `buildSpawnChildProcessEnv.ts`, `startDaemon.ts`.

---

## Watch out for

1. **Missing file treated as error (HIGH risk).** The reader must return a typed `{ found: false }` or `null` when the file is absent. The caller enables all tools in this case. A default-deny behavior would silently break every existing user's MCP bridge. Prevention: discriminated return type; caller only applies filter when settings were found.

2. **Corrupt JSON causes startup crash (HIGH risk).** Wrap `JSON.parse` and Zod `safeParse` in try-catch. On any failure: log a user-visible warning to file, return `null` (all enabled). Never throw. Pattern already established in `readMcpServersSettingsFromAccountSettings.ts` and `actionsSettings.ts`.

3. **Tool name typos silently ignored (HIGH risk).** After parsing, check every configured name against `HAPPIER_BUILT_IN_TOOL_NAMES`. Log a warning for each unknown name (`"settings.json: unknown tool name 'change-title' — did you mean 'change_title'?"`). Run at startup only, not per request.

4. **Upstream Settings migration wipes the new key (MEDIUM risk).** The `migrateSettings` function in `persistence.ts` has version-gated steps that delete and rename keys. Prevention: use a namespaced key (`mcpToolsSettingsV1`) and add a guard in `migrateSettings` that preserves it; or track upstream `persistence.ts` diffs on each merge.

5. **Config read on every MCP request (MEDIUM risk).** `createHappierMcpServer` is called per HTTP request in stateless mode. File I/O inside that path adds latency and failure modes at the worst moment. Prevention: read the settings file once in `startHappyServer` before the HTTP server loop, then pass the resolved predicate into each `createHappierMcpServer` call.

---

## Open questions requiring user decision

1. **Canonical settings file path:** The milestone context says `~/.happier-dev/settings.json`. The codebase `configuration.happyHomeDir` defaults to `~/.happier` (overridable via `HAPPIER_HOME_DIR`). Are these the same path in production? The implementation must use `configuration.settingsFile` regardless, but user-facing docs need the correct path. **Confirm before writing any format examples or documentation.**

2. **Surface key for filtering:** Should the MCP tool filter apply when `surface === 'mcp'` or `surface === 'session_agent'`? Currently `createHappierMcpServer` uses `'session_agent'`. The `'mcp'` value exists in `BuiltInHappierToolsSurface` but is unused in the session bridge. **Decide which surface the new filter targets before implementation.**

3. **Key location: existing settings.json vs separate file:** Three research files recommend using the existing `settings.json` with a namespaced key (`mcpToolsSettingsV1`). PITFALLS.md recommends a separate file (`happier-settings.json`) to eliminate upstream merge conflict risk entirely. Tradeoff: namespaced key in existing file (simpler UX, some merge risk) vs separate file (zero merge risk, split mental model).

4. **Schema location:** Define `McpToolsSettingsV1Schema` in `packages/protocol` (accessible to all packages, consistent with `ActionsSettingsV1Schema`) or in `apps/cli/src/settings/` (local to CLI, avoids protocol package churn)? The protocol package is correct if the schema is ever needed by server or mobile app; `apps/cli` is correct if this is purely a local CLI concern for v1.0.

---

*Research completed: 2026-04-18*
*Ready for roadmap: yes — pending resolution of open questions 1 and 2 before implementation begins*
