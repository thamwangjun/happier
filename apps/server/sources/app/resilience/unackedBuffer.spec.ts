import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbMocks, createDbTransactionMock, installDbModuleMock } from '../api/testkit/dbMocks';

// Models used by writeToBuffer (inTx → $transaction), readBuffer, ackBuffer
const dbMocks = createDbMocks({
    unackedMessage: ['create', 'findMany', 'deleteMany', 'count'],
} as const);

// inTx calls db.$transaction — wire the transaction mock so it delegates to the tx object
const txMock = createDbTransactionMock(() => ({
    unackedMessage: {
        create: dbMocks.db.unackedMessage.create,
        count: dbMocks.db.unackedMessage.count,
        findMany: dbMocks.db.unackedMessage.findMany,
        deleteMany: dbMocks.db.unackedMessage.deleteMany,
    },
}));

installDbModuleMock({ db: txMock.wrapDb(dbMocks.db) });

const PAYLOAD = { id: 'msg-1', seq: 1, body: { t: 'new-session' as const }, createdAt: 0 };
const USER_ID = 'user-abc';
const CONNECTION_KEY = 'user-scoped:user-abc';

describe('unackedBuffer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // STORE-01: write N messages and read them back in seq order
    it('readBuffer returns entries in seq order after writes', async () => {
        dbMocks.db.unackedMessage.create.mockResolvedValue({});
        dbMocks.db.unackedMessage.count.mockResolvedValue(1);
        dbMocks.db.unackedMessage.findMany.mockResolvedValueOnce([
            { id: '1', seq: 1, payload: { ...PAYLOAD, seq: 1 }, createdAt: new Date() },
            { id: '2', seq: 2, payload: { ...PAYLOAD, seq: 2 }, createdAt: new Date() },
            { id: '3', seq: 3, payload: { ...PAYLOAD, seq: 3 }, createdAt: new Date() },
        ]);

        const { readBuffer } = await import('./unackedBuffer');
        const result = await readBuffer(USER_ID, CONNECTION_KEY, 0);
        expect(result).toHaveLength(3);
        expect(result[0].seq).toBe(1);
        expect(result[1].seq).toBe(2);
        expect(result[2].seq).toBe(3);
    });

    // STORE-02: enforces cap — 501st write causes oldest to be trimmed
    it('enforces cap: returns { overflow: true } when count exceeds cap after insert', async () => {
        dbMocks.db.unackedMessage.create.mockResolvedValue({});
        // count returns cap + 1 to trigger trim
        dbMocks.db.unackedMessage.count.mockResolvedValue(501);
        // findMany returns the excess row to delete
        dbMocks.db.unackedMessage.findMany.mockResolvedValueOnce([{ id: 'oldest-1' }]);
        dbMocks.db.unackedMessage.deleteMany.mockResolvedValue({ count: 1 });

        const { writeToBuffer } = await import('./unackedBuffer');
        const result = await writeToBuffer(USER_ID, CONNECTION_KEY, { ...PAYLOAD, seq: 501 }, 500);
        expect(result).toEqual({ overflow: true });
        expect(dbMocks.db.unackedMessage.deleteMany).toHaveBeenCalled();
    });

    // STORE-04: ack discard — deleteMany called with seq <= ackedSeq
    it('ackBuffer calls deleteMany with seq <= ackedSeq', async () => {
        dbMocks.db.unackedMessage.deleteMany.mockResolvedValue({ count: 2 });

        const { ackBuffer } = await import('./unackedBuffer');
        await ackBuffer(USER_ID, CONNECTION_KEY, 2);

        expect(dbMocks.db.unackedMessage.deleteMany).toHaveBeenCalledWith({
            where: { userId: USER_ID, connectionKey: CONNECTION_KEY, seq: { lte: 2 } },
        });
    });

    // STORE-07: CLI exclusion — non-user-scoped connectionKey returns early without DB call
    it('returns { overflow: false } without DB call for non-user-scoped connectionKey', async () => {
        const { writeToBuffer } = await import('./unackedBuffer');
        const result = await writeToBuffer(USER_ID, 'machine-scoped:user-abc:mac-1', PAYLOAD, 500);
        expect(result).toEqual({ overflow: false });
        expect(dbMocks.db.unackedMessage.create).not.toHaveBeenCalled();
    });

    // STORE-07: session-scoped is also excluded
    it('returns { overflow: false } without DB call for session-scoped connectionKey', async () => {
        const { writeToBuffer } = await import('./unackedBuffer');
        const result = await writeToBuffer(USER_ID, 'session-scoped:sess-1:user-abc', PAYLOAD, 500);
        expect(result).toEqual({ overflow: false });
        expect(dbMocks.db.unackedMessage.create).not.toHaveBeenCalled();
    });
});
