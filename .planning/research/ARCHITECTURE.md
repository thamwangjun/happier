# Architecture Research: Request Resilience

**Project:** Happier v1.3 — Socket.IO Request Resilience
**Researched:** 2026-04-21
**Overall confidence:** HIGH (all findings grounded in codebase reads + Socket.IO official docs)

---

## New Components

### 1. `UnackedMessageBuffer` (server-side, new module)

A storage-backed buffer that retains `UpdatePayload` events per `(userId, connectionKey)` pair until the recipient acks them.

- Location: `apps/server/sources/app/session/resilience/unackedMessageBuffer.ts`
- Stores: `{ bufferId, userId, connectionKey, payload: UpdatePayload, createdAt, ackedAt? }`
- In light mode: backed by SQLite via Prisma (a new `UnackedMessage` model).
- In full mode: backed by Redis sorted sets keyed `ack-buf:{userId}:{connectionKey}` (score = `UpdatePayload.seq`). Redis is already present as `ioredis` and used for the Streams adapter and presence queue.
- TTL / expiry: configurable, default 10 minutes. Expired entries are either evicted by Redis sorted-set trim (full mode) or swept by the existing retention worker (light mode, piggybacks on `startRetentionWorker`).

**Why not in-memory only:** The relay can run multiple processes in full mode (`SERVER_ROLE=api` + `SERVER_ROLE=worker`). An in-memory buffer only works within the same process; messages emitted by the worker role would not be visible to the API role that handles reconnects.

### 2. `AckTracker` (server-side, new module)

Tracks the highest acked `UpdatePayload.seq` per `(userId, connectionKey)` pair. Used to know which buffer entries to discard on ack and which to re-send on reconnect.

- Location: `apps/server/sources/app/session/resilience/ackTracker.ts`
- In light mode: an in-memory `Map` with periodic upserts to a new `ClientAckState` Prisma model (`userId`, `connectionKey`, `lastAckedSeq`, `updatedAt`).
- In full mode: stored in Redis as `ack-state:{userId}:{connectionKey}` with a 30-minute TTL.

**Why not just the buffer seq:** The client needs to communicate a cursor on reconnect, so the server needs a durable record of what the client last confirmed, not just what was last sent.

### 3. `reconnectRedeliveryHandler` (server-side socket handler, new)

A new Socket.IO event handler for `socket.on('reconnect-resume', ...)` that accepts `{ lastAckedSeq: number, connectionKey: string }` from the client on reconnect and replays the unacked buffer for that connection key.

- Location: `apps/server/sources/app/api/socket/reconnectRedeliveryHandler.ts`
- Called from `socket.ts` alongside the existing `sessionUpdateHandler`, `machineUpdateHandler`, etc.
- Queries `UnackedMessageBuffer.getPending(userId, connectionKey, afterSeq: lastAckedSeq)` and emits each buffered `UpdatePayload` directly on the reconnected socket.

### 4. `ackUpdateHandler` (server-side socket handler, new)

A new Socket.IO event handler for `socket.on('ack-update', ...)` that accepts `{ seq: number, connectionKey: string }` and calls `UnackedMessageBuffer.markAcked(userId, connectionKey, seq)` to delete buffer entries at or below the acked seq.

- Location: `apps/server/sources/app/api/socket/ackUpdateHandler.ts`
- Wired into `socket.ts` alongside other handlers.

### 5. `socketDeduplicationFilter` (mobile, new module)

Tracks the highest `UpdatePayload.seq` already applied per update stream and rejects replayed payloads that have already been applied.

- Location: `apps/ui/sources/sync/engine/socket/socketDeduplicationFilter.ts`
- State uses the existing `sessionMaterializedMaxSeqById` map in `Sync` (already tracked, already persisted via `saveSessionMaterializedMaxSeqById`). For non-session update streams (machines, artifacts), a parallel account-scoped `UpdatePayload.seq` cursor is tracked — this is the monotonic `Account.seq` cursor already present on `UpdatePayload.seq`.
- Simple rule: if `payload.seq <= lastAckedSeq` for the account's update stream, drop. Because `UpdatePayload.seq` derives from the monotonic `Account.seq` counter, this is safe and correct.

---

## Modified Components

### `apps/server/sources/app/api/socket/socket.ts`

**What changes:** Register `reconnectRedeliveryHandler` and `ackUpdateHandler` alongside the existing handlers in `io.on('connection', ...)` (after `sessionUpdateHandler`, `machineUpdateHandler`, etc.).

**What does not change:** The existing `eventRouter.setIo(io)` and room-join logic are untouched.

### `apps/server/sources/app/events/connectionEventRouter.ts`

**What changes:** `emitUpdate()` currently emits via `socket.emit()` or via Socket.IO room fanout. The modified version adds a fire-and-forget async call to `UnackedMessageBuffer.append(userId, connectionKey, payload)` for each target connection key derived from the `RecipientFilter`.

The `RecipientFilter` types already enumerate who receives each update:
- `all-interested-in-session` → buffer for `user-scoped:{userId}` and `session-scoped:{userId}:{sessionId}`.
- `user-scoped-only` → buffer for `user-scoped:{userId}`.
- `machine-scoped-only` → buffer for `user-scoped:{userId}` (machine daemons reconnect near-instantly; no need to buffer for the machine connection itself).
- `all-user-authenticated-connections` → buffer for `user-scoped:{userId}`.

Machine daemons (`machine-scoped` connection type) are intentionally excluded from buffering: they run on the developer's LAN and reconnect in milliseconds; the CLI also has its own `localId`-based idempotency for message sends.

**Risk surface:** The emit path is hot. The buffer write must be non-blocking (fire-and-forget with a logged warning on failure) and must not throw into the emit path.

### `apps/server/sources/app/session/sessionWriteService.ts`

**What changes:** None to the write logic. The `UpdatePayload` is constructed upstream in `eventRouter.ts` via `buildNewMessageUpdate` / `buildMessageUpdatedUpdate`. Those payloads already have `id`, `seq`, and `createdAt` fields from `eventPayloadBuilders.ts` — the buffer can store them as-is.

### `apps/server/sources/app/retention/runtime/startRetentionWorker.ts`

**What changes (light mode only):** Add a sweep rule that deletes `UnackedMessage` rows with `createdAt < now() - retentionWindowMs`. Follows the existing `retentionRuleRegistry` pattern.

### `apps/server/prisma/schema.prisma`

**What changes:** Two new models, used only in light mode (SQLite/PGLite). Full mode uses Redis.

```prisma
model UnackedMessage {
    id            String   @id @default(cuid())
    userId        String
    connectionKey String
    seq           Int
    payloadJson   Json
    createdAt     DateTime @default(now())

    @@index([userId, connectionKey, seq])
    @@index([createdAt])
}

model ClientAckState {
    userId        String
    connectionKey String
    lastAckedSeq  Int
    updatedAt     DateTime @updatedAt

    @@id([userId, connectionKey])
}
```

Note: Per the server's `CLAUDE.md`, migrations must be run by a human. The schema change needs to be authored but not migrated by the implementation agent.

### `packages/protocol/src/updates.ts`

**What changes:** Two additive additions:

```typescript
// Client → server: sent on reconnect
export const ReconnectResumeRequestSchema = z.object({
  connectionKey: z.string(),
  lastAckedSeq: z.number().int().min(0),
});

// Client → server: sent after applying each UpdatePayload
export const AckUpdateRequestSchema = z.object({
  connectionKey: z.string(),
  seq: z.number().int().min(0),
});
```

`UpdateContainerSchema` gains an optional `ackSeq` field (no behavioral change, used by the mobile to advance its last-acked cursor without a separate ack round-trip for single-socket sessions).

### `apps/ui/sources/sync/sync.ts`

**What changes — two touchpoints:**

1. In `onReconnected()` callback (currently line ~3305): before firing `resumeSync('socket-reconnect')`, emit `socket.emit('reconnect-resume', { lastAckedSeq, connectionKey: 'user-scoped:${userId}' })`. This is safe to emit even against an old server that does not handle the event.

2. In `handleUpdate` (the function passed to `handleSocketUpdate`): after a payload is successfully applied, emit `socket.emit('ack-update', { seq: payload.seq, connectionKey })`. Batching is acceptable — debounce to emit at most once per 500ms with the highest seq seen.

### `apps/ui/sources/sync/engine/socket/socket.ts`

**What changes:** In `handleSocketUpdate`, after `parseUpdateContainer(update)` succeeds, call `socketDeduplicationFilter.isKnown(payload.seq)` before processing. If known (already applied), return early without side effects.

---

## Data Flow: Resilient Message Delivery

Complete path from CLI send to ack-and-discard:

**Step 1 — CLI daemon sends a message**
`sendSessionMessageViaSocketCommitted()` opens a session-scoped socket, emits `'message'` with `{ sid, message, localId }`, and awaits the Socket.IO ack callback with `{ ok, id, seq }`.

**Step 2 — Relay receives and persists**
`sessionUpdateHandler` handles `'message'`. `createSessionMessage()` writes to `SessionMessage` via Prisma in a transaction, increments `Session.seq`. Acks the CLI with `{ ok: true, id, seq }`.

**Step 3 — Relay fans out and buffers**
`eventRouter.emitUpdate()` is called per-participant. It:
- Emits the `UpdatePayload` to the Socket.IO room (existing behavior).
- Fire-and-forgets a write of the payload to `UnackedMessageBuffer` for each relevant `connectionKey` derived from the `RecipientFilter`.

**Step 4 — Mobile client receives and applies**
`Sync.handleUpdate` receives the `UpdatePayload` via `'update'` event. `socketDeduplicationFilter` checks `payload.seq > lastKnownSeq`. If new, applies and advances `lastKnownSeq`.

**Step 5 — Mobile acks the payload**
Mobile emits `socket.emit('ack-update', { seq: payload.seq, connectionKey })` (debounced). `ackUpdateHandler` on the server deletes buffer entries with `seq <= acked_seq` for that `connectionKey`.

**Step 6 — Mobile disconnects (network drop)**
When the socket reconnects, `Sync.onReconnected()` fires. Before `resumeViaChanges`, mobile emits `'reconnect-resume'` with `{ lastAckedSeq, connectionKey }`.

**Step 7 — Relay re-delivers from buffer**
`reconnectRedeliveryHandler` queries `UnackedMessageBuffer.getPending(userId, connectionKey, afterSeq: lastAckedSeq)` and emits each buffered payload on the reconnected socket.

**Step 8 — Mobile deduplicates on re-delivery**
Replayed payloads pass through `socketDeduplicationFilter`. Payloads with `seq <= lastKnownSeq` are silently dropped. New payloads apply normally.

**Step 9 — `resumeViaChanges` runs in parallel**
The existing `resumeViaChanges` HTTP call still runs on reconnect. It may return overlapping `UpdatePayload`-equivalent changes. The `DeduplicationFilter` handles those too — any already-applied seq is dropped.

**Step 10 — Buffer discarded**
After re-delivery, the mobile acks the re-delivered payloads (step 5). Buffer entries are deleted. Any remaining entries exceeding the TTL are cleaned up by Redis TTL or the retention worker.

---

## State Storage Decision

| State | Light mode (SQLite) | Full mode (Redis) | Rationale |
|-------|--------------------|--------------------|-----------|
| Unacked message buffer | Prisma `UnackedMessage` table | Redis sorted set `ack-buf:{userId}:{connectionKey}` (score = seq) | Redis already present; SQLite fallback keeps zero-dep requirement |
| Client ack cursor (server-side) | Prisma `ClientAckState` table | Redis key `ack-state:{userId}:{connectionKey}` with 30-min TTL | Must survive server restart |
| Mobile last-acked seq | MMKV via `saveSessionMaterializedMaxSeqById` (existing) | — (client-side only) | Survives app restart; pattern already established |
| In-session deduplication | In-memory via existing `sessionMaterializedMaxSeqById` in `Sync` | — | Rebuilt from MMKV on startup; short-term dedup only |

**Why not Socket.IO built-in connection state recovery (CSR):**
Socket.IO v4.6+ has a native CSR feature. It is supported by the Redis Streams adapter (MEDIUM confidence, per official docs). However, CSR is not recommended here for three reasons:

1. Light mode has no adapter. CSR in light mode only works within a single process. If the server restarts (crash or deploy), CSR sessions are lost and the feature provides no benefit.
2. The existing `resumeViaChanges` + `Account.seq` cursor system already covers the "missed events after reconnect" case via HTTP. The goal is to fill the gap for events that arrive between the last ack and the reconnect, not to replace the entire catch-up pipeline.
3. CSR recovery is not guaranteed (the Socket.IO library itself warns this). The application-level buffer is always available regardless of CSR success or failure.

Building application-level resilience on the existing `UpdatePayload.seq` / `Account.seq` infrastructure gives full control, works identically in both deployment modes, and composes naturally with the existing gap-detection and invalidation pipeline.

---

## Build Order

Dependencies flow strictly downward. Each phase must complete before the next begins.

**Phase 1 — Protocol types (no behavior)**
- Add `ReconnectResumeRequestSchema`, `AckUpdateRequestSchema` to `packages/protocol/src/updates.ts`.
- Add optional `ackSeq` to `UpdateContainerSchema`.
- Unit tests in protocol package.

Rationale: Protocol types must be importable by both server and mobile before either side can use them. Zero-risk, additive, passthrough schemas.

**Phase 2 — Server storage layer (no socket wiring)**
- Add `UnackedMessage` and `ClientAckState` to `schema.prisma`.
- Implement `unackedMessageBuffer.ts` with SQLite (Prisma) and Redis (ioredis sorted set) backends behind a common interface.
- Implement `ackTracker.ts` with SQLite and Redis backends.
- Add retention sweep rule in light mode.
- Unit tests for both using test doubles (no real socket needed).

Rationale: Storage must exist before the emit path can write to it. Can be developed and tested independently.

**Phase 3 — Server socket integration**
- Modify `connectionEventRouter.emitUpdate()` to fire-and-forget buffer writes.
- Implement `reconnectRedeliveryHandler.ts` and `ackUpdateHandler.ts`.
- Wire both into `socket.ts`.
- Integration tests: socket client connects, receives update, disconnects, reconnects, verifies buffer replay. Separate test for ack-then-reconnect verifying empty replay.

Rationale: Depends on Phase 2 (buffer/tracker). Does not require mobile changes — a test socket client is sufficient.

**Phase 4 — Mobile reconnect-resume and ack**
- Implement `socketDeduplicationFilter.ts`.
- Modify `Sync.onReconnected()` to emit `reconnect-resume` before `resumeViaChanges`.
- Modify `Sync.handleUpdate` to emit debounced `ack-update` after applying payloads.
- Persist `lastAckedSeq` to MMKV alongside existing `sessionMaterializedMaxSeqById`.
- Unit tests for deduplication filter. Integration test for reconnect flow using mock socket.

Rationale: Depends on Phase 3 (server must handle `reconnect-resume`). Mobile `reconnect-resume` is safe to ship before server support — old servers ignore unknown events.

**Phase 5 — End-to-end validation and hardening**
- E2E test: CLI sends messages, mobile socket drops mid-stream, reconnects, asserts all messages present without duplicates.
- Load test: buffer behavior under high-frequency transcript streaming.
- Tune TTL and buffer size cap defaults.
- Add Prometheus counters: `buffer_writes_total`, `buffer_acks_total`, `buffer_redeliveries_total`, `dedup_drops_total`.

Rationale: Can only run after all four prior phases are complete. Metrics require the behavior to exist first.

---

## Open Questions

**1. CLI-to-relay direction.** The CLI daemon uses ephemeral sockets (`sendSessionMessageViaSocketCommitted` opens, emits, waits for ack, then closes). The CLI already has `localId`-based idempotency on the server side (`sessionMessage.sessionId_localId` unique constraint). A failed CLI send is retried by the CLI's own retry logic, not by the relay buffer. Confirm with the team: is the CLI-to-relay direction a reported failure mode? If so, a separate per-session CLI outbox is needed, but it is distinct from the relay-to-mobile buffer being designed here.

**2. connectionKey for user-scoped multi-device.** A `user-scoped` mobile connection has no session or machine qualifier. Its `connectionKey` is `user-scoped:{userId}`. If the user has multiple devices (desktop + phone), both share the same key and would receive the same re-delivered buffer. This is acceptable because both devices run `socketDeduplicationFilter` and drop already-applied payloads. However, a device that was never online during the original delivery will get a replay it did not request, consuming extra bandwidth. A per-device buffer requires a stable device identity not yet in the protocol. Decision needed: accept per-user buffering for now (simpler) or add a `deviceId` to the socket handshake.

**3. Buffer size cap.** During high-throughput Claude sessions (streaming transcript), the relay emits many `new-message` UpdatePayload events per second. A mobile client offline for 10 minutes could accumulate thousands of entries. A cap (e.g. 500 entries per connection key) prevents unbounded storage. When capped, the server sends a `buffer-overflow` signal on reconnect instead of replaying, and the mobile falls back to the existing `resumeViaChanges` + `messagesSync.invalidateCoalesced()` path. This path already works correctly (the `onMessageGapDetected` handler triggers it).

**4. SQLite write contention in light mode.** High-frequency buffer inserts during streaming could cause SQLite lock contention with the message write path. Mitigation: batch buffer inserts with a 100ms debounce window, or use a write queue. The SQLite WAL-mode pragmas already applied (`prisma.sqlitePragmas.integration.spec.ts`) help but do not eliminate contention under very high write rates. This needs load testing in Phase 5.

**5. Redis Streams adapter and room fanout attribution.** When `io.to(room).emit()` is called through the Redis Streams adapter in a multi-process deployment, the emitting process does not enumerate which individual sockets received the event. The `eventRouter.emitUpdate()` modification must derive the target `connectionKey` list from the `RecipientFilter` before emitting — not after — since socket enumeration is unavailable. The current `RecipientFilter` types provide sufficient information (see Modified Components section above). Validate in Phase 3 integration tests that all filter types buffer to the correct connection keys.
