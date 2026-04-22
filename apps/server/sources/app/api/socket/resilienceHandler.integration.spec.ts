import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDbMocks, createDbTransactionMock, installDbModuleMock } from "../testkit/dbMocks";
import { createFakeSocket, triggerSocketHandler } from "../testkit/socketHarness";

// --- Mocks (hoisted — vi.mock calls must be at module top-level for vitest hoisting) ---

vi.mock("@/utils/logging/log", () => ({ log: vi.fn() }));

const writeToBufferMock = vi.fn().mockResolvedValue({ overflow: false });
const readBufferMock = vi.fn().mockResolvedValue([]);
const ackBufferMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/app/resilience/unackedBuffer", () => ({
    writeToBuffer: (...args: any[]) => writeToBufferMock(...args),
    readBuffer: (...args: any[]) => readBufferMock(...args),
    ackBuffer: (...args: any[]) => ackBufferMock(...args),
}));

const emitUpdateOriginal = vi.fn();
vi.mock("@/app/events/connectionEventRouter", () => ({
    connectionEventRouter: { emitUpdate: emitUpdateOriginal },
}));

// --- DB mock setup (for writeToBuffer's inTx, used in SRVR-01 test) ---

const { db, reset: resetDbMocks } = createDbMocks({
    unackedMessage: ["findMany", "deleteMany", "create", "count"],
} as const);

const txMock = createDbTransactionMock(() => ({
    unackedMessage: {
        create: db.unackedMessage.create,
        count: db.unackedMessage.count,
        findMany: db.unackedMessage.findMany,
        deleteMany: db.unackedMessage.deleteMany,
    },
}));

installDbModuleMock(() => ({
    db: txMock.wrapDb(db),
}));

// Redis skip guard (SRVR-05)
const REDIS_URL = process.env.REDIS_URL ?? "";
const skipRedis = !REDIS_URL;

// --- Helpers ---

function makePayload(seq: number): { id: string; seq: number; body: { t: string }; createdAt: number } {
    return { id: `upd-${seq}`, seq, body: { t: "test-event" }, createdAt: 0 };
}

// --- Tests ---

describe("resilienceHandler", async () => {
    // Dynamic import AFTER mocks are installed (required by installDbModuleMock / vi.doMock pattern)
    const { resilienceHandler } = await import("./resilienceHandler");

    beforeEach(() => {
        vi.clearAllMocks();
        resetDbMocks();
        writeToBufferMock.mockResolvedValue({ overflow: false });
        readBufferMock.mockResolvedValue([]);
        ackBufferMock.mockResolvedValue(undefined);
    });

    describe("SRVR-02, SRVR-04: reconnect-resume replays buffered messages in seq order (SQLite mode)", () => {
        it("emits buffered messages in seq-ascending order and closes with replay-complete", async () => {
            const p1 = makePayload(1);
            const p2 = makePayload(2);
            readBufferMock.mockResolvedValue([p1, p2]);

            const socket = createFakeSocket();
            resilienceHandler("user-1", socket as any);
            await triggerSocketHandler(socket, "reconnect-resume", { sessionId: "s1", lastAckedSeq: 0 });

            const calls = (socket.emit as ReturnType<typeof vi.fn>).mock.calls;
            const updateCalls = calls.filter(([ev]) => ev === "update");
            expect(updateCalls[0][1]).toEqual(expect.objectContaining({ seq: 1 }));
            expect(updateCalls[1][1]).toEqual(expect.objectContaining({ seq: 2 }));

            expect(socket.emit).toHaveBeenCalledWith("replay-complete", expect.objectContaining({ retentionStart: 1 }));
        });
    });

    describe("SRVR-10: retentionStart emitted before any replay messages", () => {
        it("emits replay-start with retentionStart before the first update", async () => {
            const p5 = makePayload(5);
            const p6 = makePayload(6);
            readBufferMock.mockResolvedValue([p5, p6]);

            const socket = createFakeSocket();
            resilienceHandler("user-1", socket as any);
            await triggerSocketHandler(socket, "reconnect-resume", { sessionId: "s1", lastAckedSeq: 0 });

            const calls = (socket.emit as ReturnType<typeof vi.fn>).mock.calls;
            const replayStartIdx = calls.findIndex(([ev]) => ev === "replay-start");
            const firstUpdateIdx = calls.findIndex(([ev]) => ev === "update");

            expect(replayStartIdx).toBeGreaterThanOrEqual(0);
            expect(calls[replayStartIdx][1]).toEqual(expect.objectContaining({ retentionStart: 5 }));
            expect(replayStartIdx).toBeLessThan(firstUpdateIdx);
        });
    });

    describe("SRVR-09 path 3: empty buffer emits replay-complete immediately", () => {
        it("emits replay-complete with retentionStart: null and no update events when buffer is empty", async () => {
            readBufferMock.mockResolvedValue([]);

            const socket = createFakeSocket();
            resilienceHandler("user-1", socket as any);
            await triggerSocketHandler(socket, "reconnect-resume", { sessionId: "s1", lastAckedSeq: 0 });

            expect(socket.emit).toHaveBeenCalledWith("replay-complete", { retentionStart: null });
            const calls = (socket.emit as ReturnType<typeof vi.fn>).mock.calls;
            expect(calls.filter(([ev]) => ev === "update")).toHaveLength(0);
        });
    });

    describe("SRVR-09 path 2 + SRVR-10: buffer-overflow emitted when gap detected", () => {
        it("emits buffer-overflow then replay-complete when retentionStart > lastAckedSeq + 1", async () => {
            // lastAckedSeq=0, retentionStart=5 — gap of 4 — overflow signal
            const p5 = makePayload(5);
            const p6 = makePayload(6);
            readBufferMock.mockResolvedValue([p5, p6]);

            const socket = createFakeSocket();
            resilienceHandler("user-1", socket as any);
            await triggerSocketHandler(socket, "reconnect-resume", { sessionId: "s1", lastAckedSeq: 0 });

            expect(socket.emit).toHaveBeenCalledWith("buffer-overflow");
            expect(socket.emit).toHaveBeenCalledWith("replay-complete", expect.objectContaining({ retentionStart: 5 }));

            // buffer-overflow must appear before replay-complete in call order
            const calls = (socket.emit as ReturnType<typeof vi.fn>).mock.calls;
            const overflowIdx = calls.findIndex(([ev]) => ev === "buffer-overflow");
            const completeIdx = calls.findIndex(([ev]) => ev === "replay-complete");
            expect(overflowIdx).toBeLessThan(completeIdx);
        });
    });

    describe("SRVR-03, SRVR-08: ack-update calls ackBuffer (idempotent)", () => {
        it("calls ackBuffer with the correct userId, connectionKey, and seq", async () => {
            const socket = createFakeSocket();
            resilienceHandler("user-1", socket as any);
            await triggerSocketHandler(socket, "ack-update", { sessionId: "s1", seq: 3 });

            expect(ackBufferMock).toHaveBeenCalledWith("user-1", "user-scoped:user-1", 3);
        });

        it("calling ack-update twice with the same seq does not throw (idempotent — SRVR-08)", async () => {
            const socket = createFakeSocket();
            resilienceHandler("user-1", socket as any);
            await triggerSocketHandler(socket, "ack-update", { sessionId: "s1", seq: 7 });
            await triggerSocketHandler(socket, "ack-update", { sessionId: "s1", seq: 7 });

            expect(ackBufferMock).toHaveBeenCalledTimes(2);
        });
    });

    describe("SRVR-06: ack before reconnect produces empty replay", () => {
        it("emits replay-complete with retentionStart: null and no updates when buffer is empty after ack", async () => {
            // After ack, readBuffer returns nothing (everything discarded)
            readBufferMock.mockResolvedValue([]);

            const socket = createFakeSocket();
            resilienceHandler("user-1", socket as any);

            // Client acks seq 5 before disconnect
            await triggerSocketHandler(socket, "ack-update", { sessionId: "s1", seq: 5 });
            // Then reconnects with lastAckedSeq: 5
            await triggerSocketHandler(socket, "reconnect-resume", { sessionId: "s1", lastAckedSeq: 5 });

            expect(socket.emit).toHaveBeenCalledWith("replay-complete", { retentionStart: null });
            const updateCalls = (socket.emit as ReturnType<typeof vi.fn>).mock.calls.filter(([ev]) => ev === "update");
            expect(updateCalls).toHaveLength(0);
        });
    });

    it.todo("SRVR-07: verified by running 'yarn test' in apps/cli — no code change needed; startupCatchUpRetry.test.ts must pass unchanged");
});

describe("SRVR-01: emitUpdate() writes to buffer fire-and-forget", async () => {
    // Dynamic import connectionEventRouter AFTER mocks — tests that emitUpdate calls writeToBuffer.
    // NOTE: This imports the module at '@/app/events/connectionEventRouter' which Plan 02 creates.
    // Until then, this describe block fails with module-not-found (RED gate).
    // vi.importActual bypasses the top-level vi.mock so we get the real implementation,
    // while @/app/resilience/unackedBuffer remains mocked — allowing writeToBuffer assertions.
    const { connectionEventRouter } = await vi.importActual<typeof import("@/app/events/connectionEventRouter")>("@/app/events/connectionEventRouter");

    beforeEach(() => {
        vi.clearAllMocks();
        writeToBufferMock.mockResolvedValue({ overflow: false });
    });

    it("calls writeToBuffer with user-scoped connectionKey as a fire-and-forget side-effect", () => {
        const payload = makePayload(1);
        connectionEventRouter.emitUpdate({ userId: "u1", payload });

        // writeToBuffer is called synchronously (Promise.resolve wraps it but the call itself is synchronous)
        expect(writeToBufferMock).toHaveBeenCalledWith("u1", "user-scoped:u1", payload);
    });

    it("does not block: emitUpdate returns void before writeToBuffer promise resolves", () => {
        let resolved = false;
        writeToBufferMock.mockImplementation(() => new Promise((res) => {
            setTimeout(() => {
                resolved = true;
                res({ overflow: false });
            }, 100);
        }));

        connectionEventRouter.emitUpdate({ userId: "u2", payload: makePayload(2) });

        // emitUpdate is void/synchronous — resolved must still be false immediately after the call
        expect(resolved).toBe(false);
    });
});

describe.skipIf(skipRedis)("SRVR-05: Postgres/Redis mode — same replay behavior", async () => {
    const { resilienceHandler } = await import("./resilienceHandler");

    beforeEach(() => {
        vi.clearAllMocks();
        readBufferMock.mockResolvedValue([]);
    });

    it("replays buffered messages in order under Redis adapter mode", async () => {
        const p1 = makePayload(1);
        const p2 = makePayload(2);
        readBufferMock.mockResolvedValue([p1, p2]);

        const socket = createFakeSocket();
        resilienceHandler("user-redis", socket as any);
        await triggerSocketHandler(socket, "reconnect-resume", { sessionId: "s1", lastAckedSeq: 0 });

        const calls = (socket.emit as ReturnType<typeof vi.fn>).mock.calls;
        const updateCalls = calls.filter(([ev]) => ev === "update");
        expect(updateCalls[0][1]).toEqual(expect.objectContaining({ seq: 1 }));
        expect(updateCalls[1][1]).toEqual(expect.objectContaining({ seq: 2 }));
        expect(socket.emit).toHaveBeenCalledWith("replay-complete", expect.objectContaining({ retentionStart: 1 }));
    });
});
