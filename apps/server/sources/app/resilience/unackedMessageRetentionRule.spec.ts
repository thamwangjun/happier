import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbMocks, installDbModuleMock } from '../api/testkit/dbMocks';

const findMany = vi.fn();
const deleteMany = vi.fn();

const dbMocks = createDbMocks({
    unackedMessage: ['findMany', 'deleteMany'],
} as const);

dbMocks.db.unackedMessage.findMany.mockImplementation((...args: any[]) => findMany(...args));
dbMocks.db.unackedMessage.deleteMany.mockImplementation((...args: any[]) => deleteMany(...args));

installDbModuleMock({ db: dbMocks.db });

describe('createUnackedMessageRetentionRule', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // STORE-03 + STORE-06: TTL sweep uses RELAY_BUFFER_TTL_MS (120000ms) cutoff from env
    it('deletes entries older than RELAY_BUFFER_TTL_MS via findMany + deleteMany', async () => {
        findMany.mockResolvedValueOnce([{ id: 'msg-old-1' }]);
        deleteMany.mockResolvedValueOnce({ count: 1 });

        const { createUnackedMessageRetentionRule } = await import('./unackedMessageRetentionRule');
        const rule = createUnackedMessageRetentionRule();

        // now = 2025-01-01T00:02:00.000Z; cutoff = now - 120000ms = 2025-01-01T00:00:00.000Z
        const now = new Date('2025-01-01T00:02:00.000Z');
        const expectedCutoff = new Date('2025-01-01T00:00:00.000Z');

        const result = await rule.run({
            policy: {} as any,
            batchSize: 10,
            dryRun: false,
            maxDeletesPerRulePerRun: 10,
            now,
        });

        expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { createdAt: { lt: expectedCutoff } },
            orderBy: { createdAt: 'asc' },
        }));
        expect(deleteMany).toHaveBeenCalledWith({
            where: {
                id: { in: ['msg-old-1'] },
                createdAt: { lt: expectedCutoff },
            },
        });
        expect(result).toEqual({ id: 'unackedMessages', deleted: 1 });
    });

    it('returns deleted count without calling deleteMany when dryRun is true', async () => {
        findMany.mockResolvedValueOnce([{ id: 'msg-old-2' }, { id: 'msg-old-3' }]);

        const { createUnackedMessageRetentionRule } = await import('./unackedMessageRetentionRule');
        const rule = createUnackedMessageRetentionRule();

        const result = await rule.run({
            policy: {} as any,
            batchSize: 10,
            dryRun: true,
            maxDeletesPerRulePerRun: 10,
            now: new Date('2025-01-01T00:02:00.000Z'),
        });

        expect(deleteMany).not.toHaveBeenCalled();
        expect(result).toEqual({ id: 'unackedMessages', deleted: 2 });
    });

    it('returns { deleted: 0 } without calling deleteMany when no candidates found', async () => {
        findMany.mockResolvedValueOnce([]);

        const { createUnackedMessageRetentionRule } = await import('./unackedMessageRetentionRule');
        const rule = createUnackedMessageRetentionRule();

        const result = await rule.run({
            policy: {} as any,
            batchSize: 10,
            dryRun: false,
            maxDeletesPerRulePerRun: 10,
            now: new Date('2025-01-01T00:02:00.000Z'),
        });

        expect(deleteMany).not.toHaveBeenCalled();
        expect(result).toEqual({ id: 'unackedMessages', deleted: 0 });
    });
});
