# Phase 8: Server Socket Integration - Pattern Map

**Mapped:** 2026-04-22
**Files analyzed:** 4 (2 new, 2 modified)
**Analogs found:** 4 / 4

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/server/sources/app/api/socket/resilienceHandler.ts` | handler | event-driven (socket event listeners) | `apps/server/sources/app/api/socket/machineUpdateHandler.ts` | exact — same signature shape `(userId, socket)`, no `connection` param |
| `apps/server/sources/app/api/socket/resilienceHandler.integration.spec.ts` | test | event-driven + CRUD | `apps/server/sources/app/api/socket/sessionUpdateHandler.changes.integration.spec.ts` | exact — same vi.mock pattern, createDbMocks, createFakeSocket |
| `apps/server/sources/app/events/connectionEventRouter.ts` | service | CRUD (fire-and-forget side-effect on emit) | self (one-line addition to existing `emitUpdate()`) | self-modification |
| `apps/server/sources/app/api/socket.ts` | config/wiring | request-response | self (one-line handler registration in `io.on("connection")`) | self-modification |

---

## Pattern Assignments

### `apps/server/sources/app/api/socket/resilienceHandler.ts` (handler, event-driven)

**Analog:** `apps/server/sources/app/api/socket/machineUpdateHandler.ts`

**Imports pattern** (machineUpdateHandler.ts lines 1-10):
```typescript
import { log } from "@/utils/logging/log";
import { Socket } from "socket.io";
// Protocol constants (resilience-specific):
import {
    SOCKET_RESILIENCE_EVENTS,
    ReconnectResumeRequestSchema,
    AckUpdateRequestSchema,
} from "@happier-dev/protocol/socketResilience";
// Buffer functions (Phase 7):
import { readBuffer, ackBuffer } from "@/app/resilience/unackedBuffer";
```
Note: `writeToBuffer` is NOT imported here — it is imported only in `connectionEventRouter.ts`.

**Function signature pattern** (machineUpdateHandler.ts line 12):
```typescript
// machineUpdateHandler exports a single function — (userId, socket) — no connection param.
// resilienceHandler follows the same shape.
export function resilienceHandler(userId: string, socket: Socket): void {
    socket.on(SOCKET_RESILIENCE_EVENTS.RECONNECT_RESUME, async (data: unknown) => {
        // ...
    });
    socket.on(SOCKET_RESILIENCE_EVENTS.ACK_UPDATE, async (data: unknown) => {
        // ...
    });
}
```

**Zod validation pattern** (rpcHandler.ts — normalizeRpcMethodName as analog; adapt for schema.safeParse):
```typescript
// All event handlers guard on malformed input by returning early (no callback for fire-and-forget events).
// For events without a callback, use safeParse and return early on failure:
const parsed = ReconnectResumeRequestSchema.safeParse(data);
if (!parsed.success) return;
const { sessionId, lastAckedSeq } = parsed.data;
```

**Error handling pattern** (machineUpdateHandler.ts lines 17-53, per event handler):
```typescript
socket.on(SOCKET_RESILIENCE_EVENTS.RECONNECT_RESUME, async (data: unknown) => {
    try {
        // ... handler body ...
    } catch (err) {
        log({ module: 'resilience', level: 'warn' }, `reconnect-resume error: ${err}`);
    }
});
```
Note: `level: 'warn'` (not `'error'`) for resilience failures per D-04 convention — failures are non-fatal.

**Core reconnect-resume pattern** (derived from RESEARCH.md Pattern 3 + unackedBuffer.ts):
```typescript
socket.on(SOCKET_RESILIENCE_EVENTS.RECONNECT_RESUME, async (data: unknown) => {
    try {
        const parsed = ReconnectResumeRequestSchema.safeParse(data);
        if (!parsed.success) return;

        const { lastAckedSeq } = parsed.data;
        const connectionKey = `user-scoped:${userId}`;
        const rows = await readBuffer(userId, connectionKey, lastAckedSeq);

        const retentionStart: number | null = rows.length > 0 ? rows[0].seq : null;

        if (rows.length === 0) {
            // Path 3: empty buffer — release client gate immediately
            socket.emit(SOCKET_RESILIENCE_EVENTS.REPLAY_COMPLETE, { retentionStart: null });
            return;
        }

        // Emit retentionStart BEFORE any replay messages (SRVR-10)
        // Use a replay-start emission so the client gets retentionStart before the loop.
        socket.emit('replay-start', { retentionStart });

        // Gap detection for overflow signal (SRVR-09): if retentionStart > lastAckedSeq + 1,
        // the buffer has a gap — equivalent to overflow from the client's perspective.
        const hasGap = retentionStart !== null && retentionStart > lastAckedSeq + 1;
        if (hasGap) {
            socket.emit(SOCKET_RESILIENCE_EVENTS.BUFFER_OVERFLOW);
        }

        for (const payload of rows) {
            socket.emit('update', payload);
        }

        // Path 1 (with or without overflow): always close the gate
        socket.emit(SOCKET_RESILIENCE_EVENTS.REPLAY_COMPLETE, { retentionStart });
    } catch (err) {
        log({ module: 'resilience', level: 'warn' }, `reconnect-resume error: ${err}`);
    }
});
```

**Core ack-update pattern** (derived from unackedBuffer.ts `ackBuffer` signature):
```typescript
socket.on(SOCKET_RESILIENCE_EVENTS.ACK_UPDATE, async (data: unknown) => {
    try {
        const parsed = AckUpdateRequestSchema.safeParse(data);
        if (!parsed.success) return;

        const { seq } = parsed.data;
        const connectionKey = `user-scoped:${userId}`;
        await ackBuffer(userId, connectionKey, seq);
    } catch (err) {
        log({ module: 'resilience', level: 'warn' }, `ack-update error: ${err}`);
    }
});
```

---

### `apps/server/sources/app/api/socket/resilienceHandler.integration.spec.ts` (test, event-driven + CRUD)

**Analog:** `apps/server/sources/app/api/socket/sessionUpdateHandler.changes.integration.spec.ts`

**Top-level vi.mock hoisting pattern** (sessionUpdateHandler.changes.integration.spec.ts lines 1-56):
```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDbMocks, installDbModuleMock } from "../testkit/dbMocks";
import { createFakeSocket, triggerSocketHandler } from "../testkit/socketHarness";

// All vi.mock calls must be at module top-level (hoisted by vitest).
// Mock logging to keep test output clean.
vi.mock("@/utils/logging/log", () => ({ log: vi.fn() }));

// Mock the unackedBuffer module for SRVR-01 (emitUpdate fire-and-forget test):
const writeToBufferMock = vi.fn();
const readBufferMock = vi.fn();
const ackBufferMock = vi.fn();
vi.mock("@/app/resilience/unackedBuffer", () => ({
    writeToBuffer: (...args: any[]) => writeToBufferMock(...args),
    readBuffer:    (...args: any[]) => readBufferMock(...args),
    ackBuffer:     (...args: any[]) => ackBufferMock(...args),
}));

// Mock eventRouter for SRVR-01 connectionEventRouter test:
const emitUpdateMock = vi.fn();
vi.mock("@/app/events/eventRouter", () => ({
    eventRouter: { emitUpdate: emitUpdateMock },
}));
```

**DB mock setup for unackedMessage** (unackedBuffer.spec.ts lines 5-19 — adapt for integration spec):
```typescript
// readBuffer and ackBuffer do NOT use inTx; writeToBuffer does.
// For reconnect-resume / ack-update tests: only unackedMessage.findMany and .deleteMany needed.
const { db, reset: resetDbMocks } = createDbMocks({
    unackedMessage: ['findMany', 'deleteMany', 'create', 'count'],
} as const);

// writeToBuffer uses inTx → $transaction; wire transaction mock for SRVR-01:
const txMock = createDbTransactionMock(() => ({
    unackedMessage: {
        create:     db.unackedMessage.create,
        count:      db.unackedMessage.count,
        findMany:   db.unackedMessage.findMany,
        deleteMany: db.unackedMessage.deleteMany,
    },
}));

installDbModuleMock({ db: txMock.wrapDb(db) });
```

**Test structure pattern** (sessionUpdateHandler.changes.integration.spec.ts pattern):
```typescript
describe('resilienceHandler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetDbMocks();
    });

    it('reconnect-resume replays buffered messages in seq order (SRVR-02)', async () => {
        db.unackedMessage.findMany.mockResolvedValue([
            { id: '1', seq: 1, payload: { id: 'u1', seq: 1, body: {} }, createdAt: new Date() },
            { id: '2', seq: 2, payload: { id: 'u2', seq: 2, body: {} }, createdAt: new Date() },
        ]);

        const socket = createFakeSocket();
        resilienceHandler('user-1', socket as any);
        await triggerSocketHandler(socket, 'reconnect-resume', {
            sessionId: 'sess-1',
            lastAckedSeq: 0,
        });

        expect(socket.emit).toHaveBeenCalledWith('update', expect.objectContaining({ seq: 1 }));
        expect(socket.emit).toHaveBeenCalledWith('update', expect.objectContaining({ seq: 2 }));
        expect(socket.emit).toHaveBeenCalledWith('replay-complete', expect.objectContaining({ retentionStart: 1 }));
    });
});
```

**Redis conditional-skip pattern** (socket.redisAdapter.integration.spec.ts lines 30-51):
```typescript
// SRVR-05: Redis conditional-skip guard — follows socket.redisAdapter.integration.spec.ts
const REDIS_URL = process.env.REDIS_URL ?? '';
const skipRedis = !REDIS_URL;

describe.skipIf(skipRedis)('resilienceHandler — Postgres/Redis mode (SRVR-05)', () => {
    // same replay behavior test under Redis adapter
});
```

---

### `apps/server/sources/app/events/connectionEventRouter.ts` (service, CRUD — fire-and-forget addition)

**Modification target:** `emitUpdate()` method, lines 50-63

**Current structure** (connectionEventRouter.ts lines 50-63):
```typescript
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
    // ADD HERE: fire-and-forget buffer write (SRVR-01, D-04)
}
```

**Fire-and-forget pattern to add** (locked per D-04, never `await`, never `void`):
```typescript
// After this.emit(...) — placed AFTER the emit call so socket fanout is not delayed.
// PITFALL: Must NOT be placed inside an if(this.io) branch — must run in BOTH paths.
Promise.resolve(
    writeToBuffer(params.userId, `user-scoped:${params.userId}`, params.payload)
).catch((err) =>
    log({ module: 'resilience', level: 'warn' }, `writeToBuffer failed for user ${params.userId}: ${err}`)
);
```

**Required imports to add** (at top of connectionEventRouter.ts, after existing imports):
```typescript
import { writeToBuffer } from '@/app/resilience/unackedBuffer';
import { log } from '@/utils/logging/log';
```
Note: `log` may already be imported — check existing imports before adding.

---

### `apps/server/sources/app/api/socket.ts` (config/wiring — handler registration)

**Modification target:** `io.on("connection")` handler registration block, lines 296-317

**Existing handler registration pattern** (socket.ts lines 296-317):
```typescript
// Handlers — all registered unconditionally except machineTransferHandler (feature-gated)
rpcHandler(userId, socket, userRpcListeners, rpcListeners, { io, redisRegistry: ... });
usageHandler(userId, socket);
sessionUpdateHandler(userId, socket, connection);
pingHandler(socket);
machineUpdateHandler(userId, socket);
// ... machineTransferHandler, artifactUpdateHandler, accessKeyHandler
```

**Registration addition pattern** (guarded on clientType per D-05 / Pitfall 5):
```typescript
// Add after existing handler registrations, before the "Ready" log.
// Guard: only register for user-scoped connections (resilience buffer is user-scoped only).
if (!metadata.clientType || metadata.clientType === 'user-scoped') {
    resilienceHandler(userId, socket);
}
```

**Required import to add** (at top of socket.ts, with existing handler imports):
```typescript
import { resilienceHandler } from './socket/resilienceHandler';
```

---

## Shared Patterns

### Fire-and-Forget (D-04 — cross-cutting for async side-effects)
**Source:** CONTEXT.md D-04 + confirmed in machineUpdateHandler.ts (uses `void` for `redisRegistry.stopRefreshLoopIfIdle()` — but note: project convention explicitly forbids `void`; use `Promise.resolve().catch()` instead)
**Apply to:** `connectionEventRouter.ts` `emitUpdate()`, any async side-effect in socket handlers
```typescript
// CORRECT — errors are captured and logged as warnings
Promise.resolve(asyncFn(...)).catch((err) =>
    log({ module: 'resilience', level: 'warn' }, `operation failed: ${err}`)
);

// WRONG — swallows errors silently
void asyncFn();
```

### Logging Pattern
**Source:** `apps/server/sources/app/api/socket/machineUpdateHandler.ts` lines 119-121
**Apply to:** All catch blocks in resilienceHandler.ts
```typescript
// module label is 'resilience' (matches the domain)
// level is 'warn' for non-fatal resilience failures (not 'error')
log({ module: 'resilience', level: 'warn' }, `reconnect-resume error: ${err}`);
```

### Zod Validation (safeParse — no callback path)
**Source:** `rpcHandler.ts` line 107 (`normalizeRpcMethodName` as analog); `sessionUpdateHandler.ts` lines 40-47 (manual validation)
**Apply to:** `reconnect-resume` and `ack-update` event handlers in resilienceHandler.ts
```typescript
// For events with no callback, use safeParse and return early silently on bad input.
// Do NOT throw or emit an error back — unknown/malformed events are dropped.
const parsed = ReconnectResumeRequestSchema.safeParse(data);
if (!parsed.success) return;
```

### Import Path Convention
**Source:** `apps/server/CLAUDE.md` + all handler files
**Apply to:** All new files in `apps/server/`
```typescript
// Use @/ prefix for all internal imports (absolute, never relative unless same folder)
import { log } from "@/utils/logging/log";
import { readBuffer, ackBuffer } from "@/app/resilience/unackedBuffer";
import { SOCKET_RESILIENCE_EVENTS } from "@happier-dev/protocol/socketResilience";
```

### Handler Test vi.mock Placement
**Source:** `apps/server/sources/app/api/socket/sessionUpdateHandler.changes.integration.spec.ts` lines 6-69
**Apply to:** `resilienceHandler.integration.spec.ts`
- All `vi.mock()` calls must be at the **module top level** (vitest hoists them)
- `installDbModuleMock` uses `vi.doMock` — must be called before the module under test is imported
- Import the module under test **after** all mocks are installed (dynamic import or top-level with mock-first ordering)

---

## Critical Pitfalls (from RESEARCH.md — copy into plan)

| Pitfall | Prevention |
|---------|-----------|
| Fire-and-forget placed inside `if (this.io)` branch | Place `Promise.resolve(writeToBuffer(...)).catch(...)` AFTER `this.emit(...)` call, at the same level — not nested in either branch |
| `retentionStart` arrives after replay messages | Emit `socket.emit('replay-start', { retentionStart })` BEFORE the replay loop |
| `replay-complete` skipped on one path | Always emit `replay-complete` in all 3 paths: empty buffer (early return), after loop, after buffer-overflow signal |
| `resilienceHandler` registered for machine/session-scoped sockets | Guard registration: `if (!metadata.clientType \|\| metadata.clientType === 'user-scoped')` |
| Integration tests run with `yarn test` | Must run with `yarn vitest ... resilienceHandler.integration.spec.ts` explicitly; `yarn test` excludes `*.integration.spec.ts` |
| Overflow detection: `readBuffer` does not return overflow flag | Use gap detection: `retentionStart > lastAckedSeq + 1` signals buffer overflow |

---

## No Analog Found

No files are entirely without analog. All 4 files have close matches in the codebase.

---

## Metadata

**Analog search scope:**
- `apps/server/sources/app/api/socket/` (handler files)
- `apps/server/sources/app/events/` (connectionEventRouter)
- `apps/server/sources/app/api/testkit/` (socketHarness, dbMocks)
- `apps/server/sources/app/resilience/` (unackedBuffer — Phase 7 output)
- `packages/protocol/src/` (socketResilience.ts)

**Files scanned:** 11 analog files read directly
**Pattern extraction date:** 2026-04-22
