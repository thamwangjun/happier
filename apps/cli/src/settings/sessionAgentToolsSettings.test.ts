import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/ui/logger', () => ({
    logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

describe('sessionAgentToolsSettings', () => {
    beforeEach(async () => {
        vi.resetModules();
    });

    afterEach(() => {
        vi.resetModules();
    });

    it('returns default when sessionAgentToolsSettingsV1 key is absent', async () => {
        const { readSessionAgentToolsSettings, DEFAULT_SESSION_AGENT_TOOLS_SETTINGS } = await import('./sessionAgentToolsSettings');
        const result = readSessionAgentToolsSettings({} as any);
        expect(result).toEqual(DEFAULT_SESSION_AGENT_TOOLS_SETTINGS);
        expect(result).toEqual({ v: 1, tools: {} });
    });

    it('returns default when sessionAgentToolsSettingsV1 is undefined', async () => {
        const { readSessionAgentToolsSettings, DEFAULT_SESSION_AGENT_TOOLS_SETTINGS } = await import('./sessionAgentToolsSettings');
        const result = readSessionAgentToolsSettings({ sessionAgentToolsSettingsV1: undefined } as any);
        expect(result).toEqual(DEFAULT_SESSION_AGENT_TOOLS_SETTINGS);
    });

    it('parses a valid blob with enabled=false for a named tool', async () => {
        const { readSessionAgentToolsSettings } = await import('./sessionAgentToolsSettings');
        const result = readSessionAgentToolsSettings({
            sessionAgentToolsSettingsV1: { v: 1, tools: { change_title: { enabled: false } } },
        } as any);
        expect(result.v).toBe(1);
        expect(result.tools['change_title']).toEqual({ enabled: false });
    });

    it('parses a blob missing the v field (v defaults to 1)', async () => {
        const { readSessionAgentToolsSettings } = await import('./sessionAgentToolsSettings');
        const result = readSessionAgentToolsSettings({
            sessionAgentToolsSettingsV1: { tools: { change_title: { enabled: true } } },
        } as any);
        expect(result.v).toBe(1);
        expect(result.tools['change_title']).toEqual({ enabled: true });
    });

    it('parses a blob with unknown top-level keys (forward-compat)', async () => {
        const { readSessionAgentToolsSettings } = await import('./sessionAgentToolsSettings');
        const result = readSessionAgentToolsSettings({
            sessionAgentToolsSettingsV1: { v: 1, tools: {}, future_key: true },
        } as any);
        expect(result.v).toBe(1);
        expect(result.tools).toEqual({});
    });

    it('returns default and emits logger.warn when v is not 1', async () => {
        const { logger } = await import('@/ui/logger');
        const warnSpy = vi.mocked(logger.warn);
        warnSpy.mockClear();
        const { readSessionAgentToolsSettings, DEFAULT_SESSION_AGENT_TOOLS_SETTINGS } = await import('./sessionAgentToolsSettings');
        const result = readSessionAgentToolsSettings({ sessionAgentToolsSettingsV1: { v: 2 } } as any);
        expect(result).toEqual(DEFAULT_SESSION_AGENT_TOOLS_SETTINGS);
        expect(warnSpy).toHaveBeenCalledOnce();
        expect(warnSpy.mock.calls[0]?.[0]).toMatch(/sessionAgentToolsSettings/);
    });

    it('returns default and emits logger.warn when tools is not a record', async () => {
        const { logger } = await import('@/ui/logger');
        const warnSpy = vi.mocked(logger.warn);
        warnSpy.mockClear();
        const { readSessionAgentToolsSettings, DEFAULT_SESSION_AGENT_TOOLS_SETTINGS } = await import('./sessionAgentToolsSettings');
        const result = readSessionAgentToolsSettings({ sessionAgentToolsSettingsV1: { v: 1, tools: 'bad' } } as any);
        expect(result).toEqual(DEFAULT_SESSION_AGENT_TOOLS_SETTINGS);
        expect(warnSpy).toHaveBeenCalledOnce();
    });

    it('absent tool name in tools map is undefined — opt-out model (SCHEMA-02)', async () => {
        const { readSessionAgentToolsSettings } = await import('./sessionAgentToolsSettings');
        const result = readSessionAgentToolsSettings({
            sessionAgentToolsSettingsV1: { v: 1, tools: {} },
        } as any);
        expect(result.tools['change_title']).toBeUndefined();
        expect(result.tools['any_tool']).toBeUndefined();
    });

    it('does not emit logger.warn when sessionAgentToolsSettingsV1 is absent', async () => {
        const { logger } = await import('@/ui/logger');
        const warnSpy = vi.mocked(logger.warn);
        warnSpy.mockClear();
        const { readSessionAgentToolsSettings } = await import('./sessionAgentToolsSettings');
        readSessionAgentToolsSettings({} as any);
        expect(warnSpy).not.toHaveBeenCalled();
    });

    describe('buildIsSessionAgentToolEnabled', () => {
        it('returns true for a tool absent from the tools map (opt-out model, SCHEMA-02)', async () => {
            const { readSessionAgentToolsSettings, buildIsSessionAgentToolEnabled } =
                await import('./sessionAgentToolsSettings');
            const settings = readSessionAgentToolsSettings({} as any);
            const predicate = buildIsSessionAgentToolEnabled(settings);
            expect(predicate('change_title')).toBe(true);
            expect(predicate('any_absent_tool')).toBe(true);
        });

        it('returns true when enabled === true', async () => {
            const { readSessionAgentToolsSettings, buildIsSessionAgentToolEnabled } =
                await import('./sessionAgentToolsSettings');
            const settings = readSessionAgentToolsSettings({
                sessionAgentToolsSettingsV1: { v: 1, tools: { change_title: { enabled: true } } },
            } as any);
            expect(buildIsSessionAgentToolEnabled(settings)('change_title')).toBe(true);
        });

        it('returns false when enabled === false', async () => {
            const { readSessionAgentToolsSettings, buildIsSessionAgentToolEnabled } =
                await import('./sessionAgentToolsSettings');
            const settings = readSessionAgentToolsSettings({
                sessionAgentToolsSettingsV1: { v: 1, tools: { change_title: { enabled: false } } },
            } as any);
            expect(buildIsSessionAgentToolEnabled(settings)('change_title')).toBe(false);
        });

        it('returns true for absent tool when default is true (SCHEMA-01)', async () => {
            const { readSessionAgentToolsSettings, buildIsSessionAgentToolEnabled } =
                await import('./sessionAgentToolsSettings');
            const settings = readSessionAgentToolsSettings({
                sessionAgentToolsSettingsV1: { v: 1, tools: {}, default: true },
            } as any);
            expect(buildIsSessionAgentToolEnabled(settings)('any_absent_tool')).toBe(true);
        });

        it('returns false for absent tool when default is false — opt-in mode (SCHEMA-02)', async () => {
            const { readSessionAgentToolsSettings, buildIsSessionAgentToolEnabled } =
                await import('./sessionAgentToolsSettings');
            const settings = readSessionAgentToolsSettings({
                sessionAgentToolsSettingsV1: { v: 1, tools: {}, default: false },
            } as any);
            expect(buildIsSessionAgentToolEnabled(settings)('any_absent_tool')).toBe(false);
        });

        it('returns true for absent tool when default is omitted — backward compat (SCHEMA-03)', async () => {
            const { readSessionAgentToolsSettings, buildIsSessionAgentToolEnabled } =
                await import('./sessionAgentToolsSettings');
            const settings = readSessionAgentToolsSettings({
                sessionAgentToolsSettingsV1: { v: 1, tools: {} },
            } as any);
            expect(buildIsSessionAgentToolEnabled(settings)('any_absent_tool')).toBe(true);
        });

        it('per-tool enabled:true overrides default:false (SCHEMA-04)', async () => {
            const { readSessionAgentToolsSettings, buildIsSessionAgentToolEnabled } =
                await import('./sessionAgentToolsSettings');
            const settings = readSessionAgentToolsSettings({
                sessionAgentToolsSettingsV1: { v: 1, tools: { change_title: { enabled: true } }, default: false },
            } as any);
            expect(buildIsSessionAgentToolEnabled(settings)('change_title')).toBe(true);
        });

        it('per-tool enabled:false overrides default:true (SCHEMA-04)', async () => {
            const { readSessionAgentToolsSettings, buildIsSessionAgentToolEnabled } =
                await import('./sessionAgentToolsSettings');
            const settings = readSessionAgentToolsSettings({
                sessionAgentToolsSettingsV1: { v: 1, tools: { change_title: { enabled: false } }, default: true },
            } as any);
            expect(buildIsSessionAgentToolEnabled(settings)('change_title')).toBe(false);
        });

        it('returns DEFAULT and warns when default field is non-boolean — no throw (VALID-01)', async () => {
            const { logger } = await import('@/ui/logger');
            const warnSpy = vi.mocked(logger.warn);
            warnSpy.mockClear();
            const { readSessionAgentToolsSettings, DEFAULT_SESSION_AGENT_TOOLS_SETTINGS, buildIsSessionAgentToolEnabled } =
                await import('./sessionAgentToolsSettings');
            const settings = readSessionAgentToolsSettings({
                sessionAgentToolsSettingsV1: { v: 1, tools: {}, default: 'bad' },
            } as any);
            expect(settings).toEqual(DEFAULT_SESSION_AGENT_TOOLS_SETTINGS);
            expect(warnSpy).toHaveBeenCalledOnce();
            expect(buildIsSessionAgentToolEnabled(settings)('any_tool')).toBe(true);
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

        it('does not treat the default field as a tool name', async () => {
            const { findUnknownSessionAgentToolNames } = await import('./sessionAgentToolsSettings');
            const settings = { v: 1 as const, tools: { change_title: { enabled: false } }, default: false };
            expect(findUnknownSessionAgentToolNames(settings, ['change_title'])).toEqual([]);
        });
    });
});
