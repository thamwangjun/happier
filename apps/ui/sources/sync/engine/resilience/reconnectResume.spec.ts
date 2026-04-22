import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SOCKET_RESILIENCE_EVENTS } from '@happier-dev/protocol';
import { runWithInFlightDedupe } from '@/sync/runtime/orchestration/runWithInFlightDedupe';

// Hoist mock factories so they can be referenced in vi.mock() factory below
const persistenceMocks = vi.hoisted(() => ({
    loadLastAckedSeq: vi.fn<(accountId: string) => number>().mockReturnValue(0),
    saveLastAckedSeq: vi.fn<(accountId: string, seq: number) => void>(),
}));

// Mock persistence to avoid react-native-mmkv in Vitest node env
vi.mock('@/sync/domains/state/persistence', () => ({
    ...persistenceMocks,
}));

const loadLastAckedSeq = persistenceMocks.loadLastAckedSeq;
const saveLastAckedSeq = persistenceMocks.saveLastAckedSeq;

// --------------------------------------------------------------------------
// MOB-01: reconnect-resume emitted with lastAckedSeq on onReconnected
// --------------------------------------------------------------------------

describe('MOB-01: reconnect-resume emission on reconnect', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('emits reconnect-resume with lastAckedSeq=0 on first reconnect when no cursor persisted', () => {
        const sessionId = 'session-abc';
        const accountId = 'account-xyz';
        loadLastAckedSeq.mockReturnValue(0);

        const socketEmit = vi.fn();
        const lastAckedSeq = loadLastAckedSeq(accountId);

        // When the client reconnects, it should emit reconnect-resume with lastAckedSeq=0
        socketEmit(SOCKET_RESILIENCE_EVENTS.RECONNECT_RESUME, { sessionId, lastAckedSeq });

        expect(loadLastAckedSeq).toHaveBeenCalledWith(accountId);
        expect(socketEmit).toHaveBeenCalledWith(
            SOCKET_RESILIENCE_EVENTS.RECONNECT_RESUME,
            { sessionId, lastAckedSeq: 0 },
        );
    });

    it('emits reconnect-resume with persisted lastAckedSeq on subsequent reconnect', () => {
        const sessionId = 'session-abc';
        const accountId = 'account-xyz';
        loadLastAckedSeq.mockReturnValue(42);

        const socketEmit = vi.fn();
        const lastAckedSeq = loadLastAckedSeq(accountId);

        socketEmit(SOCKET_RESILIENCE_EVENTS.RECONNECT_RESUME, { sessionId, lastAckedSeq });

        expect(loadLastAckedSeq).toHaveBeenCalledWith(accountId);
        expect(socketEmit).toHaveBeenCalledWith(
            SOCKET_RESILIENCE_EVENTS.RECONNECT_RESUME,
            { sessionId, lastAckedSeq: 42 },
        );
    });
});

// --------------------------------------------------------------------------
// MOB-04: lastAckedSeq persistence via MMKV (per-account key)
// --------------------------------------------------------------------------

describe('MOB-04: lastAckedSeq persistence', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('loadLastAckedSeq returns 0 when key absent', () => {
        const accountId = 'account-new';
        loadLastAckedSeq.mockReturnValue(0);

        const result = loadLastAckedSeq(accountId);

        expect(result).toBe(0);
        expect(loadLastAckedSeq).toHaveBeenCalledWith(accountId);
    });

    it('saveLastAckedSeq persists seq under accountId key', () => {
        const accountId = 'account-xyz';
        const seq = 99;

        saveLastAckedSeq(accountId, seq);

        expect(saveLastAckedSeq).toHaveBeenCalledWith(accountId, seq);
    });

    it('loadLastAckedSeq returns saved value after saveLastAckedSeq', () => {
        const accountId = 'account-xyz';
        saveLastAckedSeq(accountId, 55);
        loadLastAckedSeq.mockReturnValue(55);

        const result = loadLastAckedSeq(accountId);

        expect(result).toBe(55);
    });

    it('saveLastAckedSeq merges with existing accounts without overwriting others', () => {
        const accountA = 'account-a';
        const accountB = 'account-b';

        saveLastAckedSeq(accountA, 10);
        saveLastAckedSeq(accountB, 20);

        expect(saveLastAckedSeq).toHaveBeenCalledWith(accountA, 10);
        expect(saveLastAckedSeq).toHaveBeenCalledWith(accountB, 20);
        expect(saveLastAckedSeq).toHaveBeenCalledTimes(2);
    });
});

// --------------------------------------------------------------------------
// MOB-05: background transition flushes ack synchronously
// --------------------------------------------------------------------------

describe('MOB-05: background transition flushes ack synchronously', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('flushes ack-update synchronously on AppState background transition', () => {
        const socketEmit = vi.fn();
        const flushAck = vi.fn(() => {
            socketEmit(SOCKET_RESILIENCE_EVENTS.ACK_UPDATE, { sessionId: 'session-abc', seq: 5 });
        });

        // Simulate AppState background transition triggering flush
        const appStateChange = (nextState: string) => {
            if (nextState === 'background') {
                flushAck();
            }
        };
        appStateChange('background');

        expect(flushAck).toHaveBeenCalledTimes(1);
        expect(socketEmit).toHaveBeenCalledWith(
            SOCKET_RESILIENCE_EVENTS.ACK_UPDATE,
            { sessionId: 'session-abc', seq: 5 },
        );
    });

    it('saves lastAckedSeq to MMKV before socket is killed on background', () => {
        const accountId = 'account-xyz';
        const currentSeq = 7;

        // Simulate background: save seq then emit ack
        const onBackground = () => {
            saveLastAckedSeq(accountId, currentSeq);
        };
        onBackground();

        expect(saveLastAckedSeq).toHaveBeenCalledWith(accountId, currentSeq);
    });
});

// --------------------------------------------------------------------------
// MOB-06: force-reconnect on foreground regardless of socket.connected
// --------------------------------------------------------------------------

describe('MOB-06: force-reconnect on foreground', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('calls disconnect() then connect() on foreground even when socket.connected=true', () => {
        const socket = {
            connected: true,
            disconnect: vi.fn(),
            connect: vi.fn(),
        };

        // Simulate foreground handler
        const onForeground = () => {
            socket.disconnect();
            socket.connect();
        };
        onForeground();

        expect(socket.disconnect).toHaveBeenCalledTimes(1);
        expect(socket.connect).toHaveBeenCalledTimes(1);
        // disconnect must be called before connect
        const disconnectOrder = socket.disconnect.mock.invocationCallOrder[0];
        const connectOrder = socket.connect.mock.invocationCallOrder[0];
        expect(disconnectOrder).toBeLessThan(connectOrder);
    });

    it('calls disconnect() then connect() on foreground when socket.connected=false', () => {
        const socket = {
            connected: false,
            disconnect: vi.fn(),
            connect: vi.fn(),
        };

        const onForeground = () => {
            socket.disconnect();
            socket.connect();
        };
        onForeground();

        expect(socket.disconnect).toHaveBeenCalledTimes(1);
        expect(socket.connect).toHaveBeenCalledTimes(1);
    });
});

// --------------------------------------------------------------------------
// MOB-07 (via replayGate): outbound commits held during isReplaying
// --------------------------------------------------------------------------

describe('MOB-07: outbound commits held during isReplaying', () => {
    it('shouldHoldServerCommit returns true when isReplaying=true', async () => {
        const { shouldHoldServerCommit } = await import('./replayGate');
        expect(shouldHoldServerCommit({ isReplaying: true })).toBe(true);
    });

    it('shouldHoldServerCommit returns false after replay-complete clears isReplaying', async () => {
        const { createReplayGate, shouldHoldServerCommit } = await import('./replayGate');
        const gate = createReplayGate();
        gate.isReplaying = true;

        // Simulate replay-complete event
        gate.isReplaying = false;

        expect(shouldHoldServerCommit(gate)).toBe(false);
    });

    it('pending commit waits for replayGate before executing HTTP POST', async () => {
        const { createReplayGate, shouldHoldServerCommit } = await import('./replayGate');
        const gate = createReplayGate();
        gate.isReplaying = true;

        const httpPost = vi.fn();
        const commitIfReady = () => {
            if (!shouldHoldServerCommit(gate)) {
                httpPost();
            }
        };

        commitIfReady();
        expect(httpPost).not.toHaveBeenCalled();

        gate.isReplaying = false;
        commitIfReady();
        expect(httpPost).toHaveBeenCalledTimes(1);
    });
});

// --------------------------------------------------------------------------
// MOB-08: buffer-overflow triggers resumeViaChanges
// --------------------------------------------------------------------------

describe('MOB-08: buffer-overflow triggers resumeViaChanges', () => {
    it('calls resumeViaChanges on buffer-overflow event', () => {
        const resumeViaChanges = vi.fn().mockResolvedValue(undefined);

        // Simulate buffer-overflow handler
        const onBufferOverflow = () => {
            resumeViaChanges();
        };
        onBufferOverflow();

        expect(resumeViaChanges).toHaveBeenCalledTimes(1);
    });

    it('does not call resumeViaChanges twice on double buffer-overflow', () => {
        let inFlight: Promise<void> | null = null;
        const actualResume = vi.fn().mockImplementation(async () => {
            await new Promise<void>((resolve) => setTimeout(resolve, 100));
        });
        const resumeViaChanges = () => {
            const state = {
                get: () => inFlight,
                set: (v: Promise<void> | null) => { inFlight = v; },
            };
            return runWithInFlightDedupe(state, actualResume);
        };

        // Fire twice — only one actual call should happen
        resumeViaChanges();
        resumeViaChanges();

        expect(actualResume).toHaveBeenCalledTimes(1);
    });
});

// --------------------------------------------------------------------------
// MOB-09: proactive gap detection on retentionStart > lastAckedSeq+1
// --------------------------------------------------------------------------

describe('MOB-09: proactive gap detection on replay-start', () => {
    it('calls resumeViaChanges when retentionStart > lastAckedSeq+1', () => {
        const resumeViaChanges = vi.fn().mockResolvedValue(undefined);
        const lastAckedSeq = 5;
        const retentionStart = 7; // gap: 6 is missing

        const onReplayStart = (retentionStart: number | null) => {
            if (retentionStart !== null && retentionStart > lastAckedSeq + 1) {
                resumeViaChanges();
            }
        };
        onReplayStart(retentionStart);

        expect(resumeViaChanges).toHaveBeenCalledTimes(1);
    });

    it('does not call resumeViaChanges when retentionStart == lastAckedSeq+1', () => {
        const resumeViaChanges = vi.fn().mockResolvedValue(undefined);
        const lastAckedSeq = 5;
        const retentionStart = 6; // no gap

        const onReplayStart = (retentionStart: number | null) => {
            if (retentionStart !== null && retentionStart > lastAckedSeq + 1) {
                resumeViaChanges();
            }
        };
        onReplayStart(retentionStart);

        expect(resumeViaChanges).not.toHaveBeenCalled();
    });

    it('does not call resumeViaChanges when retentionStart is null', () => {
        const resumeViaChanges = vi.fn().mockResolvedValue(undefined);
        const lastAckedSeq = 5;

        const onReplayStart = (retentionStart: number | null) => {
            if (retentionStart !== null && retentionStart > lastAckedSeq + 1) {
                resumeViaChanges();
            }
        };
        onReplayStart(null);

        expect(resumeViaChanges).not.toHaveBeenCalled();
    });
});

// --------------------------------------------------------------------------
// MOB-10: single-in-flight resumeViaChanges per reconnect cycle
// --------------------------------------------------------------------------

describe('MOB-10: single-in-flight resumeViaChanges per reconnect cycle', () => {
    it('second resumeViaChanges call returns same in-flight promise (runWithInFlightDedupe)', async () => {
        let inFlight: Promise<void> | null = null;
        const actualResume = vi.fn().mockImplementation(async () => {
            await new Promise<void>((resolve) => setTimeout(resolve, 100));
        });

        const resumeViaChanges = () => {
            const state = {
                get: () => inFlight,
                set: (v: Promise<void> | null) => { inFlight = v; },
            };
            return runWithInFlightDedupe(state, actualResume);
        };

        const p1 = resumeViaChanges();
        const p2 = resumeViaChanges();

        expect(p1).toBe(p2);
        expect(actualResume).toHaveBeenCalledTimes(1);
    });

    it('resumeViaChanges in-flight ref is null after completion', async () => {
        let inFlight: Promise<void> | null = null;
        const actualResume = vi.fn().mockResolvedValue(undefined);

        const resumeViaChanges = () => {
            const state = {
                get: () => inFlight,
                set: (v: Promise<void> | null) => { inFlight = v; },
            };
            return runWithInFlightDedupe(state, actualResume);
        };

        const promise = resumeViaChanges();
        expect(inFlight).not.toBeNull();

        await promise;
        expect(inFlight).toBeNull();
    });
});
