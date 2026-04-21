# Stack Research: Request Resilience

**Project:** Happier — Socket.IO Request Resilience (v1.3)
**Researched:** 2026-04-21
**Overall confidence:** HIGH — core findings verified against Socket.IO v4 official documentation and confirmed against the live codebase.

---

## New Dependencies

| Package | Version | Purpose | Rationale |
|---------|---------|---------|-----------|
| None (no new server deps needed) | — | Connection state recovery, ack-based delivery, and SQLite-backed deduplication are all achievable with the existing `socket.io ^4.8.1`, `@socket.io/redis-streams-adapter ^0.2.2`, and `prisma/SQLite` already in place | See Storage section below |
| `@socket.io/redis-streams-adapter` | `^0.3.1` (bump from `^0.2.2`) | Picks up Connection State Recovery session-storage improvements | Minor version bump only; stays within the existing dep; see Version Constraints |

**Why nearly zero new server deps:** The server already has `socket.io ^4.8.1` (Connection State Recovery introduced in 4.6.0; `retries`/`ackTimeout` also introduced in 4.6.0), `@socket.io/redis-streams-adapter ^0.2.2` (supports Connection State Recovery), and Prisma + SQLite/PGLite/Postgres (supports the `serverOffset`/`clientOffset` deduplication pattern). No third-party queue library is needed; the pattern is implemented in application code.

**Client side (UI):** Already on `socket.io-client ^4.8.1`. The `retries` and `ackTimeout` options are available. No new package needed.

---

## Socket.IO Built-ins to Leverage

All features confirmed present in Socket.IO 4.6.0+ (codebase is on 4.8.1). Sources: [Delivery Guarantees](https://socket.io/docs/v4/delivery-guarantees), [Connection State Recovery](https://socket.io/docs/v4/connection-state-recovery), [Tutorial Step 7](https://socket.io/docs/v4/tutorial/step-7), [Tutorial Step 8](https://socket.io/docs/v4/tutorial/step-8).

### 1. Connection State Recovery (`connectionStateRecovery`)

**What it does:** Server stores client session ID, rooms, and `socket.data` for `maxDisconnectionDuration` ms. On reconnect the client sends its session ID + last packet offset; server replays missed packets and restores room membership. `socket.recovered === true` signals success.

**Configuration (server-side, in `socket.ts`):**
```typescript
const io = new Server(app.server, {
    connectionStateRecovery: {
        maxDisconnectionDuration: 2 * 60 * 1000, // 2-minute window
        skipMiddlewares: true,
    },
    // ... existing options unchanged
});
```

**Adapter compatibility (HIGH confidence — official docs):**
- Default in-memory adapter: YES — works without Redis; session store is single-process-local
- `@socket.io/redis-streams-adapter`: YES — sessions stored as Redis key/value pairs under prefix `sio:session:`; multi-process safe
- Standard `@socket.io/redis-adapter` (PUB/SUB): NO — incompatible by design; not used in this codebase

**Implication for Happier:**
- Light mode (in-memory adapter): Connection State Recovery works, single-node only. Fine for self-hosted deploys.
- Full mode (Redis Streams adapter): Connection State Recovery works, multi-node safe.

**Critical limitation:** Recovery is not guaranteed. If the gap exceeds `maxDisconnectionDuration`, or the server restarted, `socket.recovered === false`. The client must fall back to the `serverOffset`-based replay path (see below). Both paths must be implemented — Connection State Recovery is an optimisation on the fast path, not a replacement for application-layer replay.

### 2. Server-to-Client `serverOffset` / Replay Pattern (at-least-once delivery, slow path)

**What it does:** Server assigns a monotonically increasing integer ID (autoincrement PK) to every retained message. Client tracks `socket.auth.serverOffset` (last received ID). On connect when `socket.recovered === false`, server queries for all messages `WHERE userId = ? AND id > serverOffset` and re-emits them in order. A UNIQUE constraint on the `clientOffset` column provides server-side deduplication.

This is the **primary mechanism for message retention** — Connection State Recovery handles the fast path (short disconnects within the recovery window); `serverOffset` replay handles the slow path (longer outages, server restarts, exceeding the recovery window).

### 3. Client `retries` and `ackTimeout` (client-to-server at-least-once delivery)

**What it does:** Configures `socket.io-client` to retry unacknowledged emits up to N times with a per-attempt timeout. The server must call the ack callback to confirm receipt. The client sends a `clientOffset` (e.g. `${socket.id}-${counter}`) so the server can deduplicate retried messages via a UNIQUE database constraint — a SQLITE_CONSTRAINT violation on insert is treated as a successful dedup (ack without re-processing).

**Configuration (client-side, in `createSyncSocketTransport.ts`):**
```typescript
const socket = io(endpoint, {
    // ... existing options unchanged
    retries: 3,
    ackTimeout: 10_000,
});
```

**Important:** `retries` only applies to events emitted with an ack callback. Fire-and-forget `emit()` calls are not retried. Critical messages must use `socket.emit('event', payload, clientOffset, ackCallback)`.

### 4. `volatile` Emit — For Ephemeral Events Only

`socket.volatile.emit(...)` drops the message if the client is not currently connected. Use this for presence pings and other non-critical ephemeral events that must never enter the retention queue. The existing `emitEphemeral()` in `connectionEventRouter.ts` should use `.volatile` to signal this intent explicitly.

Do not use `.volatile` for `update` events — those are the events that require retention.

### 5. Rooms — No Changes Needed

The existing room structure (`user:${userId}`, `user-scoped:${userId}`, `session:${sessionId}:${userId}`, `machine:${machineId}:${userId}`) is correct for scoping re-delivery. Connection State Recovery automatically restores room membership for recovered sessions, so clients rejoin the right rooms without re-authentication.

---

## Storage for Message Retention

Both modes use the same application-layer pattern (serverOffset backed by Prisma). No separate in-memory buffer or Redis list.

### Light Mode (SQLite / PGLite)

**Use:** A new Prisma model (e.g., `RetainedMessage`) added to the existing schema:
```
model RetainedMessage {
    id             Int       @id @default(autoincrement())   // the serverOffset
    clientOffset   String?   @unique                         // client-to-server dedup
    userId         String
    connectionType String                                     // user-scoped | session-scoped | machine-scoped
    sessionId      String?
    payload        Bytes                                      // E2E-encrypted ciphertext — server never stores plaintext
    createdAt      DateTime  @default(now())
    ackedAt        DateTime?
}
```

TTL sweeps: Extend the existing `runRetentionSweep` in `sources/app/retention/runtime/` with a rule for rows where `ackedAt IS NOT NULL OR createdAt < NOW() - TTL`.

**Why not in-memory map:** Lost on restart, not multi-process safe. The Prisma + SQLite setup is already in place and the correct durability layer for light mode.

### Full Mode (PostgreSQL + Redis Streams)

**Primary retention store:** Same Prisma table as light mode — PostgreSQL. The Redis Streams adapter handles Connection State Recovery session state (`sio:session:*` keys); application code handles message payload retention in Postgres.

**Why not Redis Streams alone for payload retention:** Redis Streams are used by the adapter for multi-process fanout. They are not suitable for per-user message retention — streams have TTL-based expiry (not ack-based), no efficient `userId + offset` query, and are invisible to the light-mode code path.

**Why not a separate Redis list/sorted-set per user:** Would add Redis-specific logic absent from light mode, splitting the retention code path. The unified Prisma approach keeps both modes on identical application code with only schema/driver differences.

---

## Excluded / Not Recommended

| Candidate | Considered For | Rejected Because |
|-----------|---------------|-----------------|
| `socket.io-msgpack` / custom parser | Reducing payload size | E2E-encrypted payloads are already binary blobs (tweetnacl boxes). MsgPack savings on ciphertext are negligible. Adds a dep, requires matching client config, breaks upstream compat. Net gain does not justify the change for this milestone. |
| Standard `@socket.io/redis-adapter` (PUB/SUB) | Connection State Recovery in full mode | Officially unsupported for Connection State Recovery ("persisting packets is not compatible with the Redis PUB/SUB mechanism"). Codebase already uses the Redis Streams adapter, which is compatible. No migration needed. |
| In-memory `Map<socketId, Message[]>` buffer | Server-side message retention | Lost on restart. Not multi-process safe. Does not survive reconnect windows beyond single-process lifetime. Prisma + SQLite/Postgres already present and correct. |
| BullMQ / p-queue / similar job queues | Retry/replay scheduling | Unnecessary for this use case. Socket.IO `retries`+`ackTimeout` handle client-to-server retries. Server-to-client replay is a single DB query at reconnect, not a scheduled job. BullMQ would add Redis as a hard dependency even in light mode. |
| Separate SQLite database file for retained messages | Isolation from main DB | Would require a second Prisma client and complicate the existing migration scripts. Single-schema extension is simpler and consistent with the existing pattern. |
| WebSocket-level heartbeat tuning (pingTimeout/pingInterval) | Faster disconnect detection | Already configured at reasonable values (`pingTimeout: 45000`, `pingInterval: 15000`). Tightening these on mobile networks increases spurious disconnects. Leave as-is unless load testing reveals a specific issue. |

---

## Integration Notes

### Server (`apps/server`)

**`connectionStateRecovery` option:** Add to `sources/app/api/socket.ts` inside the `new Server(...)` call. The worker-role `dummyHttpServer` in `startServer.ts` is emitter-only and does not need recovery configuration.

**serverOffset emission:** In `connectionEventRouter.ts` → `emitUpdate()`, before emitting to a room, insert the payload into `RetainedMessage` and include the resulting autoincrement `id` as the third argument: `emitter.emit('update', payload, messageId)`. The client persists this as `serverOffset`.

**Reconnect replay handler:** In `socket.ts`, in the `io.on('connection', ...)` handler, after auth succeeds. Check `socket.recovered` — if false, query `RetainedMessage WHERE userId = ? AND id > socket.handshake.auth.serverOffset ORDER BY id ASC` and re-emit each payload with its `id`.

**Ack-coordinated deletion:** Add an ack callback to `emit('update', payload, messageId, callback)`. When the callback fires, mark the row as acked (update `ackedAt`) or delete it. The retention sweep handles anything not explicitly acked within the TTL window.

**`emitEphemeral()` — mark volatile:** In `connectionEventRouter.ts`, the `emitEphemeral` path should use `emitter.volatile.emit(...)`. Ephemeral events are never retained.

**Retention sweep extension:** Add a new rule to `runRetentionSweep` to delete `RetainedMessage` rows that are acked or older than the configured TTL.

### Client (`apps/ui`)

**`retries` / `ackTimeout`:** Add to `sources/sync/api/session/connection/createSyncSocketTransport.ts` in the `io(endpoint, {...})` options. These are per-emit-attempt settings within a single connection and are compatible with the existing `reconnection: false` + `connection-supervisor` lifecycle management.

**`serverOffset` tracking:** Store the last received `serverOffset` per connection context in the Zustand sync store. Persist it across app restarts (MMKV via the existing storage layer). Send as `socket.handshake.auth.serverOffset` on every connect.

**`clientOffset` generation:** In emit helpers for critical messages (session updates, RPC calls), generate `clientOffset` as `randomUUID()` or `${socket.id}-${counter++}`. Include it as a named field in the event payload.

**`socket.recovered` check:** In the connect handler, if `socket.recovered === true`, skip the replay request (Connection State Recovery already replayed missed packets). If `socket.recovered === false`, trigger the serverOffset-based replay request (send current `serverOffset` in auth; server handles the query-and-replay).

### Protocol Package (`packages/protocol`)

Add `serverOffset?: number` and `clientOffset?: string` to the relevant Zod schemas so both server and client are type-safe. These are additive fields on existing event payload types.

### Version Constraints

| Component | Current Version | Min Required | Action |
|-----------|----------------|-------------|--------|
| `socket.io` (server) | `^4.8.1` | 4.6.0 | No change — already sufficient |
| `socket.io-client` (UI) | `^4.8.1` | 4.6.0 | No change — already sufficient |
| `@socket.io/redis-streams-adapter` | `^0.2.2` | 0.1.0 | Bump to `^0.3.1` for latest session-storage improvements |
| Prisma / SQLite / Postgres | existing | existing | Schema extension only — add `RetainedMessage` model |

**`@socket.io/redis-streams-adapter` bump note:** 0.3.1 is the latest stable release (published ~March 2026 per npm). The codebase pin is `^0.2.2`. Since this is a minor-version bump, there are no breaking API changes. Recommended as part of this milestone.

---

## Sources

- [Socket.IO Delivery Guarantees (official)](https://socket.io/docs/v4/delivery-guarantees) — HIGH confidence
- [Socket.IO Connection State Recovery (official)](https://socket.io/docs/v4/connection-state-recovery) — HIGH confidence
- [Tutorial Step 7 — Server Delivery / serverOffset pattern (official)](https://socket.io/docs/v4/tutorial/step-7) — HIGH confidence
- [Tutorial Step 8 — Client Delivery / clientOffset / retries (official)](https://socket.io/docs/v4/tutorial/step-8) — HIGH confidence
- [Socket.IO Redis Streams Adapter (official)](https://socket.io/docs/v4/redis-streams-adapter/) — HIGH confidence
- [Socket.IO 4.6.0 Changelog (official)](https://socket.io/docs/v4/changelog/4.6.0) — HIGH confidence
- Codebase inspection: `apps/server/sources/app/api/socket.ts`, `startServer.ts`, `connectionEventRouter.ts`, `storage/redis/redis.ts`, `app/retention/runtime/`, `apps/ui/sources/sync/api/session/connection/createSyncSocketTransport.ts`, `apps/server/package.json`, `apps/ui/package.json` — HIGH confidence (live code)
