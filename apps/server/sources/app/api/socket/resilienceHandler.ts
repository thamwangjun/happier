import { Socket } from "socket.io";
import { log } from "@/utils/logging/log";
import {
    SOCKET_RESILIENCE_EVENTS,
    ReconnectResumeRequestSchema,
    AckUpdateRequestSchema,
} from "@happier-dev/protocol/socketResilience";
import { readBuffer, ackBuffer } from "@/app/resilience/unackedBuffer";
import { db } from '@/storage/db';
import { bufferRedeliveriesTotal, dedupDropsTotal } from '@/app/monitoring/metrics2';

/**
 * Registers Socket.IO event handlers for the reconnect-resume resilience flow.
 *
 * reconnect-resume: replays buffered messages in seq order for the reconnecting client.
 *   Emits 'replay-start' with retentionStart before the replay loop (SRVR-10),
 *   'buffer-overflow' if a gap is detected (SRVR-09), and 'replay-complete' in all paths (SRVR-09).
 *
 * ack-update: discards buffer entries up to and including the acked seq (SRVR-03, SRVR-08).
 *
 * Only registered for user-scoped connections in socket.ts (D-05).
 */
export function resilienceHandler(userId: string, socket: Socket): void {
    socket.on(SOCKET_RESILIENCE_EVENTS.RECONNECT_RESUME, async (data: unknown) => {
        try {
            const parsed = ReconnectResumeRequestSchema.safeParse(data);
            if (!parsed.success) {
                log({ module: 'resilience', level: 'warn' }, `reconnect-resume parse error for user ${userId}: ${parsed.error.message}`);
                // Unblock the client gate so it doesn't hang.
                socket.emit(SOCKET_RESILIENCE_EVENTS.REPLAY_COMPLETE, { retentionStart: null });
                return;
            }

            const { lastAckedSeq } = parsed.data;
            const connectionKey = `user-scoped:${userId}`;

            // Count already-acked entries still in the buffer (seq <= lastAckedSeq).
            // readBuffer filters these out via { gt: afterSeq }; we count them here
            // as "dedup drops" — messages the client already has that won't be replayed (VALID-02).
            const dupCount = await db.unackedMessage.count({
                where: { userId, connectionKey, seq: { lte: lastAckedSeq } },
            });
            if (dupCount > 0) {
                dedupDropsTotal.inc(dupCount);
            }

            const rows = await readBuffer(userId, connectionKey, lastAckedSeq);

            // retentionStart: the oldest seq still in the buffer (SRVR-10).
            // readBuffer orders by seq asc, so rows[0].seq is the minimum.
            const retentionStart: number | null = rows.length > 0 ? rows[0].seq : null;

            if (rows.length === 0) {
                // Path 3: empty buffer — release client gate immediately (SRVR-09)
                socket.emit(SOCKET_RESILIENCE_EVENTS.REPLAY_COMPLETE, { retentionStart: null });
                return;
            }

            // Emit retentionStart BEFORE any replay messages so the client can
            // detect a non-contiguous buffer proactively (SRVR-10).
            socket.emit(SOCKET_RESILIENCE_EVENTS.REPLAY_START, { retentionStart });

            // Gap detection for overflow signal (SRVR-09):
            // Query the absolute minimum seq across ALL buffer entries (not just those above
            // lastAckedSeq) to avoid false overflow signals when lastAckedSeq+1 was delivered
            // live and never written to the buffer.
            const absoluteMin = await db.unackedMessage.findFirst({
                where: { userId, connectionKey },
                orderBy: { seq: 'asc' },
                select: { seq: true },
            });
            const hasGap = absoluteMin !== null && absoluteMin.seq > lastAckedSeq + 1;
            if (hasGap) {
                // Path 2: signal overflow (SRVR-09); client will trigger resumeViaChanges.
                // INTENTIONAL: we continue to replay all buffered messages even after emitting
                // buffer-overflow so the client can apply any partial updates it can use while
                // it fetches the full state via resumeViaChanges. The client must tolerate
                // receiving update events after buffer-overflow and discard them if it chooses.
                socket.emit(SOCKET_RESILIENCE_EVENTS.BUFFER_OVERFLOW);
            }

            // Replay all buffered messages in seq order (SRVR-02, SRVR-04, SRVR-05).
            // On Path 2 (overflow), messages are still sent — see comment above.
            for (const payload of rows) {
                socket.emit(SOCKET_RESILIENCE_EVENTS.UPDATE, payload);
                bufferRedeliveriesTotal.inc();
            }

            // Path 1 + Path 2: always close the client gate after replay (SRVR-09)
            socket.emit(SOCKET_RESILIENCE_EVENTS.REPLAY_COMPLETE, { retentionStart });
        } catch (err) {
            log({ module: 'resilience', level: 'warn' }, `reconnect-resume error: ${err}`);
        }
    });

    socket.on(SOCKET_RESILIENCE_EVENTS.ACK_UPDATE, async (data: unknown) => {
        try {
            const parsed = AckUpdateRequestSchema.safeParse(data);
            if (!parsed.success) {
                log({ module: 'resilience', level: 'warn' }, `ack-update parse error for user ${userId}: ${parsed.error.message}`);
                return;
            }

            const { seq } = parsed.data;
            const connectionKey = `user-scoped:${userId}`;
            // ackBuffer is idempotent — re-acking an already-discarded seq is a no-op (SRVR-08)
            await ackBuffer(userId, connectionKey, seq);
        } catch (err) {
            log({ module: 'resilience', level: 'warn' }, `ack-update error: ${err}`);
        }
    });
}
