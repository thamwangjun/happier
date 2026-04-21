# Features Research: Request Resilience

**Project:** Happier v1.3 — Socket.IO Request Resilience
**Researched:** 2026-04-21
**Confidence:** HIGH (core Socket.IO patterns from official docs + codebase verification)

---

## Table Stakes (Must-Have)

These are the features every resilience layer is expected to provide. Absence makes the feature
feel broken rather than unfinished.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Server-side message retention | Without this, any drop during relay→client delivery is permanent data loss | Medium | Relay must buffer unacked outbound events per-client; in-memory is sufficient for light-mode if bounded by TTL |
| Client requests re-delivery on reconnect | The client must tell the server "I last received offset X; replay from there" | Medium | Relies on the client durably storing the last confirmed offset across reconnects |
| Ack-coordinated discard | Server must not discard retained messages until a client ack confirms receipt | Low | Socket.IO callback-ack is the natural primitive; see existing `socketEmitWithAckFallback` pattern |
| Message-level deduplication (client side) | Re-delivery means duplicates. Client must detect and discard them idempotently | Medium | `localId` already exists in the `message` event payload on both client and server — use it as the dedup key |
| At-least-once from CLI daemon to relay | CLI daemon should retry sends until the relay acks | Low | Socket.IO `retries` + `ackTimeout` options cover this natively without custom code |
| Reconnect-triggered replay | On reconnect, client sends its last-confirmed offset; server replays the gap | Medium | This is the core delivery loop; offset mechanics from Socket.IO connection-state-recovery docs |
| Bounded retention window | Server must not retain messages indefinitely; a TTL (e.g. 5 min) bounds memory | Low | Configurable; light-mode can use in-memory TTL map, full-mode uses Redis key TTL |

**Source confidence:** HIGH — all items verified against Socket.IO v4 official documentation (delivery-guarantees and connection-state-recovery pages at socket.io/docs/v4/) and the existing Happier codebase. The server `sessionUpdateHandler.ts` already acks `message` events with `{ ok, id, seq, localId, didWrite }`; `socketEmitWithAckFallback.ts` already handles ack-timeout fallback.

---

## Differentiators (Nice-to-Have)

Features that distinguish a high-quality implementation from a minimal one. Users notice the
polish but will not call the product broken if these are absent.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Exponential backoff on retry | Avoids thundering-herd on server restart | Low | `reconnectBackoff.ts` in `packages/connection-supervisor` already implements this — wire into retry scheduler |
| Per-client retention cap | Prevents a stuck mobile client from exhausting server RAM | Low | 100-message cap per session per client; simple ring-buffer or sliding window on the retained map |
| Reconnect status in UI | Show a "reconnecting" badge when Socket.IO is offline | Low | Extend existing `apps/ui/sources/components/navigation/connectionStatus`; offline-tracking tests already exist in `sync.socketOfflineTracking.test.ts` |
| Offline queue drain before replay | After reconnect, flush mobile pending queue before requesting server replay so ordering is correct | Medium | Touches `pendingQueueV2.ts` ordering; drain must complete before replay to avoid interleaving |
| Graceful degradation path | If reconnect fails after max retries and no recovery is possible, surface a clear "session may be incomplete" warning rather than silently losing data | Low | UX copy + a state flag; no protocol change |
| Idempotency on server for already-seen localId | `createSessionMessage` already returns `didWrite: false` when a `localId` is a duplicate — wire the ack path to still return `ok: true` so the client stops retrying | Low | Already partially in place; needs explicit test coverage |

**Source confidence:** MEDIUM — exponential backoff verified from codebase (`reconnectBackoff.ts`). Per-client cap is a standard pattern from websocket system design. Server idempotency verified from `sessionUpdateHandler.ts` line 421 (`didWrite` already tracked and returned).

---

## Anti-Features (Avoid)

Patterns that appear to help but cause correctness, security, or complexity problems.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Exactly-once delivery via distributed lock | Requires cross-node coordination (Redis SETNX races, DB advisory locks) and is extremely difficult to make correct under partial failures. Socket.IO v4 explicitly does not attempt this. | At-least-once + idempotent consumers. Server already returns `didWrite: false` for duplicates; client already has `localId` for dedup. These two together give practical exactly-once semantics. |
| Socket.IO built-in connection-state-recovery as the sole strategy | Built-in CSR only works within `maxDisconnectionDuration` (default 2 min). It does NOT work with the standard Redis adapter — only Redis Streams and in-memory. Happier supports both Redis adapter modes depending on deployment. | Use CSR as an opportunistic fast-path in full-mode only; build application-level offset replay as the always-available fallback. |
| Infinite retention on the relay | Retaining messages forever per client will OOM the relay or bloat Redis, especially for clients that disconnect and never return. | TTL-bound retention. 5 minutes covers mobile reconnect scenarios generously; make it configurable via feature flag. |
| Global sequence numbers across sessions | A single global counter for all session messages creates a hot-write bottleneck and makes per-session replay harder to reason about. | Per-session sequence numbers. The server already issues per-session `seq` on message insert (verified in `sessionUpdateHandler.ts` line 415). |
| Re-using socket.id as the dedup key | `socket.id` changes on every reconnect — useless as a stable client identity. | Use `localId` (UUID, already sent with every `message` event) as the stable, client-generated dedup key. |
| Blocking UI on replay completion | Waiting for server replay to finish before showing the session causes noticeable perceived latency after every reconnect. | Show stale state immediately; append replayed messages as they arrive. |
| Retry loop without ack timeout | A retry that never times out can hammer the server and mask a permanent failure. | Socket.IO `ackTimeout` + finite `retries` count (or exponential backoff with a hard ceiling). |
| Content hash as dedup key | Happier messages are E2E-encrypted ciphertext — content hashing is semantically meaningless at the relay layer. Hash collisions cannot be detected without decryption. | Use `localId` (client-generated, stable, already in the protocol). |

**Source confidence:** HIGH — CSR adapter limitation verified from Socket.IO official docs adapter compatibility table. `socket.id` instability documented on the Socket.IO client instance docs page. `localId` and `didWrite` presence verified from codebase.

---

## Deduplication Strategies Compared

| Strategy | Pros | Cons | Verdict |
|----------|------|------|---------|
| **Client-generated UUID per message (`localId`)** | Already in Happier protocol on both sides; server stores and echoes it; natural idempotency key | UUID must be generated before send and durably stored by client until ack received | **Use this. It is the right approach for Happier.** The `localId` field already travels in every `message` event and the server already deduplicates on insert (`didWrite: false` on conflict). |
| **Monotonic sequence number (per client, per session)** | Simple integer comparison; easy to detect gaps; enables ordered replay without full-message storage | Requires persistent counter across app restarts; breaks on reinstall; must be durable (not in-memory) | Use the server-assigned `seq` as the replay cursor for server→client direction. Do not use a client-generated monotonic counter as the primary dedup key. |
| **Socket.IO built-in offset (`__offset`)** | Zero custom code; automatic if using Redis Streams or in-memory adapter | Best-effort only; does not survive `maxDisconnectionDuration`; incompatible with standard Redis adapter; requires server to emit at least one event to initialize | Use opportunistically in full-mode (Redis Streams), but do not rely on it alone. It is an optimization, not a foundation. |
| **Server-side idempotency key with DB UNIQUE constraint** | Guarantees exactly-once insert; simple to audit | Only covers client→server direction; client still needs its own dedup for server→client re-delivery | Already the right pattern for client→server (matches Socket.IO tutorial step 8 recommendation). Pair with per-session `seq` cursor for server→client. |
| **Content hash as dedup key** | No client-side state needed | Ciphertext hashing is meaningless without decryption; relay cannot evaluate semantic identity | Do not use for E2E-encrypted messages. |

**Recommendation:** Two-key system: `localId` (UUID) for client→server dedup; per-session `seq` as the replay cursor for server→client re-delivery. Both fields already exist in the protocol.

---

## Error Classes to Cover

Socket.IO and network error scenarios with expected behavior for each.

| Error Class | Trigger | Expected Handling |
|-------------|---------|------------------|
| **Transport disconnect (WebSocket close)** | Mobile goes offline, WiFi switches, VPN/tunnel drops | Automatic reconnect via `ManagedConnectionSupervisor` (already in place). On reconnect, client sends last confirmed `seq` to request gap replay. |
| **Ack timeout (client→server send)** | Server is slow to ack or message never arrives | `socketEmitWithAckFallback` fires-and-forgets after timeout today. Must also enqueue the message for retry on next reconnect, not just call `onNoAck`. |
| **Ack timeout (server→client emit)** | Relay emits event to mobile but ack is too slow or connection drops mid-flight | Server retains the message in the per-client buffer until a successful ack or TTL expiry. This is the core new server-side behavior needed for v1.3. |
| **Failed ack (server returns explicit error)** | Server processes message but returns `{ ok: false, error: 'forbidden' }` or `'invalid-params'` | Client must NOT retry on explicit rejections. Retry only on timeout/network errors. Already partially handled by the `respond` pattern in `sessionUpdateHandler.ts`. |
| **Duplicate delivery on replay** | Replay window overlaps with already-processed messages | Client drops duplicate on `localId` match. Server drops duplicate on `localId` DB constraint. Both sides must handle gracefully without surfacing an error to the user. |
| **Recovery window expired (server lost the buffer)** | Client reconnects after the TTL has elapsed | Server signals "no buffer available" (or equivalent). Client falls back to full session re-fetch via the existing HTTP changes endpoint. This is the existing cold-start path — the resilience layer must not break it. |
| **App backgrounded / process suspended** | iOS/Android suspends the app mid-session | Socket disconnects. On foreground, reconnect fires. Treat identically to transport disconnect. `sync.socketOfflineDuration` tracking (existing tests in `sync.socketOfflineTracking.test.ts`) already measures this. |
| **Server restart (light mode)** | Relay process restarts; all in-memory socket state and buffers lost | In-memory retention does not survive restart. Server signals this via a new socket ID. Client must fall back to full re-fetch. Document this as a known limitation of light-mode. |
| **Server restart (full mode)** | Relay process restarts; Redis-backed buffers survive | Buffers survive if keyed in Redis. Client can still replay. This is a differentiator of the full-mode deployment. |
| **Concurrent reconnect race** | Two sockets from the same client connect simultaneously (tab restored while reconnect in flight) | Server must accept only one active session per client and close the stale one. Existing `sessionScopedBinding.ts` handles session-scoped dedup at the socket level — verify it handles this race. |
| **RPC forward timeout** | CLI RPC call times out on relay while forwarding to daemon | `rpcForwardTimeout.ts` already handles this independently. The resilience layer must not interfere with the RPC delivery path — they are separate event types. |

**Source confidence:** HIGH for transport disconnect, ack timeout, duplicate delivery, and server restart distinctions (verified from codebase and Socket.IO docs). MEDIUM for concurrent reconnect race (inferred from `sessionScopedBinding.ts` existence; specific race handling not confirmed in code). LOW for light-mode restart buffer loss being a "known limitation" worth documenting (architectural inference — verify during implementation).

---

## Dependency on Existing Features

Every item below already exists and must be extended (not replaced) by v1.3.

| Existing Feature | Location | What Must Change |
|-----------------|----------|-----------------|
| **`socketEmitWithAckFallback`** | `apps/ui/sources/sync/engine/socket/socketEmitWithAckFallback.ts` | Currently fires-and-forgets after ack failure. Must also enqueue the message for replay on next reconnect, not just call `onNoAck`. |
| **`pendingQueueV2`** | `apps/ui/sources/sync/engine/pending/pendingQueueV2.ts` | Existing pending queue holds client→server messages waiting while agent is busy. A separate (or parallel) structure is needed for messages awaiting server delivery ack. These have different semantics and should not be conflated. |
| **`sessionUpdateHandler` (server)** | `apps/server/sources/app/api/socket/sessionUpdateHandler.ts` | Already acks `message` events with `{ ok, id, seq, localId, didWrite }`. Must be extended to: (1) buffer outbound events per-client until acked, (2) handle a replay-request event from clients on reconnect. |
| **`ManagedConnectionSupervisor`** | `packages/connection-supervisor/src/` | Already tracks `onConnected`, `onDisconnected`, `onBeforeReconnect`. The `onConnected` hook is the natural injection point for triggering the client's replay-request after a reconnect. |
| **`socket.ts` (sync engine)** | `apps/ui/sources/sync/engine/socket/socket.ts` | Already handles incoming socket updates (`applyMessages`, `markSessionMaterializedMaxSeq`). Must deduplicate replayed messages before applying, and must update the durable last-confirmed-seq after successful apply. |
| **`eventRouter` (server)** | Referenced from `sessionUpdateHandler.ts` as `eventRouter.emitUpdate` | Emits updates to connected clients. Must be extended to retain unacked events in a per-client buffer keyed by socket ID, with TTL-based eviction. |
| **`socketMessageAckCounter` (metrics)** | `apps/server/sources/app/monitoring/metrics2.ts` | Already tracks `result: 'ok' | 'error'`. Extend with `result: 'redelivered'` and `result: 'duplicate-dropped'` to make the resilience layer observable in Prometheus. |
| **Per-session `seq`** | Already emitted by server on message insert (line 415 `sessionUpdateHandler.ts`) | Expose as the replay cursor. Client must durably store the last `seq` it successfully applied per session. Suitable storage: MMKV via the existing `storage` domain in the sync engine. |

**Source confidence:** HIGH — all locations verified by reading source files. Behavioral changes are inferred from the current code's responsibilities.
