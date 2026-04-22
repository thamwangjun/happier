import { Server } from "socket.io";
import { log } from "@/utils/logging/log";
import {
    type ClientConnection,
    type RecipientFilter,
    type UpdatePayload,
    type EphemeralPayload,
} from "./eventPayloadTypes";
import { writeToBuffer } from "@/app/resilience/unackedBuffer";

class EventRouter {
    private userConnections = new Map<string, Set<ClientConnection>>();
    private io: Server | null = null;
    // warnedNoIo is intentionally a persistent flag (one-time warning per process lifetime).
    // It is not reset between tests by vi.clearAllMocks() — this is acceptable because the
    // "io not initialized" fallback path is only exercised in tests that construct EventRouter
    // without calling setIo(), and duplicate warnings in that path are not load-bearing.
    private warnedNoIo = false;

    // === CONNECTION MANAGEMENT ===

    addConnection(userId: string, connection: ClientConnection): void {
        if (!this.userConnections.has(userId)) {
            this.userConnections.set(userId, new Set());
        }
        this.userConnections.get(userId)!.add(connection);
    }

    removeConnection(userId: string, connection: ClientConnection): void {
        const connections = this.userConnections.get(userId);
        if (connections) {
            connections.delete(connection);
            if (connections.size === 0) {
                this.userConnections.delete(userId);
            }
        }
    }

    getConnections(userId: string): Set<ClientConnection> | undefined {
        return this.userConnections.get(userId);
    }

    // === SOCKET.IO ADAPTER (ROOM-BASED FANOUT) ===

    setIo(io: Server): void {
        this.io = io;
    }

    clearIo(): void {
        this.io = null;
    }

    // === EVENT EMISSION METHODS ===

    emitUpdate(params: {
        userId: string;
        payload: UpdatePayload;
        recipientFilter?: RecipientFilter;
        skipSenderConnection?: ClientConnection;
    }): void {
        this.emit({
            userId: params.userId,
            eventName: 'update',
            payload: params.payload,
            recipientFilter: params.recipientFilter || { type: 'all-user-authenticated-connections' },
            skipSenderConnection: params.skipSenderConnection
        });
        // Fire-and-forget buffer write (SRVR-01, D-04).
        // Only buffer when the filter delivers to user-scoped connections; callers using
        // machine-only filters must not accumulate messages in the user-scoped reconnect buffer.
        // Promise.resolve() is used (not void) so the catch handler receives the rejection.
        const filterIncludesUserScoped =
            !params.recipientFilter ||
            params.recipientFilter.type === 'all-user-authenticated-connections' ||
            params.recipientFilter.type === 'all-interested-in-session' ||
            params.recipientFilter.type === 'user-scoped-only';

        if (filterIncludesUserScoped) {
            Promise.resolve(
                writeToBuffer(params.userId, `user-scoped:${params.userId}`, params.payload)
            ).catch((err) =>
                log({ module: 'resilience', level: 'warn' }, `writeToBuffer failed for user ${params.userId}: ${err}`)
            );
        }
    }

    emitEphemeral(params: {
        userId: string;
        payload: EphemeralPayload;
        recipientFilter?: RecipientFilter;
        skipSenderConnection?: ClientConnection;
    }): void {
        this.emit({
            userId: params.userId,
            eventName: 'ephemeral',
            payload: params.payload,
            recipientFilter: params.recipientFilter || { type: 'all-user-authenticated-connections' },
            skipSenderConnection: params.skipSenderConnection
        });
    }

    // === PRIVATE ROUTING LOGIC ===

    private shouldSendToConnection(
        connection: ClientConnection,
        filter: RecipientFilter
    ): boolean {
        switch (filter.type) {
            case 'all-interested-in-session':
                // Send to session-scoped with matching session + all user-scoped
                if (connection.connectionType === 'session-scoped') {
                    if (connection.sessionId !== filter.sessionId) {
                        return false;  // Wrong session
                    }
                } else if (connection.connectionType === 'machine-scoped') {
                    return false;  // Machines don't need session updates
                }
                // user-scoped always gets it
                return true;

            case 'user-scoped-only':
                return connection.connectionType === 'user-scoped';

            case 'machine-scoped-only':
                // Send to user-scoped (mobile/web needs all machine updates) + only the specific machine
                if (connection.connectionType === 'user-scoped') {
                    return true;
                }
                if (connection.connectionType === 'machine-scoped') {
                    return connection.machineId === filter.machineId;
                }
                return false;  // session-scoped doesn't need machine updates

            case 'machine-only':
                return connection.connectionType === 'machine-scoped' && connection.machineId === filter.machineId;

            case 'all-user-authenticated-connections':
                // Send to all connection types (default behavior)
                return true;

            default:
                return false;
        }
    }

    private emit(params: {
        userId: string;
        eventName: 'update' | 'ephemeral';
        payload: any;
        recipientFilter: RecipientFilter;
        skipSenderConnection?: ClientConnection;
    }): void {
        if (this.io) {
            const skipSocketId = params.skipSenderConnection?.socket?.id;
            const emitter = this.getEmitterForFilter(params.userId, params.recipientFilter);
            if (skipSocketId && typeof (emitter as any).except === "function") {
                (emitter as any).except(skipSocketId).emit(params.eventName, params.payload);
            } else {
                emitter.emit(params.eventName, params.payload);
            }
            return;
        }

        if (process.env.HAPPY_SOCKET_ROOMS_ONLY === "1") {
            throw new Error("EventRouter: Socket.IO server (io) is not initialized (HAPPY_SOCKET_ROOMS_ONLY=1)");
        }
        if (!this.warnedNoIo) {
            this.warnedNoIo = true;
            log({ module: 'websocket', level: 'warn' }, "EventRouter: io not initialized; falling back to in-memory routing (single-process only)");
        }

        const connections = this.userConnections.get(params.userId);
        if (!connections) {
            log({ module: 'websocket', level: 'warn' }, `No connections found for user ${params.userId}`);
            return;
        }

        for (const connection of connections) {
            // Skip message echo
            if (params.skipSenderConnection && connection === params.skipSenderConnection) {
                continue;
            }

            // Apply recipient filter
            if (!this.shouldSendToConnection(connection, params.recipientFilter)) {
                continue;
            }

            connection.socket.emit(params.eventName, params.payload);
        }
    }

    private getEmitterForFilter(userId: string, filter: RecipientFilter): any {
        if (!this.io) {
            throw new Error("EventRouter.getEmitterForFilter called without io");
        }

        switch (filter.type) {
            case "all-interested-in-session": {
                // `update` containers are per-account (cursor + possibly recipient-specific data).
                // Never emit them to the shared `session:${sessionId}` room. Use the per-account session room instead.
                const rooms = [`session:${filter.sessionId}:${userId}`, `user-scoped:${userId}`];
                return this.io.to(rooms);
            }
            case "user-scoped-only":
                return this.io.to(`user-scoped:${userId}`);
            case "machine-scoped-only": {
                const rooms = [`machine:${filter.machineId}:${userId}`, `user-scoped:${userId}`];
                return this.io.to(rooms);
            }
            case "machine-only":
                return this.io.to(`machine:${filter.machineId}:${userId}`);
            case "all-user-authenticated-connections":
                return this.io.to(`user:${userId}`);
            default:
                return this.io.to(`user:${userId}`);
        }
    }
}

export const eventRouter = new EventRouter();

// Alias export for integration tests and resilience handler access (SRVR-01).
// All server code continues to use eventRouter; this alias is for explicit
// connection-event routing semantics in resilience-aware code paths.
export const connectionEventRouter = eventRouter;
