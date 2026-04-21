import { z } from 'zod';

export const SOCKET_RESILIENCE_EVENTS = {
    RECONNECT_RESUME: 'reconnect-resume',
    ACK_UPDATE:       'ack-update',
    REPLAY_COMPLETE:  'replay-complete',
    BUFFER_OVERFLOW:  'buffer-overflow',
} as const;

export type SocketResilienceEvent = (typeof SOCKET_RESILIENCE_EVENTS)[keyof typeof SOCKET_RESILIENCE_EVENTS];

export const ACK_DEBOUNCE_MS = 500;

export const ReconnectResumeRequestSchema = z.object({
    sessionId: z.string(),
    lastAckedSeq: z.number().int().min(0),
}).passthrough();

export type ReconnectResumeRequest = z.infer<typeof ReconnectResumeRequestSchema>;

export const AckUpdateRequestSchema = z.object({
    sessionId: z.string(),
    seq: z.number().int().min(0),
}).passthrough();

export type AckUpdateRequest = z.infer<typeof AckUpdateRequestSchema>;
