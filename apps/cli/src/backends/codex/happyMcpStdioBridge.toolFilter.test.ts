/**
 * Regression tests: STDIO bridge reads sessionAgentToolsSettings from settings file,
 * not from the HAPPIER_ENABLED_SESSION_AGENT_TOOLS env var.
 *
 * The old env-var approach had a bug: an empty string (all-disabled intent) fell through
 * the `trim() !== ''` guard, leaving isToolEnabled undefined — all tools visible.
 *
 * These tests FAIL against the old code and PASS with the fix because:
 * - Old code: never calls readSettings(); passes isToolEnabled=undefined to
 *   registerHappierMcpBridgeTools → tests throw TypeError → FAIL
 * - New code: calls readSettings(); builds isToolEnabled from settings → PASS
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Captured per-test — reset in beforeEach
let capturedIsToolEnabled: ((name: string) => boolean) | undefined = undefined;

vi.mock('@/persistence', () => ({
    readSettings: vi.fn(),
}));

vi.mock('./registerHappierMcpBridgeTools', () => ({
    registerHappierMcpBridgeTools: vi.fn((_server: unknown, deps: { isToolEnabled?: (name: string) => boolean }) => {
        capturedIsToolEnabled = deps.isToolEnabled;
    }),
}));

vi.mock('@/mcp/resources/registerHappierMcpResources', () => ({
    registerHappierMcpResources: vi.fn(),
}));

vi.mock('@/settings/actionsSettings', () => ({
    isActionEnabledByEnv: vi.fn().mockReturnValue(true),
}));

vi.mock('@/ui/logger', () => ({
    logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
    McpServer: vi.fn().mockImplementation(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
    })),
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
    StdioServerTransport: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
    Client: vi.fn().mockImplementation(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
    })),
}));

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
    StreamableHTTPClientTransport: vi.fn().mockImplementation(() => ({})),
}));

describe('happyMcpStdioBridge — tool filter wired from settings, not env var (regression)', () => {
    const savedEnv = process.env;
    const savedArgv = process.argv;

    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        capturedIsToolEnabled = undefined;
        process.env = { ...savedEnv };
        process.argv = ['node', 'happyMcpStdioBridge.js'];
        process.env.HAPPIER_HTTP_MCP_URL = 'http://127.0.0.1:9999';
        delete process.env.HAPPIER_ENABLED_SESSION_AGENT_TOOLS;
    });

    afterEach(() => {
        process.env = savedEnv;
        process.argv = savedArgv;
    });

    it('BRIDGE-01: reads readSettings() and disables a named tool from sessionAgentToolsSettings', async () => {
        const { readSettings } = await import('@/persistence');
        vi.mocked(readSettings).mockResolvedValue({
            sessionAgentToolsSettings: { v: 1, tools: { change_title: { enabled: false } } },
        } as never);

        await import('./happyMcpStdioBridge');
        await vi.waitUntil(() => capturedIsToolEnabled !== undefined, { timeout: 2000 });

        // Old code never calls readSettings — this assertion alone causes the test to fail there
        expect(readSettings).toHaveBeenCalledOnce();

        // Per-tool disabled: change_title is false, others default to true (opt-out model)
        expect(capturedIsToolEnabled!('change_title')).toBe(false);
        expect(capturedIsToolEnabled!('execution_run_start')).toBe(true);
    });

    it('BRIDGE-02: disables ALL tools when sessionAgentToolsSettings.default=false (all-disabled edge case)', async () => {
        // This is the exact bug: HAPPIER_ENABLED_SESSION_AGENT_TOOLS='' (empty) fell through
        // the guard → isToolEnabled=undefined → all tools shown. Settings-based approach is correct.
        const { readSettings } = await import('@/persistence');
        vi.mocked(readSettings).mockResolvedValue({
            sessionAgentToolsSettings: { v: 1, tools: {}, default: false },
        } as never);

        // Confirm the env var is absent — old code would produce isToolEnabled=undefined here
        expect(process.env.HAPPIER_ENABLED_SESSION_AGENT_TOOLS).toBeUndefined();

        await import('./happyMcpStdioBridge');
        await vi.waitUntil(() => capturedIsToolEnabled !== undefined, { timeout: 2000 });

        expect(readSettings).toHaveBeenCalledOnce();

        // New code: default=false → all tools disabled
        expect(capturedIsToolEnabled!('change_title')).toBe(false);
        expect(capturedIsToolEnabled!('execution_run_start')).toBe(false);
        expect(capturedIsToolEnabled!('any_arbitrary_tool')).toBe(false);
    });

    it('BRIDGE-03: enables all tools when sessionAgentToolsSettings is absent (backward compat)', async () => {
        const { readSettings } = await import('@/persistence');
        vi.mocked(readSettings).mockResolvedValue({} as never);

        await import('./happyMcpStdioBridge');
        await vi.waitUntil(() => capturedIsToolEnabled !== undefined, { timeout: 2000 });

        expect(readSettings).toHaveBeenCalledOnce();

        // Absent settings → DEFAULT_SESSION_AGENT_TOOLS_SETTINGS → all tools enabled
        expect(capturedIsToolEnabled!('change_title')).toBe(true);
        expect(capturedIsToolEnabled!('execution_run_start')).toBe(true);
    });
});
