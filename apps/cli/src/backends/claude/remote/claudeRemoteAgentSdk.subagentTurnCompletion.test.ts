// Tests for subagent turn completion behavior in claudeRemoteAgentSdk.
//
// Responsibilities:
//   - TEST-01: Verify that a task_notification terminal event does NOT call onReady (subagent path)
//   - TEST-02: Verify that a result event following task_notification calls onReady exactly once (parent path)
//   - TEST-03: Verify that transcript flushAll runs on both subagent-only and subagent+parent paths
//
// These tests are RED (failing) until Plan 02 implements finalizeSubagentTurn() and the two-function split.

import { describe, expect, it, vi } from 'vitest';
import { claudeRemoteAgentSdk } from './claudeRemoteAgentSdk';
import { makeMode } from './claudeRemoteAgentSdk.testkit';

describe('claudeRemoteAgentSdk subagent turn completion', () => {
    function makeSubagentQuery(includeResult: boolean) {
        return vi.fn((_params: any) => ({
            async *[Symbol.asyncIterator]() {
                yield { type: 'system', subtype: 'task_started', task_id: 'task_1' } as any;
                yield { type: 'system', subtype: 'task_notification', task_id: 'task_1', status: 'completed' } as any;
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

    it('TEST-01: does not call onReady when task_notification is the terminal event', async () => {
        const onReady = vi.fn();
        const onSubagentFlush = vi.fn();
        const createQuery = makeSubagentQuery(false);

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
            createQuery,
        } as any);

        expect(onReady).not.toHaveBeenCalled();
        expect(onSubagentFlush).toHaveBeenCalledTimes(1);
    });

    it('TEST-02: calls onReady exactly once when result follows task_notification', async () => {
        const onReady = vi.fn();
        const onSubagentFlush = vi.fn();
        const createQuery = makeSubagentQuery(true);

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
            createQuery,
        } as any);

        expect(onReady).toHaveBeenCalledTimes(1);
        expect(onSubagentFlush).toHaveBeenCalledTimes(1);
    });

    describe('TEST-03: transcript flush runs on both paths', () => {
        it('runs flushAll on subagent-only path', async () => {
            const onReady = vi.fn();
            const onSubagentFlush = vi.fn();
            const createQuery = makeSubagentQuery(false);
            const streamedTranscriptWriter = {
                appendAssistantDelta: vi.fn(async () => {}),
                appendThinkingDelta: vi.fn(async () => {}),
                overrideAssistantText: vi.fn(() => false),
                overrideThinkingText: vi.fn(() => false),
                flushAll: vi.fn(async () => {}),
            };

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
                streamedTranscriptWriter,
                createQuery,
            } as any);

            expect(streamedTranscriptWriter.flushAll).toHaveBeenCalledTimes(1);
        });

        it('runs flushAll on subagent and parent paths', async () => {
            const onReady = vi.fn();
            const onSubagentFlush = vi.fn();
            const createQuery = makeSubagentQuery(true);
            const streamedTranscriptWriter = {
                appendAssistantDelta: vi.fn(async () => {}),
                appendThinkingDelta: vi.fn(async () => {}),
                overrideAssistantText: vi.fn(() => false),
                overrideThinkingText: vi.fn(() => false),
                flushAll: vi.fn(async () => {}),
            };

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
                streamedTranscriptWriter,
                createQuery,
            } as any);

            expect(streamedTranscriptWriter.flushAll).toHaveBeenCalledTimes(2);
        });
    });
});
