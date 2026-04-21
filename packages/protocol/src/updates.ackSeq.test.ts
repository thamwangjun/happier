import { describe, expect, it } from 'vitest';

import { UpdateContainerSchema } from './updates.js';

// Minimal valid body using the simplest discriminant in UpdateBodySchema
const VALID_BODY = { t: 'public-share-deleted', sessionId: 'sid' };

describe('UpdateContainerSchema — ackSeq backward compat (PROTO-04)', () => {
    it('accepts ackSeq when present and returns the value', () => {
        const result = UpdateContainerSchema.parse({
            id: 'x',
            seq: 1,
            createdAt: Date.now(),
            body: VALID_BODY,
            ackSeq: 7,
        });
        expect((result as Record<string, unknown>).ackSeq).toBe(7);
    });

    it('accepts payload with no ackSeq field (backward compat)', () => {
        const result = UpdateContainerSchema.parse({
            id: 'x',
            seq: 1,
            createdAt: Date.now(),
            body: VALID_BODY,
        });
        expect((result as Record<string, unknown>).ackSeq).toBeUndefined();
    });

    it('rejects negative ackSeq', () => {
        expect(
            UpdateContainerSchema.safeParse({
                id: 'x',
                seq: 1,
                createdAt: Date.now(),
                body: VALID_BODY,
                ackSeq: -1,
            }).success,
        ).toBe(false);
    });

    it('rejects non-integer ackSeq', () => {
        expect(
            UpdateContainerSchema.safeParse({
                id: 'x',
                seq: 1,
                createdAt: Date.now(),
                body: VALID_BODY,
                ackSeq: 1.5,
            }).success,
        ).toBe(false);
    });
});
