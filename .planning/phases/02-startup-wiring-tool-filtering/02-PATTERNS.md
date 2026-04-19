# Phase 2: Startup Wiring & Tool Filtering - Pattern Map

**Mapped:** 2026-04-19
**Files analyzed:** 8
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `apps/cli/src/settings/sessionAgentToolsSettings.ts` | utility (rename+extend) | transform | `apps/cli/src/settings/mcpToolsSettings.ts` | exact (is the file) |
| `apps/cli/src/persistence.ts` | config | CRUD | self (field rename only) | exact |
| `apps/cli/src/mcp/startHappyServer.ts` | service (startup wiring) | request-response | self (extends existing startup logic) | exact |
| `apps/cli/src/mcp/createHappierMcpServer.ts` | service (factory) | request-response | self (extends existing opts threading) | exact |
| `apps/cli/src/mcp/server/registerHappierMcpBuiltInTools.ts` | utility (registration) | transform | self (extends existing registration loop) | exact |
| `apps/cli/src/mcp/server/registerHappierMcpBuiltInTools.test.ts` | test (NEW FILE) | — | `apps/cli/src/settings/mcpToolsSettings.test.ts` | role-match |
| `apps/cli/src/settings/sessionAgentToolsSettings.test.ts` | test (rename+update) | — | `apps/cli/src/settings/mcpToolsSettings.test.ts` | exact (is the file) |
| `apps/cli/src/mcp/createHappierMcpServer.test.ts` | test (extend) | — | self | exact |
| `apps/cli/src/mcp/startHappyServer.integration.test.ts` | test (extend) | — | self | exact |

---

## Pattern Assignments

### `apps/cli/src/settings/sessionAgentToolsSettings.ts` (rename + add predicate helper)

**Analog:** `/home/thamw/development/happier/happier/apps/cli/src/settings/mcpToolsSettings.ts` (this is the file)

**Current file header comment** (lines 1-8) — update to reflect new names:
```typescript
/**
 * Session-agent tool enable/disable configuration (CLI-local settings)
 *
 * Defines the SessionAgentToolsSettingsV1 schema and reader function.
 * The schema is validated from the `sessionAgentToolsSettingsV1` field in ~/.happier/settings.json.
 * The reader accepts an already-loaded Settings object (not a file path) so it stays pure
 * and testable without filesystem access.
 */
```

**Rename map — all identifiers to change** (lines 14–48):
- `McpToolsSettingsV1Schema` → `SessionAgentToolsSettingsV1Schema`
- `McpToolsSettingsV1` (type) → `SessionAgentToolsSettingsV1`
- `DEFAULT_MCP_TOOLS_SETTINGS` → `DEFAULT_SESSION_AGENT_TOOLS_SETTINGS`
- `readMcpToolsSettingsV1` → `readSessionAgentToolsSettingsV1`
- `settings.mcpToolsSettingsV1` → `settings.sessionAgentToolsSettingsV1` (line 38)
- warn message `[mcpToolsSettings] mcpToolsSettingsV1 failed schema validation` → `[sessionAgentToolsSettings] sessionAgentToolsSettingsV1 failed schema validation` (line 44)

**New export to add** — predicate builder function, append after `readSessionAgentToolsSettingsV1`:
```typescript
/**
 * Builds the isSessionAgentToolEnabled predicate from a parsed settings blob.
 *
 * Returns true for any tool absent from the tools map (opt-out model, SCHEMA-02).
 * Returns true when enabled === true. Returns false when enabled === false.
 * Never throws.
 */
export function buildIsSessionAgentToolEnabled(
    settings: SessionAgentToolsSettingsV1,
): (toolName: string) => boolean {
    return (toolName: string) => settings.tools[toolName]?.enabled !== false;
}
```

**Schema structure** (lines 14–23) — preserve exactly, only rename export:
```typescript
export const SessionAgentToolsSettingsV1Schema = z.preprocess(
    (raw) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
        return raw;
    },
    z.object({
        v: z.literal(1).default(1 as const),
        tools: z.record(z.string(), z.object({ enabled: z.boolean() })).default({}),
    }),
);
```

---

### `apps/cli/src/persistence.ts` (field rename + JSDoc update)

**Analog:** `/home/thamw/development/happier/happier/apps/cli/src/persistence.ts` (self)

**Field to rename** (lines 113–118) — change the `Settings` interface entry:

Current (line 113–118):
```typescript
  /**
   * Per-tool MCP enable/disable configuration (CLI-local; schema-validated).
   * Parsed/normalized by `settings/mcpToolsSettings.ts`.
   * Stored as raw JSON — always access via `readMcpToolsSettingsV1(settings)`.
   */
  mcpToolsSettingsV1?: unknown;
```

After change:
```typescript
  /**
   * Per-tool session-agent enable/disable configuration (CLI-local; schema-validated).
   * Parsed/normalized by `settings/sessionAgentToolsSettings.ts`.
   * Stored as raw JSON — always access via `readSessionAgentToolsSettingsV1(settings)`.
   */
  sessionAgentToolsSettingsV1?: unknown;
```

No other changes to `persistence.ts`. The `readSettings()` and `writeSettings()` functions do not reference this field by name.

---

### `apps/cli/src/mcp/startHappyServer.ts` (startup wiring)

**Analog:** `/home/thamw/development/happier/happier/apps/cli/src/mcp/startHappyServer.ts` (self)

**Imports to add** at top of file (after existing imports, lines 1–11):
```typescript
import { readSettings } from '@/persistence';
import { readSessionAgentToolsSettingsV1, buildIsSessionAgentToolEnabled } from '@/settings/sessionAgentToolsSettings';
```

**Startup wiring** — replace the `toolNamesSnapshot` line (currently line 38) with settings read + predicate computation. New block inserted at the top of `startHappyServer`, before `keepAliveIntervalMs`:

Current (line 38):
```typescript
    const toolNamesSnapshot = listBuiltInHappierTools({ surface: 'session_agent' }).map((tool) => tool.name);
```

After change:
```typescript
    // Read settings once at startup (STARTUP-01); predicate is computed here and reused per-request.
    const settings = await readSettings();
    const toolsSettings = readSessionAgentToolsSettingsV1(settings);
    const isSessionAgentToolEnabled = buildIsSessionAgentToolEnabled(toolsSettings);

    // Snapshot filtered toolNames at startup — only enabled tools (D-06).
    const toolNamesSnapshot = listBuiltInHappierTools({ surface: 'session_agent' })
        .filter((tool) => isSessionAgentToolEnabled(tool.name))
        .map((tool) => tool.name);
```

**Per-request createHappierMcpServer call** — add `isSessionAgentToolEnabled` to opts (currently lines 57–59):

Current:
```typescript
        const { mcp } = createHappierMcpServer(client, {
            credentials: opts?.credentials ?? null,
        });
```

After change:
```typescript
        const { mcp } = createHappierMcpServer(client, {
            credentials: opts?.credentials ?? null,
            isSessionAgentToolEnabled,      // computed once above; reused per request (D-04)
        });
```

**Note on async:** `readSettings()` is async. The outer `startHappyServer` body is already `async` (line 32), and the `await` can be placed before `createServer(...)` is called — the same slot used by the existing `server.listen(0, ...)` promise at lines 107–112. Place the `await readSettings()` at the very start of the function body, before `const keepAliveIntervalMs`.

---

### `apps/cli/src/mcp/createHappierMcpServer.ts` (opts extension + predicate threading)

**Analog:** `/home/thamw/development/happier/happier/apps/cli/src/mcp/createHappierMcpServer.ts` (self)

**Opts type extension** (line 28) — extend the existing `Readonly<{...}>` opts type:

Current (line 27–29):
```typescript
export function createHappierMcpServer(
  client: HappyMcpSessionClient,
  opts?: Readonly<{ credentials?: Credentials | null }>,
```

After change:
```typescript
export function createHappierMcpServer(
  client: HappyMcpSessionClient,
  opts?: Readonly<{
      credentials?: Credentials | null;
      isSessionAgentToolEnabled?: (toolName: string) => boolean;
  }>,
```

**Comment at registerHappierMcpResources** (currently line 159):
```typescript
  // resources use their own isActionEnabled callback — not subject to sessionAgentToolsSettingsV1 filtering
  registerHappierMcpResources(mcp as any, {
```

**Thread predicate into registerHappierMcpBuiltInTools** (currently lines 173–197):

Current call (line 173):
```typescript
  const { toolNames } = registerHappierMcpBuiltInTools(mcp as any, {
    sessionId: client.sessionId,
    surface: toolSurface,
    deps: { ... },
  });
```

After change — add `isSessionAgentToolEnabled` param:
```typescript
  const { toolNames } = registerHappierMcpBuiltInTools(mcp as any, {
    sessionId: client.sessionId,
    surface: toolSurface,
    isSessionAgentToolEnabled: opts?.isSessionAgentToolEnabled,
    deps: { ... },
  });
```

No other changes to this file.

---

### `apps/cli/src/mcp/server/registerHappierMcpBuiltInTools.ts` (apply predicate)

**Analog:** `/home/thamw/development/happier/happier/apps/cli/src/mcp/server/registerHappierMcpBuiltInTools.ts` (self)

**Params type extension** (lines 11–17) — add optional predicate field:

Current:
```typescript
    params: Readonly<{
        sessionId: string;
        surface: BuiltInHappierToolsSurface;
        deps: DispatchDeps;
        resolveSessionId?: (toolArgs: unknown) => string;
    }>,
```

After change:
```typescript
    params: Readonly<{
        sessionId: string;
        surface: BuiltInHappierToolsSurface;
        deps: DispatchDeps;
        resolveSessionId?: (toolArgs: unknown) => string;
        isSessionAgentToolEnabled?: (toolName: string) => boolean;
    }>,
```

**Registration loop** (line 19) — replace single `listBuiltInHappierTools` call with filtered variant:

Current (line 19):
```typescript
  const enabledTools = listBuiltInHappierTools({ surface: params.surface });
```

After change:
```typescript
    const allTools = listBuiltInHappierTools({ surface: params.surface });
    const predicate = params.isSessionAgentToolEnabled ?? (() => true);
    const enabledTools = allTools.filter((tool) => predicate(tool.name));
```

**Return value** (line 68) — unchanged; `enabledTools.map((tool) => tool.name)` already uses the filtered list:
```typescript
    return { toolNames: enabledTools.map((tool) => tool.name) };
```

---

### `apps/cli/src/mcp/server/registerHappierMcpBuiltInTools.test.ts` (NEW FILE)

**Analog:** `/home/thamw/development/happier/happier/apps/cli/src/settings/mcpToolsSettings.test.ts`

**File header pattern** — copy from mcpToolsSettings.test.ts:
```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
```

No filesystem needed for this unit test. Mock `registerTool` directly (same approach as `createHappierMcpServer.test.ts` lines 225–254).

**Core test pattern** — use `vi.doMock` then dynamic import; capture `registerTool` calls:
```typescript
describe('registerHappierMcpBuiltInTools', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it('registers all session_agent tools when no predicate is provided', async () => {
        const registered: string[] = [];
        const fakeServer = { registerTool: (name: string) => registered.push(name) };

        const { registerHappierMcpBuiltInTools } = await import(
            '@/mcp/server/registerHappierMcpBuiltInTools'
        );
        const { toolNames } = registerHappierMcpBuiltInTools(fakeServer as any, {
            sessionId: 'sess_test',
            surface: 'session_agent',
            deps: {} as any,
        });
        expect(toolNames.length).toBeGreaterThan(0);
        expect(registered).toEqual(toolNames);
    });

    it('omits a tool when isSessionAgentToolEnabled returns false for its name', async () => {
        const registered: string[] = [];
        const fakeServer = { registerTool: (name: string) => registered.push(name) };

        const { registerHappierMcpBuiltInTools } = await import(
            '@/mcp/server/registerHappierMcpBuiltInTools'
        );
        const { toolNames } = registerHappierMcpBuiltInTools(fakeServer as any, {
            sessionId: 'sess_test',
            surface: 'session_agent',
            deps: {} as any,
            isSessionAgentToolEnabled: (name) => name !== 'change_title',
        });
        expect(toolNames).not.toContain('change_title');
        expect(registered).not.toContain('change_title');
    });

    it('includes a tool when isSessionAgentToolEnabled returns true for its name', async () => {
        const registered: string[] = [];
        const fakeServer = { registerTool: (name: string) => registered.push(name) };

        const { registerHappierMcpBuiltInTools } = await import(
            '@/mcp/server/registerHappierMcpBuiltInTools'
        );
        const { toolNames } = registerHappierMcpBuiltInTools(fakeServer as any, {
            sessionId: 'sess_test',
            surface: 'session_agent',
            deps: {} as any,
            isSessionAgentToolEnabled: (name) => name === 'change_title',
        });
        expect(toolNames).toContain('change_title');
        expect(registered).toContain('change_title');
    });

    it('toolNames return value matches registered tools exactly', async () => {
        const registered: string[] = [];
        const fakeServer = { registerTool: (name: string) => registered.push(name) };

        const { registerHappierMcpBuiltInTools } = await import(
            '@/mcp/server/registerHappierMcpBuiltInTools'
        );
        const { toolNames } = registerHappierMcpBuiltInTools(fakeServer as any, {
            sessionId: 'sess_test',
            surface: 'session_agent',
            deps: {} as any,
            isSessionAgentToolEnabled: (name) => name !== 'memory_search',
        });
        expect(toolNames).toEqual(registered);
    });
});
```

---

### `apps/cli/src/settings/sessionAgentToolsSettings.test.ts` (rename + update)

**Analog:** `/home/thamw/development/happier/happier/apps/cli/src/settings/mcpToolsSettings.test.ts` (this is the file, renamed)

**Rename map for test internals:**
- `describe('mcpToolsSettings', ...)` → `describe('sessionAgentToolsSettings', ...)`
- `createTempDir('happier-mcp-tools-settings-')` → `createTempDir('happier-session-agent-tools-settings-')`
- All `import('./mcpToolsSettings')` → `import('./sessionAgentToolsSettings')`
- All `readMcpToolsSettingsV1` → `readSessionAgentToolsSettingsV1`
- All `DEFAULT_MCP_TOOLS_SETTINGS` → `DEFAULT_SESSION_AGENT_TOOLS_SETTINGS`
- All `mcpToolsSettingsV1:` (in test fixtures as object keys) → `sessionAgentToolsSettingsV1:`
- Warn message matcher `toMatch(/mcpToolsSettings/)` → `toMatch(/sessionAgentToolsSettings/)`

**Test for new predicate builder** — add after existing tests using the same describe block and `beforeEach`/`afterEach` pattern:
```typescript
    describe('buildIsSessionAgentToolEnabled', () => {
        it('returns true for a tool absent from the tools map (opt-out model, SCHEMA-02)', async () => {
            const { readSessionAgentToolsSettingsV1, buildIsSessionAgentToolEnabled } =
                await import('./sessionAgentToolsSettings');
            const settings = readSessionAgentToolsSettingsV1({} as any);
            const predicate = buildIsSessionAgentToolEnabled(settings);
            expect(predicate('change_title')).toBe(true);
            expect(predicate('any_absent_tool')).toBe(true);
        });

        it('returns true when enabled === true', async () => {
            const { readSessionAgentToolsSettingsV1, buildIsSessionAgentToolEnabled } =
                await import('./sessionAgentToolsSettings');
            const settings = readSessionAgentToolsSettingsV1({
                sessionAgentToolsSettingsV1: { v: 1, tools: { change_title: { enabled: true } } },
            } as any);
            expect(buildIsSessionAgentToolEnabled(settings)('change_title')).toBe(true);
        });

        it('returns false when enabled === false', async () => {
            const { readSessionAgentToolsSettingsV1, buildIsSessionAgentToolEnabled } =
                await import('./sessionAgentToolsSettings');
            const settings = readSessionAgentToolsSettingsV1({
                sessionAgentToolsSettingsV1: { v: 1, tools: { change_title: { enabled: false } } },
            } as any);
            expect(buildIsSessionAgentToolEnabled(settings)('change_title')).toBe(false);
        });
    });
```

---

### `apps/cli/src/mcp/createHappierMcpServer.test.ts` (extend with forwarding assertion)

**Analog:** `/home/thamw/development/happier/happier/apps/cli/src/mcp/createHappierMcpServer.test.ts` (self)

**New test to add** — follows existing `vi.doMock('@/mcp/server/registerHappierMcpBuiltInTools', ...)` pattern (lines 269–278) to assert predicate forwarding:
```typescript
  it('forwards isSessionAgentToolEnabled to registerHappierMcpBuiltInTools when provided', async () => {
    const capturedParams: { isSessionAgentToolEnabled?: unknown } = {};

    vi.doMock('@/mcp/server/registerHappierMcpBuiltInTools', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/mcp/server/registerHappierMcpBuiltInTools')>();
      return {
        ...actual,
        registerHappierMcpBuiltInTools: (_server: any, params: any) => {
          capturedParams.isSessionAgentToolEnabled = params.isSessionAgentToolEnabled;
          return { toolNames: [] };
        },
      };
    });

    const { createHappierMcpServer } = await import('@/mcp/createHappierMcpServer');
    const predicate = (name: string) => name !== 'change_title';

    createHappierMcpServer(
      {
        sessionId: 'sess_predicate_forwarding_1',
        rpcHandlerManager: { invokeLocal: async () => ({}) },
        sendClaudeSessionMessage: () => {},
        updateMetadata: () => {},
      } as any,
      { credentials: null, isSessionAgentToolEnabled: predicate },
    );

    expect(capturedParams.isSessionAgentToolEnabled).toBe(predicate);
  });

  it('passes undefined isSessionAgentToolEnabled to registerHappierMcpBuiltInTools when opts omits it', async () => {
    const capturedParams: { isSessionAgentToolEnabled?: unknown } = {};

    vi.doMock('@/mcp/server/registerHappierMcpBuiltInTools', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/mcp/server/registerHappierMcpBuiltInTools')>();
      return {
        ...actual,
        registerHappierMcpBuiltInTools: (_server: any, params: any) => {
          capturedParams.isSessionAgentToolEnabled = params.isSessionAgentToolEnabled;
          return { toolNames: [] };
        },
      };
    });

    const { createHappierMcpServer } = await import('@/mcp/createHappierMcpServer');

    createHappierMcpServer(
      {
        sessionId: 'sess_predicate_absent_1',
        rpcHandlerManager: { invokeLocal: async () => ({}) },
        sendClaudeSessionMessage: () => {},
        updateMetadata: () => {},
      } as any,
      { credentials: null },
    );

    expect(capturedParams.isSessionAgentToolEnabled).toBeUndefined();
  });
```

---

### `apps/cli/src/mcp/startHappyServer.integration.test.ts` (extend with TOOLS-01 tests)

**Analog:** `/home/thamw/development/happier/happier/apps/cli/src/mcp/startHappyServer.integration.test.ts` (self)

**Setup pattern to copy** — the test that sets `HAPPIER_ACTIONS_SETTINGS_V1` (lines 487–539) demonstrates the exact environment + `reloadConfiguration()` + temp settings file pattern. The new tests follow the same structure but write a `settings.json` to a temp dir instead of setting an env var.

**New imports to add** at top of integration test file:
```typescript
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { applyEnvValues, restoreEnvValues, snapshotEnvValues } from '@/testkit/env/envSnapshot';
import { createTempDir, removeTempDir } from '@/testkit/fs/tempDir';
```

**New tests to add** inside `describe('startHappyServer (MCP integration)', ...)`:
```typescript
  describe('sessionAgentToolsSettingsV1 filtering (TOOLS-01)', () => {
    const envBackup = snapshotEnvValues(['HAPPIER_HOME_DIR', 'HAPPIER_SERVER_URL', 'HAPPIER_WEBAPP_URL']);
    let homeDir: string | undefined;

    beforeEach(async () => {
      homeDir = await createTempDir('happier-mcp-filter-integration-');
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

    it('hides a tool disabled via sessionAgentToolsSettingsV1 from listTools response', async () => {
      // Write settings.json with change_title disabled
      const settings = {
        schemaVersion: 6,
        onboardingCompleted: false,
        sessionAgentToolsSettingsV1: { v: 1, tools: { change_title: { enabled: false } } },
      };
      await writeFile(
        join(homeDir!, 'settings.json'),
        JSON.stringify(settings),
        { mode: 0o600 },
      );

      const fakeClient: HappyMcpSessionClient = {
        sessionId: 'sess_filter_disabled_1',
        rpcHandlerManager: { invokeLocal: vi.fn(async () => ({})) } as any,
        sendClaudeSessionMessage: () => {},
        updateMetadata: () => {},
      };

      const server = await startHappyServer(fakeClient);
      let client: Client | null = null;
      try {
        client = new Client({ name: 'mcp-test-filter-disabled', version: '1.0.0' }, { capabilities: {} });
        await client.connect(new StreamableHTTPClientTransport(new URL(server.url)));

        const tools = await client.listTools();
        const names = new Set((tools.tools ?? []).map((t: any) => String(t.name)));
        expect(names.has('change_title')).toBe(false);
        expect(names.has('action_execute')).toBe(true);  // unaffected tool still present
      } finally {
        await (client as any)?.close?.();
        server.stop();
      }
    });

    it('returns startHappyServer toolNames without disabled tools (D-06)', async () => {
      const settings = {
        schemaVersion: 6,
        onboardingCompleted: false,
        sessionAgentToolsSettingsV1: { v: 1, tools: { change_title: { enabled: false } } },
      };
      await writeFile(
        join(homeDir!, 'settings.json'),
        JSON.stringify(settings),
        { mode: 0o600 },
      );

      const fakeClient: HappyMcpSessionClient = {
        sessionId: 'sess_filter_snapshot_1',
        rpcHandlerManager: { invokeLocal: vi.fn(async () => ({})) } as any,
        sendClaudeSessionMessage: () => {},
        updateMetadata: () => {},
      };

      const server = await startHappyServer(fakeClient);
      try {
        expect(server.toolNames).not.toContain('change_title');
        expect(server.toolNames.length).toBeGreaterThan(0);
      } finally {
        server.stop();
      }
    });

    it('enables all tools when no settings file exists (STARTUP-02)', async () => {
      // homeDir exists but no settings.json written
      const fakeClient: HappyMcpSessionClient = {
        sessionId: 'sess_filter_absent_1',
        rpcHandlerManager: { invokeLocal: vi.fn(async () => ({})) } as any,
        sendClaudeSessionMessage: () => {},
        updateMetadata: () => {},
      };

      const server = await startHappyServer(fakeClient);
      let client: Client | null = null;
      try {
        client = new Client({ name: 'mcp-test-filter-absent', version: '1.0.0' }, { capabilities: {} });
        await client.connect(new StreamableHTTPClientTransport(new URL(server.url)));

        const tools = await client.listTools();
        const names = new Set((tools.tools ?? []).map((t: any) => String(t.name)));
        expect(names.has('change_title')).toBe(true);
      } finally {
        await (client as any)?.close?.();
        server.stop();
      }
    });
  });
```

**Key fixture note** — `mkdir` of `homeDir` is not needed because `createTempDir` already creates it. Write `settings.json` directly into `homeDir` via `join(homeDir!, 'settings.json')`. `reloadConfiguration()` must be called after `applyEnvValues` so `configuration.settingsFile` re-derives from the new `HAPPIER_HOME_DIR`.

---

## Shared Patterns

### Settings field access (opaque unknown field pattern)
**Source:** `apps/cli/src/persistence.ts` lines 113–118 (the `memory` and `mcpToolsSettingsV1` fields)
**Apply to:** `persistence.ts` rename of `mcpToolsSettingsV1` → `sessionAgentToolsSettingsV1`
```typescript
  /**
   * Per-tool session-agent enable/disable configuration (CLI-local; schema-validated).
   * Parsed/normalized by `settings/sessionAgentToolsSettings.ts`.
   * Stored as raw JSON — always access via `readSessionAgentToolsSettingsV1(settings)`.
   */
  sessionAgentToolsSettingsV1?: unknown;
```

### Fault-tolerant settings reader pattern
**Source:** `apps/cli/src/settings/mcpToolsSettings.ts` lines 37–48
**Apply to:** `sessionAgentToolsSettings.ts` (preserve after rename)
```typescript
export function readSessionAgentToolsSettingsV1(settings: Settings): SessionAgentToolsSettingsV1 {
    const raw = settings.sessionAgentToolsSettingsV1;
    if (raw === undefined || raw === null) {
        return DEFAULT_SESSION_AGENT_TOOLS_SETTINGS;
    }
    const parsed = SessionAgentToolsSettingsV1Schema.safeParse(raw);
    if (!parsed.success) {
        logger.warn(`[sessionAgentToolsSettings] sessionAgentToolsSettingsV1 failed schema validation — using defaults. Error: ${parsed.error.message}`);
        return DEFAULT_SESSION_AGENT_TOOLS_SETTINGS;
    }
    return parsed.data;
}
```

### Dynamic import + vi.resetModules pattern
**Source:** `apps/cli/src/settings/mcpToolsSettings.test.ts` lines 1–7, 13–27
**Apply to:** `sessionAgentToolsSettings.test.ts` and `registerHappierMcpBuiltInTools.test.ts`
```typescript
vi.mock('@/ui/logger', () => ({
    logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// In beforeEach:
vi.resetModules();

// In each test:
const { readSessionAgentToolsSettingsV1, DEFAULT_SESSION_AGENT_TOOLS_SETTINGS } =
    await import('./sessionAgentToolsSettings');
```

### vi.doMock + captured params pattern
**Source:** `apps/cli/src/mcp/createHappierMcpServer.test.ts` lines 269–298
**Apply to:** new forwarding assertions in `createHappierMcpServer.test.ts`
```typescript
vi.doMock('@/mcp/server/registerHappierMcpBuiltInTools', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/mcp/server/registerHappierMcpBuiltInTools')>();
  return {
    ...actual,
    registerHappierMcpBuiltInTools: (_server: any, params: any) => {
      captured.deps = params.deps;
      return { toolNames: [] };
    },
  };
});
```

### Integration test: env + reloadConfiguration + temp settings
**Source:** `apps/cli/src/mcp/startHappyServer.integration.test.ts` lines 70–77 (beforeEach pattern with `reloadConfiguration`)
**Source:** `apps/cli/src/settings/mcpToolsSettings.test.ts` lines 10–27 (tempDir + envSnapshot pattern)
**Apply to:** new TOOLS-01 integration tests in `startHappyServer.integration.test.ts`

Key sequence:
1. `homeDir = await createTempDir('happier-mcp-filter-integration-')`
2. `applyEnvValues({ HAPPIER_HOME_DIR: homeDir, ... })`
3. `reloadConfiguration()` — must follow step 2
4. Write `settings.json` to `join(homeDir, 'settings.json')`
5. Call `startHappyServer(fakeClient)` — it will now read from the temp dir
6. In `afterEach`: `restoreEnvValues(envBackup)` then `reloadConfiguration()` then `removeTempDir`

---

## No Analog Found

None — all files have direct analogs in the codebase.

---

## Metadata

**Analog search scope:** `apps/cli/src/settings/`, `apps/cli/src/mcp/`, `apps/cli/src/mcp/server/`, `apps/cli/src/testkit/`
**Files scanned:** 9 source files, 2 test files
**Pattern extraction date:** 2026-04-19
