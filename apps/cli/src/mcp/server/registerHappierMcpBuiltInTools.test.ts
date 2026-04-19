import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('registerHappierMcpBuiltInTools', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it('registers all session_agent tools when no predicate is provided', async () => {
        const registered: string[] = [];
        const fakeServer = {
            registerTool: (name: string, _meta: unknown, _handler: unknown) => {
                registered.push(name);
            },
        };

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
        const fakeServer = {
            registerTool: (name: string, _meta: unknown, _handler: unknown) => {
                registered.push(name);
            },
        };

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
        const fakeServer = {
            registerTool: (name: string, _meta: unknown, _handler: unknown) => {
                registered.push(name);
            },
        };

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
        const fakeServer = {
            registerTool: (name: string, _meta: unknown, _handler: unknown) => {
                registered.push(name);
            },
        };

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
