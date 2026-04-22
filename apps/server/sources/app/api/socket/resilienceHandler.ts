import { Socket } from "socket.io";
import { log } from "@/utils/logging/log";
import {
    SOCKET_RESILIENCE_EVENTS,
    ReconnectResumeRequestSchema,
    AckUpdateRequestSchema,
} from "@happier-dev/protocol/socketResilience";
import { readBuffer, ackBuffer } from "@/app/resilience/unackedBuffer";

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
            if (!parsed.success) return;

            const { lastAckedSeq } = parsed.data;
            const connectionKey = `user-scoped:${userId}`;
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
            socket.emit('replay-start', { retentionStart });

            // Gap detection for overflow signal (SRVR-09):
            // If the oldest buffered seq is not contiguous with lastAckedSeq, the
            // buffer was trimmed — equivalent to overflow from the client's perspective.
            const hasGap = retentionStart !== null && retentionStart > lastAckedSeq + 1;
            if (hasGap) {
                // Path 2: signal overflow (SRVR-09); client will trigger resumeViaChanges
                socket.emit(SOCKET_RESILIENCE_EVENTS.BUFFER_OVERFLOW);
            }

            // Replay all buffered messages in seq order (SRVR-02, SRVR-04, SRVR-05)
            for (const payload of rows) {
                socket.emit('update', payload);
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
            if (!parsed.success) return;

            const { seq } = parsed.data;
            const connectionKey = `user-scoped:${userId}`;
            // ackBuffer is idempotent — re-acking an already-discarded seq is a no-op (SRVR-08)
            await ackBuffer(userId, connectionKey, seq);
        } catch (err) {
            log({ module: 'resilience', level: 'warn' }, `ack-update error: ${err}`);
        }
    });
}
