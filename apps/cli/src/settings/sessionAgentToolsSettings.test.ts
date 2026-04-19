import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyEnvValues, restoreEnvValues, snapshotEnvValues } from '@/testkit/env/envSnapshot';
import { createTempDir, removeTempDir } from '@/testkit/fs/tempDir';

vi.mock('@/ui/logger', () => ({
    logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

describe('sessionAgentToolsSettings', () => {
    const envBackup = snapshotEnvValues(['HAPPIER_HOME_DIR', 'HAPPIER_SERVER_URL', 'HAPPIER_WEBAPP_URL']);
    let homeDir: string | undefined;

    beforeEach(async () => {
        homeDir = await createTempDir('happier-session-agent-tools-settings-');
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

    it('returns default when sessionAgentToolsSettingsV1 key is absent', async () => {
        const { readSessionAgentToolsSettingsV1, DEFAULT_SESSION_AGENT_TOOLS_SETTINGS } = await import('./sessionAgentToolsSettings');
        const result = readSessionAgentToolsSettingsV1({} as any);
        expect(result).toEqual(DEFAULT_SESSION_AGENT_TOOLS_SETTINGS);
        expect(result).toEqual({ v: 1, tools: {} });
    });

    it('returns default when sessionAgentToolsSettingsV1 is undefined', async () => {
        const { readSessionAgentToolsSettingsV1, DEFAULT_SESSION_AGENT_TOOLS_SETTINGS } = await import('./sessionAgentToolsSettings');
        const result = readSessionAgentToolsSettingsV1({ sessionAgentToolsSettingsV1: undefined } as any);
        expect(result).toEqual(DEFAULT_SESSION_AGENT_TOOLS_SETTINGS);
    });

    it('parses a valid blob with enabled=false for a named tool', async () => {
        const { readSessionAgentToolsSettingsV1 } = await import('./sessionAgentToolsSettings');
        const result = readSessionAgentToolsSettingsV1({
            sessionAgentToolsSettingsV1: { v: 1, tools: { change_title: { enabled: false } } },
        } as any);
        expect(result.v).toBe(1);
        expect(result.tools['change_title']).toEqual({ enabled: false });
    });

    it('parses a blob missing the v field (v defaults to 1)', async () => {
        const { readSessionAgentToolsSettingsV1 } = await import('./sessionAgentToolsSettings');
        const result = readSessionAgentToolsSettingsV1({
            sessionAgentToolsSettingsV1: { tools: { change_title: { enabled: true } } },
        } as any);
        expect(result.v).toBe(1);
        expect(result.tools['change_title']).toEqual({ enabled: true });
    });

    it('parses a blob with unknown top-level keys (forward-compat)', async () => {
        const { readSessionAgentToolsSettingsV1 } = await import('./sessionAgentToolsSettings');
        const result = readSessionAgentToolsSettingsV1({
            sessionAgentToolsSettingsV1: { v: 1, tools: {}, future_key: true },
        } as any);
        expect(result.v).toBe(1);
        expect(result.tools).toEqual({});
    });

    it('returns default and emits logger.warn when v is not 1', async () => {
        const { logger } = await import('@/ui/logger');
        const warnSpy = vi.mocked(logger.warn);
        warnSpy.mockClear();
        const { readSessionAgentToolsSettingsV1, DEFAULT_SESSION_AGENT_TOOLS_SETTINGS } = await import('./sessionAgentToolsSettings');
        const result = readSessionAgentToolsSettingsV1({ sessionAgentToolsSettingsV1: { v: 2 } } as any);
        expect(result).toEqual(DEFAULT_SESSION_AGENT_TOOLS_SETTINGS);
        expect(warnSpy).toHaveBeenCalledOnce();
        expect(warnSpy.mock.calls[0]?.[0]).toMatch(/sessionAgentToolsSettings/);
    });

    it('returns default and emits logger.warn when tools is not a record', async () => {
        const { logger } = await import('@/ui/logger');
        const warnSpy = vi.mocked(logger.warn);
        warnSpy.mockClear();
        const { readSessionAgentToolsSettingsV1, DEFAULT_SESSION_AGENT_TOOLS_SETTINGS } = await import('./sessionAgentToolsSettings');
        const result = readSessionAgentToolsSettingsV1({ sessionAgentToolsSettingsV1: { v: 1, tools: 'bad' } } as any);
        expect(result).toEqual(DEFAULT_SESSION_AGENT_TOOLS_SETTINGS);
        expect(warnSpy).toHaveBeenCalledOnce();
    });

    it('absent tool name in tools map is undefined — opt-out model (SCHEMA-02)', async () => {
        const { readSessionAgentToolsSettingsV1 } = await import('./sessionAgentToolsSettings');
        const result = readSessionAgentToolsSettingsV1({
            sessionAgentToolsSettingsV1: { v: 1, tools: {} },
        } as any);
        expect(result.tools['change_title']).toBeUndefined();
        expect(result.tools['any_tool']).toBeUndefined();
    });

    it('does not emit logger.warn when sessionAgentToolsSettingsV1 is absent', async () => {
        const { logger } = await import('@/ui/logger');
        const warnSpy = vi.mocked(logger.warn);
        warnSpy.mockClear();
        const { readSessionAgentToolsSettingsV1 } = await import('./sessionAgentToolsSettings');
        readSessionAgentToolsSettingsV1({} as any);
        expect(warnSpy).not.toHaveBeenCalled();
    });

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

    describe('findUnknownSessionAgentToolNames', () => {
        it('returns empty array when all configured names are known', async () => {
            const { findUnknownSessionAgentToolNames } = await import('./sessionAgentToolsSettings');
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

        it('returns empty array when settings.tools is empty (DEFAULT_SESSION_AGENT_TOOLS_SETTINGS)', async () => {
            const { findUnknownSessionAgentToolNames, DEFAULT_SESSION_AGENT_TOOLS_SETTINGS } =
                await import('./sessionAgentToolsSettings');
            expect(findUnknownSessionAgentToolNames(DEFAULT_SESSION_AGENT_TOOLS_SETTINGS, ['change_title'])).toEqual([]);
        });
    });
});
