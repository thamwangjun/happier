// Tests for baseline turn completion behavior in claudeRemoteAgentSdk.
//
// Responsibilities:
//   - TURN-06 baseline: Verify that a bare result event (no subagent) calls onReady exactly once
//   - TURN-06 multi-subagent: Verify that two task_notification events + result calls onReady once, onSubagentFlush twice
//
// SC-2 (1× subagent + parent → onReady exactly once) is covered by TEST-02 in
// claudeRemoteAgentSdk.subagentTurnCompletion.test.ts — no duplication here.

import { describe, expect, it, vi } from 'vitest';
import { claudeRemoteAgentSdk } from './claudeRemoteAgentSdk';
import { makeMode } from './claudeRemoteAgentSdk.testkit';

describe('claudeRemoteAgentSdk baseline turn completion', () => {
    function makeBaselineQuery(taskCount: number, includeResult: boolean) {
        return vi.fn((_params: any) => ({
            async *[Symbol.asyncIterator]() {
                for (let i = 1; i <= taskCount; i++) {
                    yield { type: 'system', subtype: 'task_started', task_id: `task_${i}` } as any;
                    yield { type: 'system', subtype: 'task_notification', task_id: `task_${i}`, status: 'completed' } as any;
                }
                if (includeResult) {
                    yield { type: 'result' } as any;
                }
            },
            close: vi.fn(),
            setPermissionMode: vi.fn(),
            setModel: vi.fn(),
            setMaxThinkingTokens: vi.fn(),
            supportedCommands: vi.fn(async () => []),
            supportedModels: vi.fn(async () => []),
        } as any));
    }

    function makeNextMessage() {
        let didSendFirst = false;
        return vi.fn(async () => {
            if (didSendFirst) return null;
            didSendFirst = true;
            return { message: 'hello', mode: makeMode({ permissionMode: 'default' } as any) };
        });
    }

    it('TURN-06 baseline: bare result event (no subagent) calls onReady exactly once', async () => {
        const onReady = vi.fn();
        const onSubagentFlush = vi.fn();

        await claudeRemoteAgentSdk({
            sessionId: null,
            transcriptPath: null,
            path: '/tmp',
            claudeArgs: [],
            claudeExecutablePath: '/tmp/claude',
            canCallTool: async () => ({ behavior: 'allow', updatedInput: {} }),
            isAborted: () => false,
            nextMessage: makeNextMessage(),
            onReady,
            onSubagentFlush,
            onSessionFound: () => {},
            onMessage: () => {},
            createQuery: makeBaselineQuery(0, true),
        } as any);

        expect(onReady).toHaveBeenCalledTimes(1);
        expect(onSubagentFlush).not.toHaveBeenCalled();
    });

    it('TURN-06 multi-subagent: two task_notifications then result calls onReady once, onSubagentFlush twice', async () => {
        const onReady = vi.fn();
        const onSubagentFlush = vi.fn();

        await claudeRemoteAgentSdk({
            sessionId: null,
            transcriptPath: null,
            path: '/tmp',
            claudeArgs: [],
            claudeExecutablePath: '/tmp/claude',
            canCallTool: async () => ({ behavior: 'allow', updatedInput: {} }),
            isAborted: () => false,
            nextMessage: makeNextMessage(),
            onReady,
            onSubagentFlush,
            onSessionFound: () => {},
            onMessage: () => {},
            createQuery: makeBaselineQuery(2, true),
        } as any);

        expect(onReady).toHaveBeenCalledTimes(1);
        expect(onSubagentFlush).toHaveBeenCalledTimes(2);
    });
});
