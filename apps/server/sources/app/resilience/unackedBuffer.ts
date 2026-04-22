import { db } from '@/storage/db';
import { inTx } from '@/storage/inTx';
import type { Tx } from '@/storage/inTx';
import { getRelayBufferCapFromEnv } from '@/config/backends';
import type { UpdatePayload } from '@/app/events/eventPayloadTypes';
import type { Prisma } from '@prisma/client';

/**
 * Writes an outbound UpdatePayload to the per-user buffer.
 *
 * CLI exclusion (STORE-07): connectionKeys that do not start with 'user-scoped:'
 * are silently skipped — machine-scoped and session-scoped connections are never buffered.
 *
 * Cap enforcement (STORE-02): after insert, if the total count for this (userId, connectionKey)
 * exceeds the cap, the oldest entries are deleted within the same transaction. Returns
 * { overflow: true } when a trim occurred so the caller can signal buffer-overflow on reconnect.
 *
 * Atomicity (STORE-02): insert + count + trim run inside a single inTx transaction to prevent
 * race conditions on concurrent writes.
 */
export async function writeToBuffer(
    userId: string,
    connectionKey: string,
    payload: UpdatePayload,
    cap: number = getRelayBufferCapFromEnv(process.env),
): Promise<{ overflow: boolean }> {
    // STORE-07: CLI exclusion guard — never buffer non-user-scoped connections
    if (!connectionKey.startsWith('user-scoped:')) {
        return { overflow: false };
    }

    return await inTx(async (tx: Tx) => {
        await tx.unackedMessage.create({
            data: {
                userId,
                connectionKey,
                seq: payload.seq,
                payload: payload as unknown as Prisma.InputJsonValue,
                createdAt: new Date(),
            },
        });

        const count = await tx.unackedMessage.count({
            where: { userId, connectionKey },
        });

        const overflow = count > cap;

        if (overflow) {
            const excess = count - cap;
            const oldest = await tx.unackedMessage.findMany({
                where: { userId, connectionKey },
                orderBy: { seq: 'asc' },
                take: excess,
                select: { id: true },
            });
            await tx.unackedMessage.deleteMany({
                where: { id: { in: oldest.map((r) => r.id) } },
            });
        }

        return { overflow };
    });
}

/**
 * Returns all buffered entries for a (userId, connectionKey) pair where seq > afterSeq,
 * ordered by seq ascending. Used by the reconnect-resume handler in Phase 8 to replay
 * missed messages in delivery order.
 */
export async function readBuffer(
    userId: string,
    connectionKey: string,
    afterSeq: number,
): Promise<UpdatePayload[]> {
    const rows = await db.unackedMessage.findMany({
        where: { userId, connectionKey, seq: { gt: afterSeq } },
        orderBy: { seq: 'asc' },
    });
    return rows.map((r) => r.payload as unknown as UpdatePayload);
}

/**
 * Discards all buffer entries at or below ackedSeq for a (userId, connectionKey) pair.
 * Called when the client emits ack-update to confirm receipt of messages up to a given seq.
 * The operation is idempotent — calling it again for an already-discarded seq is a no-op.
 */
export async function ackBuffer(
    userId: string,
    connectionKey: string,
    ackedSeq: number,
): Promise<void> {
    await db.unackedMessage.deleteMany({
        where: { userId, connectionKey, seq: { lte: ackedSeq } },
    });
}
