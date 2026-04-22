# Phase 8: Server Socket Integration - Research

**Researched:** 2026-04-22
**Domain:** Socket.IO handler integration, fire-and-forget async patterns, vitest integration testing
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** New file `sources/app/api/socket/resilienceHandler.ts` — mirrors existing handler pattern (`sessionUpdateHandler.ts`, `rpcHandler.ts`, `machineUpdateHandler.ts`). Registered in `socket.ts` alongside other handlers.
- **D-02:** Redis integration test uses conditional skip — follows existing `socket.redisAdapter.integration.spec.ts` pattern. Skips cleanly when Redis is unavailable.
- **D-03:** RED/GREEN two-plan split — Plan A writes all failing integration tests first (SRVR-01 through SRVR-10 coverage). Plan B implements `resilienceHandler.ts` and `emitUpdate()` buffer wiring to make them green.
- **D-04:** `writeToBuffer` called inside `connectionEventRouter.ts`'s `emitUpdate()` as fire-and-forget — `Promise.resolve(writeToBuffer(...)).catch((err) => log({ level: 'warn' }, ...))` pattern, never `await`ed. Failures logged as warnings only.
- **D-05:** `connectionKey = 'user-scoped:${userId}'` — derived from the Socket.IO room prefix already established in Phase 7. The `reconnect-resume` handler extracts `userId` from the authenticated socket and forms the key.

### Claude's Discretion

- Whether SRVR-10's `retentionStart` query uses `MIN(seq)` via a separate DB query or is derived from the first result of `readBuffer` — Claude decides based on query efficiency.
- Whether `resilienceHandler.ts` exports a single function or separate named exports for each event — follow the existing handler file pattern.
- How SRVR-07 regression guard is structured in the test file — whether it is a `describe` block importing the test directly or a snapshot assertion.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SRVR-01 | Relay writes every outbound `UpdatePayload` to the buffer as a fire-and-forget side-effect of `emitUpdate()` | Fire-and-forget pattern confirmed from `connectionEventRouter.ts` structure; `writeToBuffer` is already built and imported |
| SRVR-02 | Relay replays buffered messages in order when a client emits `reconnect-resume` | `readBuffer` returns `UpdatePayload[]` in seq-ascending order; `SOCKET_RESILIENCE_EVENTS.RECONNECT_RESUME` event name and `ReconnectResumeRequestSchema` are both available from protocol package |
| SRVR-03 | Relay removes buffer entries when a client emits `ack-update` | `ackBuffer(userId, connectionKey, ackedSeq)` is idempotent by `deleteMany` with `lte` |
| SRVR-04 | Integration test: SQLite disconnect → reconnect → receives buffered messages in order | Integration test pattern verified from `sessionUpdateHandler.changes.integration.spec.ts` and `rpcHandler.integration.spec.ts` |
| SRVR-05 | Integration test: same replay in Postgres/Redis mode | Conditional-skip Redis guard pattern verified from `socket.redisAdapter.integration.spec.ts` |
| SRVR-06 | Integration test: ack → disconnect → reconnect → replay is empty | Covered by wiring `ackBuffer` in the test before triggering `reconnect-resume` handler |
| SRVR-07 | Existing `sessionClient.startupCatchUpRetry.test.ts` passes unchanged | File read and understood; tests exercise prototype methods only — resilience layer does not touch `ApiSessionClient` |
| SRVR-08 | Relay silently ignores `ack-update` for seq values already discarded | `ackBuffer` uses `deleteMany` — already idempotent at DB level; no extra code needed |
| SRVR-09 | Relay emits `replay-complete` in all three paths: after last replay, after buffer-overflow, when buffer is empty | Three code paths in handler confirmed; `SOCKET_RESILIENCE_EVENTS.REPLAY_COMPLETE` event constant available |
| SRVR-10 | Relay's response includes `retentionStart` before any replay messages | Derivable from first entry of `readBuffer` result (seq ordered asc); no extra DB query needed |

</phase_requirements>

---

## Summary

Phase 8 wires the unacked-buffer functions built in Phase 7 into the live Socket.IO connection and proves correctness with integration tests. There are two new code surfaces: (1) a one-line fire-and-forget side-effect added to `emitUpdate()` in `connectionEventRouter.ts`, and (2) a new handler file `resilienceHandler.ts` that registers `reconnect-resume` and `ack-update` listeners.

The codebase already has all primitives: `writeToBuffer`, `readBuffer`, `ackBuffer` (Phase 7), the event constants and schemas (`SOCKET_RESILIENCE_EVENTS`, `ReconnectResumeRequestSchema`, `AckUpdateRequestSchema`) from Phase 6, and a test infrastructure that makes wiring integration tests straightforward (fake-socket harness, db mocks, env-reset helpers).

The only discretionary decision remaining is whether `retentionStart` is a separate `MIN(seq)` query or derived from `readBuffer`'s first result. Deriving from the first result is more efficient — `readBuffer` already orders by `seq asc` and runs one query; using `rows[0]?.seq ?? null` avoids a second round-trip. This recommendation is documented below.

**Primary recommendation:** Follow the D-03 TDD split strictly. Plan A writes red integration tests for all ten SRVR requirements. Plan B makes them green with minimal implementation in `resilienceHandler.ts` and one line in `emitUpdate()`. The regression gate (SRVR-07) requires no code change — just a vitest run confirmation.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Buffer write on emit | API / Backend | — | `emitUpdate()` is a server singleton method; the side-effect lives entirely on the relay server |
| `reconnect-resume` handler | API / Backend | Database/Storage | Handler runs on the relay; calls `readBuffer` which queries the DB |
| `ack-update` handler | API / Backend | Database/Storage | Handler runs on the relay; calls `ackBuffer` which deletes DB rows |
| Socket handler registration | API / Backend | — | `socket.ts` `io.on("connection")` block; pure server-side wiring |
| Integration test harness | API / Backend | — | Vitest tests run in the server process; fake sockets mock the Socket.IO layer |
| Redis adapter mode | API / Backend | CDN / Static | Redis Streams adapter is a server-to-server pub/sub layer; no client involvement |

---

## Standard Stack

### Core (all already installed in the server package)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| socket.io | (project-installed) | Socket.IO server — real socket in integration tests | Only real-time layer in the project [VERIFIED: `apps/server/sources/app/api/socket.ts`] |
| @prisma/client | (project-installed) | DB access for buffer read/write/ack | Already used by `unackedBuffer.ts` [VERIFIED: `unackedBuffer.ts`] |
| vitest | (project-installed) | Test framework | Project standard [VERIFIED: `vitest.config.ts`] |
| zod | (project-installed) | Schema validation of incoming socket payloads | Project standard [VERIFIED: `apps/server/CLAUDE.md`] |
| @happier-dev/protocol | (workspace package) | Event constants and request schemas | Built in Phase 6 [VERIFIED: `socketResilience.ts`] |

### Supporting (test infrastructure — already exists)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `testkit/socketHarness.ts` | — | `createFakeSocket`, `getSocketHandler`, `triggerSocketHandler` | All handler unit/integration tests |
| `testkit/dbMocks.ts` | — | `createDbMocks`, `installDbModuleMock`, `createDbTransactionMock` | Tests that need mocked DB |
| `testkit/env.ts` | — | `createEnvReset`, `createEnvPatcher` | Tests that manipulate process.env |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Deriving `retentionStart` from `readBuffer` first row | Separate `aggregate({ _min: { seq } })` query | Extra DB round-trip for no correctness benefit; first-row approach is sufficient |
| `Promise.resolve(fn()).catch(...)` fire-and-forget | `void fn()` | `void` swallows errors silently; the project convention rejects it [VERIFIED: CONTEXT.md D-04] |

---

## Architecture Patterns

### System Architecture Diagram

```
Client socket event: reconnect-resume
        |
        v
resilienceHandler.ts
  parse ReconnectResumeRequestSchema (zod)
        |
        v
  readBuffer(userId, connectionKey, lastAckedSeq)
        |
        +-- rows.length === 0 ---------+
        |                             |
        | rows.length > 0             |
        v                             |
  retentionStart = rows[0].seq        |
  socket.emit('replay-complete',      |
    { retentionStart: null })         |
                                      |
  for each row in rows:              |
    socket.emit('update', payload)   |
                                     |
  writeToBuffer returned             |
    { overflow: true }?              |
    YES: socket.emit('buffer-overflow') --> socket.emit('replay-complete', { retentionStart })
    NO:  socket.emit('replay-complete', { retentionStart })

Client socket event: ack-update
        |
        v
resilienceHandler.ts
  parse AckUpdateRequestSchema (zod)
        |
        v
  ackBuffer(userId, connectionKey, seq)  [idempotent]

emitUpdate() in connectionEventRouter.ts
        |
        +-- existing socket fanout (io.to(rooms).emit(...))
        |
        +-- fire-and-forget buffer write:
             Promise.resolve(
               writeToBuffer(userId, 'user-scoped:' + userId, payload)
             ).catch((err) => log({ level: 'warn' }, ...))
```

### Recommended Project Structure

```
apps/server/sources/
├── app/
│   ├── api/
│   │   ├── socket/
│   │   │   └── resilienceHandler.ts     # NEW — reconnect-resume + ack-update handlers
│   │   └── socket.ts                   # MODIFY — register resilienceHandler
│   └── events/
│       └── connectionEventRouter.ts    # MODIFY — fire-and-forget writeToBuffer in emitUpdate()
└── (all other files unchanged)

Test files:
apps/server/sources/app/api/socket/
└── resilienceHandler.integration.spec.ts   # NEW — SRVR-01 to SRVR-10 coverage
                                             # (SRVR-05 Redis variant inside same file with skip guard)
```

### Pattern 1: Handler file signature (single exported function)

All existing handler files export a single function taking `(userId, socket, connection?)`. Based on `machineUpdateHandler.ts` (no connection needed) and `sessionUpdateHandler.ts` (connection needed), `resilienceHandler` needs `userId` and `socket` but NOT `connection` — it is not emitting to other sockets, only to the reconnecting socket itself.

```typescript
// Source: apps/server/sources/app/api/socket/machineUpdateHandler.ts (pattern)
// 4-space indent, @/ imports, functional — no class
import { Socket } from "socket.io";
import { log } from "@/utils/logging/log";
import { SOCKET_RESILIENCE_EVENTS, ReconnectResumeRequestSchema, AckUpdateRequestSchema } from "@happier-dev/protocol/socketResilience";
import { readBuffer, ackBuffer } from "@/app/resilience/unackedBuffer";

export function resilienceHandler(userId: string, socket: Socket): void {
    socket.on(SOCKET_RESILIENCE_EVENTS.RECONNECT_RESUME, async (data: unknown) => {
        // ...
    });
    socket.on(SOCKET_RESILIENCE_EVENTS.ACK_UPDATE, async (data: unknown) => {
        // ...
    });
}
```

[VERIFIED: `machineUpdateHandler.ts`, `sessionUpdateHandler.ts` — pattern confirmed]

### Pattern 2: Fire-and-forget with logged warning

```typescript
// Source: CONTEXT.md D-04 (locked decision)
// In emitUpdate() after the existing this.emit(...) call:
Promise.resolve(writeToBuffer(params.userId, `user-scoped:${params.userId}`, params.payload))
    .catch((err) => log({ module: 'resilience', level: 'warn' }, `writeToBuffer failed: ${err}`));
```

Note: `writeToBuffer` already enforces CLI exclusion via the `connectionKey.startsWith('user-scoped:')` guard, so the caller does not need to repeat this check. Passing `'user-scoped:' + userId` unconditionally is correct — `writeToBuffer` will silently no-op for non-user-scoped keys.

[VERIFIED: `unackedBuffer.ts` line 28]

### Pattern 3: reconnect-resume handler (three paths, always emit replay-complete)

```typescript
socket.on(SOCKET_RESILIENCE_EVENTS.RECONNECT_RESUME, async (data: unknown) => {
    try {
        const parsed = ReconnectResumeRequestSchema.safeParse(data);
        if (!parsed.success) return;

        const { lastAckedSeq } = parsed.data;
        const connectionKey = `user-scoped:${userId}`;
        const rows = await readBuffer(userId, connectionKey, lastAckedSeq);

        // retentionStart: oldest seq still in the buffer (first row because ordered asc)
        const retentionStart: number | null = rows.length > 0 ? rows[0].seq : null;

        // Emit retentionStart before any replay messages (SRVR-10)
        // NOTE: retentionStart is emitted as part of reconnect-resume acknowledgement,
        // not as a separate event — exact wire format is Claude's discretion.
        // Simplest: attach to replay-complete or emit retentionStart inline first.

        if (rows.length === 0) {
            // Path 3: buffer empty
            socket.emit(SOCKET_RESILIENCE_EVENTS.REPLAY_COMPLETE, { retentionStart: null });
            return;
        }

        // Check overflow flag — readBuffer does not expose it directly.
        // writeToBuffer returns { overflow } but readBuffer does not.
        // Overflow detection must come from a separate source or be inferred.
        // See "Open Questions" for the overflow detection design choice.

        for (const payload of rows) {
            socket.emit('update', payload);
        }

        socket.emit(SOCKET_RESILIENCE_EVENTS.REPLAY_COMPLETE, { retentionStart });
    } catch (err) {
        log({ module: 'resilience', level: 'warn' }, `reconnect-resume error: ${err}`);
    }
});
```

[VERIFIED: pattern derived from `unackedBuffer.ts` `readBuffer` signature and CONTEXT.md specifics]

### Pattern 4: Integration test mock setup (Redis skip guard)

```typescript
// Source: socket.redisAdapter.integration.spec.ts (pattern)
const REDIS_URL = process.env.REDIS_URL ?? '';
const skipRedis = !REDIS_URL;

describe.skipIf(skipRedis)('resilienceHandler — Postgres/Redis mode (SRVR-05)', () => {
    // ...
});
```

[VERIFIED: `socket.redisAdapter.integration.spec.ts`]

### Pattern 5: Integration test structure for handler tests

```typescript
// Source: sessionUpdateHandler.changes.integration.spec.ts (pattern)
// vi.mock calls at top-level (hoisted)
vi.mock("@/app/events/eventRouter", () => ({ ... }));
vi.mock("@/storage/db", () => ({ ... }));

// createDbMocks + installDbModuleMock for isolated DB
const dbMocks = createDbMocks({ unackedMessage: [...] } as const);
installDbModuleMock({ db: dbMocks.db });

it('...', async () => {
    dbMocks.db.unackedMessage.findMany.mockResolvedValue([...]);
    const socket = createFakeSocket();
    resilienceHandler('user-1', socket as any);
    await triggerSocketHandler(socket, 'reconnect-resume', { sessionId: 'sess-1', lastAckedSeq: 0 });
    expect(socket.emit).toHaveBeenCalledWith('update', expect.objectContaining({ seq: 1 }));
    expect(socket.emit).toHaveBeenCalledWith('replay-complete', expect.any(Object));
});
```

[VERIFIED: `sessionUpdateHandler.changes.integration.spec.ts` structure, `socketHarness.ts` `triggerSocketHandler` export]

### Anti-Patterns to Avoid

- **`void asyncFn()`**: Swallows errors silently. Use `Promise.resolve(asyncFn()).catch(logWarn)` for fire-and-forget. [VERIFIED: CONTEXT.md D-04]
- **`await writeToBuffer(...)` in `emitUpdate()`**: Blocks the emit path. Never await on the critical path. [VERIFIED: SRVR-01, D-04]
- **Conditional `replay-complete` based on path**: Client code must not special-case which path was taken. Always emit `replay-complete` in all three paths (empty buffer, replay done, overflow). [VERIFIED: CONTEXT.md specifics, SRVR-09]
- **Forgetting `retentionStart` before replay messages**: `retentionStart` must be available to the client before any replay messages arrive (SRVR-10). Include it in the first emission, not at the end.
- **Using `void` connection in resilienceHandler**: Unlike `sessionUpdateHandler`, `resilienceHandler` emits only to the reconnecting socket — no need to pass `connection` or call `eventRouter.emitUpdate`.
- **Modifying `AcpBackend.ts` or `startDaemon.ts`**: Out of scope per REQUIREMENTS.md. These tech-debt files must not be touched.
- **Running migrations**: Never create or run migrations per `apps/server/CLAUDE.md`. Phase 7 already applied the schema; this phase has no schema changes.

---

## Solved Problems

| Problem | Build Nothing — Use Instead | Why |
|---------|-----------------------------|-----|
| Buffer write, cap, overflow | `writeToBuffer` from `@/app/resilience/unackedBuffer` | Phase 7 — fully tested |
| Buffer read (ordered by seq) | `readBuffer` from `@/app/resilience/unackedBuffer` | Already orders by `seq asc` |
| Buffer ack (idempotent discard) | `ackBuffer` from `@/app/resilience/unackedBuffer` | `deleteMany lte` is idempotent |
| Event names and request schemas | `SOCKET_RESILIENCE_EVENTS`, `ReconnectResumeRequestSchema`, `AckUpdateRequestSchema` from `@happier-dev/protocol/socketResilience` | Phase 6 |
| Fake socket for tests | `createFakeSocket`, `getSocketHandler`, `triggerSocketHandler` from `testkit/socketHarness` | Existing harness |
| DB mocking in tests | `createDbMocks`, `installDbModuleMock` from `testkit/dbMocks` | Existing infrastructure |
| Env reset in tests | `createEnvReset` from `testkit/env` | Existing utility |

---

## Common Pitfalls

### Pitfall 1: `retentionStart` design — where does it go in the wire protocol?

**What goes wrong:** SRVR-10 says `retentionStart` is "sent before any replay messages." The `SOCKET_RESILIENCE_EVENTS` constants include `REPLAY_COMPLETE` and `BUFFER_OVERFLOW` but have no dedicated `retentionStart` event. Attaching `retentionStart` to `replay-complete` means the client only gets it after replay ends, which defeats the proactive detection purpose.

**Root cause:** The protocol package (Phase 6) defines the event constants but does not define the payload shape for `replay-complete`. The payload shape is Phase 8's responsibility.

**Prevention:** Emit `retentionStart` as metadata on the `replay-complete` event payload **and** also emit it at the top of the reconnect-resume handler before any `update` events — i.e., a first `socket.emit('replay-start', { retentionStart })` or by attaching it to the first emitted message. The cleanest approach: send `retentionStart` as a field in a preliminary `socket.emit('replay-start', { retentionStart })` before the loop, then `replay-complete` at the end. Since Phase 9 consumes this, Claude should pick the approach that Phase 9 can test — either a separate event or a well-defined first emission.

**Open question tagged below:** The exact wire event for `retentionStart` delivery is Claude's discretion.

### Pitfall 2: `emitUpdate()` wiring skips filter-gated paths

**What goes wrong:** `emitUpdate()` has two code paths: the Socket.IO room-based path (when `this.io` is set) and the legacy in-memory path (when `this.io` is null). The fire-and-forget write must run in **both** paths, not only in the room-based path.

**Root cause:** Adding the `Promise.resolve(writeToBuffer(...)).catch(...)` line after the `return` in the Socket.IO branch would silently skip buffering in the in-memory fallback path.

**Prevention:** Place the `writeToBuffer` fire-and-forget call BEFORE the `if (this.io)` branch, or after both branches complete. Confirm the call site in `connectionEventRouter.ts`.

[VERIFIED: `connectionEventRouter.ts` lines 131–168 — the two paths both end before `return`]

### Pitfall 3: overflow flag is not surfaced by `readBuffer`

**What goes wrong:** `writeToBuffer` returns `{ overflow: boolean }`, but `readBuffer` does not signal overflow — it simply returns what is in the buffer. After a buffer overflow, the oldest messages were trimmed. The handler reading from `readBuffer` cannot know the buffer was previously trimmed just from the result.

**Root cause:** `readBuffer` is intentionally pure: it returns what is there. The overflow flag was produced at write time and is not persisted.

**Prevention:** Overflow detection at reconnect time must come from a separate source. Two options:
1. Query `ClientAckState` (if it has an `overflowed` flag — check schema from Phase 7)
2. Compare `retentionStart` (lowest seq in the buffer) against `lastAckedSeq + 1`: if `retentionStart > lastAckedSeq + 1`, the buffer has a gap — effectively the same signal as overflow
The CONTEXT.md specifics say "after `buffer-overflow` is signalled" — this implies the signal must be emitted. Option 2 is the gap-detection approach; it does not require a persisted overflow flag.

**Warning signs:** If SRVR-05 / SRVR-09 test for `buffer-overflow` event and the implementation cannot detect overflow from DB state, the test will fail.

**Recommendation (Claude's decision):** Use gap detection: if `retentionStart > lastAckedSeq + 1`, emit `SOCKET_RESILIENCE_EVENTS.BUFFER_OVERFLOW` before `replay-complete`. This is algebraically equivalent to overflow from the client's perspective and requires no schema change.

### Pitfall 4: `integration.spec.ts` files are excluded from the default vitest run

**What goes wrong:** `vitest.config.ts` explicitly excludes `**/*.integration.spec.ts` from the default test run. Running `yarn test` will not run the new integration tests.

**Root cause:** By design — integration tests require a real DB or specific env setup.

**Prevention:** Integration tests must be run with a command that explicitly includes them. Check the existing integration test run command. All existing `*.integration.spec.ts` files use `vi.mock` for DB rather than real DB — they are "module-mock integration tests" that run without a real DB. The new file should follow the same pattern (mock DB, fake socket) and can be run via the vitest include pattern override.

[VERIFIED: `vitest.config.ts` exclude list]

### Pitfall 5: Handler registration must guard on `connectionType`

**What goes wrong:** `resilienceHandler` uses `connectionKey = 'user-scoped:' + userId`. If a `machine-scoped` or `session-scoped` socket connects and emits `reconnect-resume`, the handler will call `readBuffer` with a non-user-scoped key. `readBuffer` will return no rows (the CLI exclusion is at write time, not at read time), so the replay will be empty — which is harmless. But `ackBuffer` called from `ack-update` on a machine-scoped socket would attempt a `deleteMany` with a machine-scoped key, and would find nothing (again harmless, but wasteful).

**Prevention:** Guard the handler registration in `socket.ts` to only register `resilienceHandler` for `user-scoped` connections. The connection type is available in `socket.ts` via `metadata.clientType`. [VERIFIED: `socket.ts` line 210]

---

## retentionStart Decision (Claude's Discretion — Resolved)

**Decision:** Derive `retentionStart` from the first entry of the `readBuffer` result.

**Rationale:** `readBuffer` orders results by `seq asc`. The first row has the smallest seq — that is `retentionStart`. No second DB query is needed.

```typescript
const rows = await readBuffer(userId, connectionKey, lastAckedSeq);
const retentionStart: number | null = rows.length > 0 ? rows[0].seq : null;
```

This is efficient (one query) and correct (buffer is ordered).

**Confidence:** HIGH [VERIFIED: `unackedBuffer.ts` `readBuffer` implementation — `orderBy: { seq: 'asc' }`]

---

## resilienceHandler Export Pattern (Claude's Discretion — Resolved)

**Decision:** Single named export `resilienceHandler(userId, socket)` — no `connection` parameter.

**Rationale:** All existing handler files export a single function. `resilienceHandler` does not need to call `eventRouter.emitUpdate` (it emits directly to the reconnecting socket via `socket.emit`), so `connection` is not needed. Pattern matches `machineUpdateHandler(userId, socket)`.

[VERIFIED: `machineUpdateHandler.ts` signature]

---

## SRVR-07 Regression Guard (Claude's Discretion — Resolved)

**Decision:** SRVR-07 is satisfied by running the existing test file unchanged. The test spec file `sessionClient.startupCatchUpRetry.test.ts` exercises `ApiSessionClient` prototype methods directly with fake timers and no dependency on the resilience layer. No modifications to the test file are needed or permitted. The plan should include a step to confirm `yarn test` passes in `apps/cli`.

**What the test checks:** `scheduleNextStartupMessageCatchUpRetry()` calls `catchUpSessionMessages(startupMessageCatchUpInitialAfterSeq)` — the startup cursor, not `lastObservedMessageSeq`. This is independent of server-side resilience.

[VERIFIED: `sessionClient.startupCatchUpRetry.test.ts`]

---

## Code Examples

### Registering resilienceHandler in socket.ts

```typescript
// Source: apps/server/sources/app/api/socket.ts pattern (io.on "connection" block)
// Add this line after the existing handler registrations, guarded by clientType:
if (metadata.clientType === 'user-scoped' || !metadata.clientType) {
    resilienceHandler(userId, socket);
}
```

The guard is important — only user-scoped connections should receive resilience events (STORE-07 / D-05).

### emitUpdate() modification in connectionEventRouter.ts

The `emitUpdate()` method currently has this structure:

```typescript
emitUpdate(params: { userId: string; payload: UpdatePayload; ... }): void {
    this.emit({
        userId: params.userId,
        eventName: 'update',
        payload: params.payload,
        ...
    });
    // ADD HERE: fire-and-forget buffer write
    Promise.resolve(
        writeToBuffer(params.userId, `user-scoped:${params.userId}`, params.payload)
    ).catch((err) =>
        log({ module: 'resilience', level: 'warn' }, `writeToBuffer failed for user ${params.userId}: ${err}`)
    );
}
```

The `writeToBuffer` call is placed after `this.emit(...)` completes. Because `emitUpdate()` is a synchronous function (it does not `return` a Promise), the fire-and-forget is purely a side-effect — the caller's event loop is not blocked.

[VERIFIED: `connectionEventRouter.ts` `emitUpdate()` is `void`-returning, not `async`]

---

## Open Questions (RESOLVED)

1. **Wire event for `retentionStart` delivery before replay**
   - What we know: SRVR-10 requires `retentionStart` to arrive before replay messages. `replay-complete` arrives after.
   - What is unclear: Is there a dedicated event (e.g., `replay-start`) or should `retentionStart` be sent as an initial `socket.emit` call before the replay loop?
   - RESOLVED: Use a separate `socket.emit('replay-start', { retentionStart })` before the replay loop. Implementation in Plan 02 Task 1 confirms this wire format. `replay-complete` closes the gate at the end of all paths.

2. **Overflow detection without a persisted overflow flag**
   - What we know: `writeToBuffer` returns `{ overflow }` at write time; `readBuffer` does not surface this.
   - What is unclear: Is there an `overflowed` column in `ClientAckState` or `UnackedMessage` from Phase 7 schema?
   - RESOLVED: Use gap detection (Pitfall 3). If `retentionStart > lastAckedSeq + 1`, emit `SOCKET_RESILIENCE_EVENTS.BUFFER_OVERFLOW` before replay. No `overflowed` column exists in Phase 7 schema; algebraic gap detection is correct and requires no schema change.

3. **Integration test DB setup for `readBuffer`**
   - What we know: Integration tests mock the DB via `vi.mock` and `createDbMocks`. `readBuffer` calls `db.unackedMessage.findMany`.
   - What is unclear: Whether `inTx` (used only by `writeToBuffer`) needs the transaction mock in the reconnect-resume integration test.
   - RESOLVED: Only `writeToBuffer` uses `inTx`; `readBuffer` and `ackBuffer` do not use transactions. SRVR-01 tests use `createDbTransactionMock`; SRVR-02/SRVR-03 tests use plain `createDbMocks` without the transaction wrapper. Plan 01 Task 1 implements this separation.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| vitest | All tests | ✓ | (project-installed) | — |
| @prisma/client | `unackedBuffer.ts` | ✓ | (project-installed) | — |
| socket.io | `socket.ts` | ✓ | (project-installed) | — |
| Redis (REDIS_URL) | SRVR-05 | conditional | — | Skip via `describe.skipIf(!REDIS_URL)` |

Redis is optional — SRVR-05 tests skip cleanly when unavailable per D-02.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | `apps/server/vitest.config.ts` |
| Quick run command | `yarn test` (from `apps/server`) |
| Integration run command | `yarn vitest --reporter verbose sources/app/api/socket/resilienceHandler.integration.spec.ts` |
| Full suite command | `yarn test` |

Note: `*.integration.spec.ts` files are excluded from `yarn test`. They must be run explicitly or via a separate vitest command that overrides the exclude pattern. Existing integration tests (e.g. `machineTransferHandler.integration.spec.ts`) follow this convention.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SRVR-01 | `emitUpdate()` calls `writeToBuffer` fire-and-forget | integration (module-mock) | `yarn vitest ... resilienceHandler.integration.spec.ts` | no — Wave 0 |
| SRVR-02 | `reconnect-resume` replays buffer in order | integration (module-mock) | `yarn vitest ... resilienceHandler.integration.spec.ts` | no — Wave 0 |
| SRVR-03 | `ack-update` calls `ackBuffer` | integration (module-mock) | `yarn vitest ... resilienceHandler.integration.spec.ts` | no — Wave 0 |
| SRVR-04 | SQLite: disconnect → reconnect → ordered replay | integration (module-mock, SQLite path) | `yarn vitest ... resilienceHandler.integration.spec.ts` | no — Wave 0 |
| SRVR-05 | Postgres/Redis: same replay behavior | integration (Redis skip guard) | `yarn vitest ... resilienceHandler.integration.spec.ts` | no — Wave 0 |
| SRVR-06 | ack → reconnect → empty replay | integration (module-mock) | `yarn vitest ... resilienceHandler.integration.spec.ts` | no — Wave 0 |
| SRVR-07 | `startupCatchUpRetry.test.ts` passes unchanged | unit (existing) | `yarn test` (from `apps/cli`) | yes — existing |
| SRVR-08 | Re-ack of discarded seq is no-op | integration (module-mock) | `yarn vitest ... resilienceHandler.integration.spec.ts` | no — Wave 0 |
| SRVR-09 | `replay-complete` in all three paths | integration (module-mock) | `yarn vitest ... resilienceHandler.integration.spec.ts` | no — Wave 0 |
| SRVR-10 | `retentionStart` sent before replay messages | integration (module-mock) | `yarn vitest ... resilienceHandler.integration.spec.ts` | no — Wave 0 |

### Sampling Rate

- **Per task commit (Plan A):** Verify test file exists and tests are RED (failing with "not implemented" or import error)
- **Per task commit (Plan B):** `yarn vitest ... resilienceHandler.integration.spec.ts` — all tests GREEN
- **Phase gate:** `yarn test` (apps/server) + `yarn test` (apps/cli for SRVR-07) both green

### Wave 0 Gaps

- [ ] `sources/app/api/socket/resilienceHandler.integration.spec.ts` — covers SRVR-01 through SRVR-10
- [ ] No framework install needed — vitest already configured
- [ ] No fixtures needed — `createDbMocks`, `createFakeSocket` already in testkit

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes — socket auth is already enforced in `socket.ts` middleware | Existing JWT verify via `auth.verifyToken`; handler only runs after auth |
| V3 Session Management | no — handler emits to the authenticated socket directly, no session switching | — |
| V4 Access Control | yes — handler must only replay messages belonging to the authenticated userId | `connectionKey = 'user-scoped:' + userId` is derived from the authenticated socket; no user-supplied connectionKey is accepted |
| V5 Input Validation | yes — incoming `reconnect-resume` and `ack-update` payloads must be validated | Zod `ReconnectResumeRequestSchema.safeParse(data)` and `AckUpdateRequestSchema.safeParse(data)` |
| V6 Cryptography | no — buffer contains `UpdatePayload` which is already encrypted before it reaches the relay | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| User replaying another user's buffer | Elevation of Privilege | `connectionKey` is `user-scoped:${userId}` where `userId` comes from the verified JWT, not from client input; `readBuffer` scoped to `userId` |
| Client sending arbitrary `lastAckedSeq` to drain future messages | Tampering | `readBuffer` uses `seq > lastAckedSeq` — it can only replay messages already in the buffer; no future messages are returned |
| Client sending negative or non-integer `seq` in `ack-update` | Tampering | `AckUpdateRequestSchema` enforces `z.number().int().min(0)` |
| Replay flooding (reconnect-resume sent repeatedly) | DoS | No rate limiting in scope for v1.3; acceptable risk — the buffer is capped at 500 messages per user |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `resilienceHandler` needs no `connection` parameter | Handler Export Pattern | Low — if it did need connection, the function signature must be updated and the registration call in `socket.ts` must pass `connection` |
| A2 | Gap detection (`retentionStart > lastAckedSeq + 1`) is sufficient for `buffer-overflow` signal; no persisted overflow flag exists in Phase 7 schema | Pitfall 3 / Open Questions | Medium — if Phase 7 schema added an `overflowed` column, use that instead; otherwise gap detection is correct |
| A3 | `*.integration.spec.ts` files using `vi.mock` for DB run without a real database | Validation Architecture | Low — confirmed by examining `machineTransferHandler.integration.spec.ts` and `sessionUpdateHandler.changes.integration.spec.ts` which both use `vi.mock` not a real DB |
| A4 | `resilienceHandler` should be guarded to `user-scoped` connections only in `socket.ts` | Common Pitfalls / Registration | Low — even without the guard, `readBuffer` returns nothing for non-user-scoped keys; guard is a defensive best practice |

---

## Sources

### Primary (HIGH confidence)

- `apps/server/sources/app/resilience/unackedBuffer.ts` — `writeToBuffer`, `readBuffer`, `ackBuffer` signatures and behavior [VERIFIED]
- `packages/protocol/src/socketResilience.ts` — event constants, schemas, `ACK_DEBOUNCE_MS` [VERIFIED]
- `apps/server/sources/app/events/connectionEventRouter.ts` — `emitUpdate()` structure and both code paths [VERIFIED]
- `apps/server/sources/app/api/socket.ts` — handler registration pattern, connection type extraction, existing handler list [VERIFIED]
- `apps/server/sources/app/api/testkit/socketHarness.ts` — `createFakeSocket`, `getSocketHandler`, `triggerSocketHandler` [VERIFIED]
- `apps/server/sources/app/api/testkit/dbMocks.ts` — `createDbMocks`, `installDbModuleMock`, `createDbTransactionMock` [VERIFIED]
- `apps/server/vitest.config.ts` — test include/exclude patterns, integration test exclusion [VERIFIED]
- `apps/server/sources/app/api/socket/sessionUpdateHandler.ts` — handler function signature and style [VERIFIED]
- `apps/server/sources/app/api/socket/machineUpdateHandler.ts` — minimal handler signature (no connection param) [VERIFIED]
- `apps/server/sources/app/resilience/unackedBuffer.spec.ts` — DB mock patterns for buffer functions [VERIFIED]
- `apps/cli/src/api/session/sessionClient.startupCatchUpRetry.test.ts` — SRVR-07 regression gate content [VERIFIED]
- `apps/server/sources/app/api/socket/sessionUpdateHandler.changes.integration.spec.ts` — integration test pattern with vi.mock and createDbMocks [VERIFIED]
- `apps/server/CLAUDE.md` — 4-space indent, `@/` imports, yarn, never run migrations [VERIFIED]
- `.planning/phases/08-server-socket-integration/08-CONTEXT.md` — all locked decisions [VERIFIED]

### Secondary (MEDIUM confidence)

- `apps/server/sources/app/api/socket.redisAdapter.integration.spec.ts` — Redis conditional-skip pattern (`describe.skipIf`) [VERIFIED from file read]
- `apps/server/sources/app/events/eventPayloadTypes.ts` — `UpdatePayload` interface shape [VERIFIED]
- `apps/server/sources/app/api/socketRooms.ts` — `user-scoped:${userId}` room naming [VERIFIED]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed; no new dependencies
- Architecture: HIGH — handler pattern confirmed from 5+ existing handler files; buffer functions verified
- Pitfalls: HIGH — overflow detection gap is the only genuine uncertainty; all other pitfalls derived from direct code inspection
- Integration test strategy: HIGH — module-mock integration pattern confirmed from 3 existing integration spec files

**Research date:** 2026-04-22
**Valid until:** Stable — this phase is pure wiring of already-built components; no fast-moving dependencies
