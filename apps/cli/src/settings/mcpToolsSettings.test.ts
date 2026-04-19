import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyEnvValues, restoreEnvValues, snapshotEnvValues } from '@/testkit/env/envSnapshot';
import { createTempDir, removeTempDir } from '@/testkit/fs/tempDir';

vi.mock('@/ui/logger', () => ({
    logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

describe('mcpToolsSettings', () => {
    const envBackup = snapshotEnvValues(['HAPPIER_HOME_DIR', 'HAPPIER_SERVER_URL', 'HAPPIER_WEBAPP_URL']);
    let homeDir: string | undefined;

    beforeEach(async () => {
        homeDir = await createTempDir('happier-mcp-tools-settings-');
        applyEnvValues({
            HAPPIER_HOME_DIR: homeDir,
            HAPPIER_SERVER_URL: 'https://api.example.test',
            HAPPIER_WEBAPP_URL: 'https://app.example.test',
        });
        vi.resetModules();
    });

    afterEach(async () => {
        restoreEnvValues(envBackup);
        vi.resetModules();
        if (homeDir) await removeTempDir(homeDir);
    });

    it('returns default when mcpToolsSettingsV1 key is absent', async () => {
        const { readMcpToolsSettingsV1, DEFAULT_MCP_TOOLS_SETTINGS } = await import('./mcpToolsSettings');
        const result = readMcpToolsSettingsV1({} as any);
        expect(result).toEqual(DEFAULT_MCP_TOOLS_SETTINGS);
        expect(result).toEqual({ v: 1, tools: {} });
    });

    it('returns default when mcpToolsSettingsV1 is undefined', async () => {
        const { readMcpToolsSettingsV1, DEFAULT_MCP_TOOLS_SETTINGS } = await import('./mcpToolsSettings');
        const result = readMcpToolsSettingsV1({ mcpToolsSettingsV1: undefined } as any);
        expect(result).toEqual(DEFAULT_MCP_TOOLS_SETTINGS);
    });

    it('parses a valid blob with enabled=false for a named tool', async () => {
        const { readMcpToolsSettingsV1 } = await import('./mcpToolsSettings');
        const result = readMcpToolsSettingsV1({
            mcpToolsSettingsV1: { v: 1, tools: { change_title: { enabled: false } } },
        } as any);
        expect(result.v).toBe(1);
        expect(result.tools['change_title']).toEqual({ enabled: false });
    });

    it('parses a blob missing the v field (v defaults to 1)', async () => {
        const { readMcpToolsSettingsV1 } = await import('./mcpToolsSettings');
        const result = readMcpToolsSettingsV1({
            mcpToolsSettingsV1: { tools: { change_title: { enabled: true } } },
        } as any);
        expect(result.v).toBe(1);
        expect(result.tools['change_title']).toEqual({ enabled: true });
    });

    it('parses a blob with unknown top-level keys (forward-compat)', async () => {
        const { readMcpToolsSettingsV1 } = await import('./mcpToolsSettings');
        const result = readMcpToolsSettingsV1({
            mcpToolsSettingsV1: { v: 1, tools: {}, future_key: true },
        } as any);
        expect(result.v).toBe(1);
        expect(result.tools).toEqual({});
    });

    it('returns default and emits logger.warn when v is not 1', async () => {
        const { logger } = await import('@/ui/logger');
        const warnSpy = vi.mocked(logger.warn);
        warnSpy.mockClear();
        const { readMcpToolsSettingsV1, DEFAULT_MCP_TOOLS_SETTINGS } = await import('./mcpToolsSettings');
        const result = readMcpToolsSettingsV1({ mcpToolsSettingsV1: { v: 2 } } as any);
        expect(result).toEqual(DEFAULT_MCP_TOOLS_SETTINGS);
        expect(warnSpy).toHaveBeenCalledOnce();
        expect(warnSpy.mock.calls[0]?.[0]).toMatch(/mcpToolsSettings/);
    });

    it('returns default and emits logger.warn when tools is not a record', async () => {
        const { logger } = await import('@/ui/logger');
        const warnSpy = vi.mocked(logger.warn);
        warnSpy.mockClear();
        const { readMcpToolsSettingsV1, DEFAULT_MCP_TOOLS_SETTINGS } = await import('./mcpToolsSettings');
        const result = readMcpToolsSettingsV1({ mcpToolsSettingsV1: { v: 1, tools: 'bad' } } as any);
        expect(result).toEqual(DEFAULT_MCP_TOOLS_SETTINGS);
        expect(warnSpy).toHaveBeenCalledOnce();
    });

    it('absent tool name in tools map is undefined — opt-out model (SCHEMA-02)', async () => {
        const { readMcpToolsSettingsV1 } = await import('./mcpToolsSettings');
        const result = readMcpToolsSettingsV1({
            mcpToolsSettingsV1: { v: 1, tools: {} },
        } as any);
        expect(result.tools['change_title']).toBeUndefined();
        expect(result.tools['any_tool']).toBeUndefined();
    });

    it('does not emit logger.warn when mcpToolsSettingsV1 is absent', async () => {
        const { logger } = await import('@/ui/logger');
        const warnSpy = vi.mocked(logger.warn);
        warnSpy.mockClear();
        const { readMcpToolsSettingsV1 } = await import('./mcpToolsSettings');
        readMcpToolsSettingsV1({} as any);
        expect(warnSpy).not.toHaveBeenCalled();
    });
});
