import { describe, expect, it } from 'vitest';

import {
    ACK_DEBOUNCE_MS,
    AckUpdateRequestSchema,
    ReconnectResumeRequestSchema,
    SOCKET_RESILIENCE_EVENTS,
} from './socketResilience.js';

describe('SOCKET_RESILIENCE_EVENTS', () => {
    it('has all four event name keys', () => {
        expect(Object.keys(SOCKET_RESILIENCE_EVENTS)).toEqual(
            expect.arrayContaining(['RECONNECT_RESUME', 'ACK_UPDATE', 'REPLAY_COMPLETE', 'BUFFER_OVERFLOW']),
        );
    });

    it('RECONNECT_RESUME === reconnect-resume', () => {
        expect(SOCKET_RESILIENCE_EVENTS.RECONNECT_RESUME).toBe('reconnect-resume');
    });

    it('ACK_UPDATE === ack-update', () => {
        expect(SOCKET_RESILIENCE_EVENTS.ACK_UPDATE).toBe('ack-update');
    });

    it('REPLAY_COMPLETE === replay-complete', () => {
        expect(SOCKET_RESILIENCE_EVENTS.REPLAY_COMPLETE).toBe('replay-complete');
    });

    it('BUFFER_OVERFLOW === buffer-overflow', () => {
        expect(SOCKET_RESILIENCE_EVENTS.BUFFER_OVERFLOW).toBe('buffer-overflow');
    });
});

describe('ACK_DEBOUNCE_MS', () => {
    it('equals 500', () => {
        expect(ACK_DEBOUNCE_MS).toBe(500);
    });
});

describe('ReconnectResumeRequestSchema', () => {
    it('parses a valid { sessionId, lastAckedSeq } object', () => {
        const result = ReconnectResumeRequestSchema.parse({ sessionId: 'abc', lastAckedSeq: 0 });
        expect(result.sessionId).toBe('abc');
        expect(result.lastAckedSeq).toBe(0);
    });

    it('rejects payload missing lastAckedSeq', () => {
        expect(ReconnectResumeRequestSchema.safeParse({ sessionId: 'abc' }).success).toBe(false);
    });

    it('rejects payload missing sessionId', () => {
        expect(ReconnectResumeRequestSchema.safeParse({ lastAckedSeq: 0 }).success).toBe(false);
    });

    it('rejects negative lastAckedSeq', () => {
        expect(
            ReconnectResumeRequestSchema.safeParse({ sessionId: 'abc', lastAckedSeq: -1 }).success,
        ).toBe(false);
    });

    it('retains extra fields via passthrough', () => {
        const result = ReconnectResumeRequestSchema.parse({
            sessionId: 'x',
            lastAckedSeq: 0,
            extraField: 'y',
        });
        expect((result as Record<string, unknown>).extraField).toBe('y');
    });
});

describe('AckUpdateRequestSchema', () => {
    it('parses a valid { sessionId, seq } object', () => {
        const result = AckUpdateRequestSchema.parse({ sessionId: 'abc', seq: 42 });
        expect(result.sessionId).toBe('abc');
        expect(result.seq).toBe(42);
    });

    it('rejects payload missing seq', () => {
        expect(AckUpdateRequestSchema.safeParse({ sessionId: 'abc' }).success).toBe(false);
    });

    it('rejects payload missing sessionId', () => {
        expect(AckUpdateRequestSchema.safeParse({ seq: 0 }).success).toBe(false);
    });

    it('rejects negative seq', () => {
        expect(AckUpdateRequestSchema.safeParse({ sessionId: 'abc', seq: -1 }).success).toBe(false);
    });
});
