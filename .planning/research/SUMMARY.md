# Research Summary: v1.3 Request Resilience

**Project:** Happier — Socket.IO Request Resilience (v1.3)
**Domain:** Real-time WebSocket resilience on an E2E-encrypted relay
**Researched:** 2026-04-21
**Confidence:** HIGH

---

## Stack Additions

Nearly zero new dependencies. The codebase is already on Socket.IO 4.8.1 (resilience features require 4.6.0+) and Prisma with SQLite/Postgres. One minor version bump is recommended:

| Package | Action | Rationale |
|---------|--------|-----------|
| `@socket.io/redis-streams-adapter` | Bump `^0.2.2` → `^0.3.1` | Latest session-storage improvements; minor bump, no breaking changes |
| All other packages | No change | Socket.IO 4.8.1 already has `retries`, `ackTimeout`, `connectionStateRecovery`, and `volatile` emit |

**Schema additions (light mode):** Two new Prisma models — `UnackedMessage` (the per-client buffer) and `ClientAckState` (durable ack cursor). Full mode uses Redis sorted sets instead. Both modes share identical application-layer code; only the storage driver differs. Schema changes must be authored but migrated by a human per `server/CLAUDE.md`.

**No queue libraries needed.** BullMQ, p-queue, and similar are explicitly rejected — Socket.IO's built-in `retries`/`ackTimeout` cover client-to-server retries, and server-to-client replay is a single DB query at reconnect, not a scheduled job.

See `.planning/research/STACK.md` for full integration notes per file.

---

## Feature Table Stakes

All of the following must ship in v1.3. Absence makes the feature feel broken rather than incomplete.

| Feature | Why Non-Negotiable | Key Implementation Note |
|---------|-------------------|------------------------|
| Server-side message retention (`UnackedMessageBuffer`) | Without this, any drop during relay→client delivery is permanent data loss | Hard cap (500 msgs/connectionKey) + TTL (10 min) required from day one — unbounded buffer is the #1 OOM risk |
| Client sends last-confirmed `seq` on reconnect (`reconnect-resume` event) | Core of the re-delivery protocol | Safe to emit against old servers — missing handler is silently ignored |
| Ack-coordinated discard (`ack-update` event) | Server must not discard until client confirms receipt | Debounce to at most once per 500ms with highest seq seen |
| Message-level deduplication using `localId` | Re-delivery means duplicates; client must detect and drop them | `localId` already exists in the `message` event payload; use it as the sole dedup key |
| DB-backed dedup constraint (`localId` UNIQUE per session) | In-memory dedup caches expire before mobile reconnect windows | Database unique constraint is the only correct dedup mechanism — no in-memory TTL cache |
| Bounded retention TTL | Prevents OOM and protects users who never return | TTL must be at least 1.5x the client's maximum reconnect window; single source-of-truth constant |
| Reconnect-triggered replay | The core delivery loop | `onReconnected()` in `Sync.ts` is the injection point — emit `reconnect-resume` before `resumeViaChanges` |

**What to defer (not v1.3):**
- Per-device buffering (requires adding `deviceId` to handshake — unresolved architecture question)
- CLI-to-relay direction resilience (CLI already has `localId` idempotency on insert; confirmed out of scope for this milestone)
- UI "reconnecting" badge (nice-to-have; existing `connectionStatus` component is the hook, but not required for correctness)

---

## Recommended Architecture

The design introduces an application-level message buffer keyed by `(userId, connectionKey)` that sits alongside — not replacing — the existing `resumeViaChanges` HTTP catch-up path. Connection State Recovery (Socket.IO CSR) is explicitly an optional optimization, not the foundation: it only works within a short window, is not guaranteed, and fails silently in light mode after a server restart. The mandatory path is the `UnackedMessageBuffer` → `reconnect-resume` → `socketDeduplicationFilter` loop.

**New components and their locations:**

| Component | Location | Responsibility |
|-----------|----------|---------------|
| `UnackedMessageBuffer` | `apps/server/sources/app/session/resilience/unackedMessageBuffer.ts` | Stores outbound `UpdatePayload` per `(userId, connectionKey)` until acked; SQLite (light) or Redis sorted set (full) backend |
| `AckTracker` | `apps/server/sources/app/session/resilience/ackTracker.ts` | Durably records highest acked seq per `(userId, connectionKey)`; survives server restart |
| `reconnectRedeliveryHandler` | `apps/server/sources/app/api/socket/reconnectRedeliveryHandler.ts` | Handles `reconnect-resume` event; queries buffer and re-emits pending payloads in order |
| `ackUpdateHandler` | `apps/server/sources/app/api/socket/ackUpdateHandler.ts` | Handles `ack-update` event; deletes buffer entries at or below acked seq |
| `socketDeduplicationFilter` | `apps/ui/sources/sync/engine/socket/socketDeduplicationFilter.ts` | Drops replayed `UpdatePayload` with `seq <= lastKnownSeq`; backed by existing `sessionMaterializedMaxSeqById` |

**Modified components (additive only — no modifications to `AcpBackend.ts` or `startDaemon.ts`):**

- `packages/protocol/src/updates.ts` — add `ReconnectResumeRequestSchema`, `AckUpdateRequestSchema`, optional `ackSeq` on `UpdateContainerSchema`
- `apps/server/sources/app/events/connectionEventRouter.ts` — fire-and-forget buffer write in `emitUpdate()`, derived from `RecipientFilter` before emitting
- `apps/server/sources/app/api/socket/socket.ts` — register the two new handlers
- `apps/server/prisma/schema.prisma` — two new models (`UnackedMessage`, `ClientAckState`)
- `apps/server/sources/app/retention/runtime/startRetentionWorker.ts` — add TTL sweep rule for `UnackedMessage`
- `apps/ui/sources/sync/sync.ts` — emit `reconnect-resume` in `onReconnected()`, emit debounced `ack-update` in `handleUpdate`
- `apps/ui/sources/sync/engine/socket/socket.ts` — call `socketDeduplicationFilter` before processing

**Deduplication two-key system:** `localId` (UUID, client-generated) for client→server direction; `UpdatePayload.seq` (server-assigned, already monotonic per Account) as the replay cursor for server→client direction. Both keys already exist in the protocol.

**Critical constraint on the emit path:** The buffer write in `emitUpdate()` must be fire-and-forget with a logged warning on failure. It must never throw or block the emit path — that path is hot.

**On the STACK.md vs ARCHITECTURE.md model conflict:** STACK.md proposes a single `RetainedMessage` model with `clientOffset`. ARCHITECTURE.md proposes two models (`UnackedMessage` + `ClientAckState`) keyed by `connectionKey`. Use ARCHITECTURE.md's design — it correctly separates buffer state from ack cursor state and handles multi-process (worker/api roles) and multi-device cases. The STACK.md model is simpler but conflates two distinct concerns.

See `.planning/research/ARCHITECTURE.md` for the complete 10-step data flow and all open questions.

---

## Watch Out For

Five pitfalls most likely to cause production failures or hard-to-debug regressions. Prevention must be wired in at the phase where the pitfall first applies.

1. **Unbounded per-client buffer causes server OOM.** Enforce a hard cap (500 entries per `connectionKey`) and a TTL (10 min default) before any buffer write reaches production. Add a Prometheus gauge at a soft threshold (50 entries). This is the most common real-world Socket.IO failure mode, documented across multiple GitHub issues (#3477, #2775, #4451).

2. **Zustand offline queue + new retry layer both retry the same message, causing duplicate AI responses.** Use `localId` as the single idempotency key for all outbound messages. The Socket.IO tutorial's `socketId-counter` pattern is wrong for this codebase — `socket.id` changes on reconnect. Exactly one layer owns retries per message class: the Zustand queue owns outbound pending messages; the resilience layer owns inbound re-delivery only.

3. **iOS kills the WebSocket in background before ack arrives.** Client-side deduplication is mandatory, not optional. On `AppState` change to `'background'`, flush pending acks synchronously or disconnect the socket explicitly. On foreground return, reconnect regardless of `socket.connected` state — do not trust a zombie connection.

4. **In-memory deduplication cache expires before mobile reconnect window closes, letting duplicates through.** Do not build an in-memory TTL dedup cache as a "fast path." The database unique constraint on `localId` per session is the only correct deduplication mechanism. An in-memory cache sized for seconds will expire during the mobile offline windows that matter (minutes to hours).

5. **New Socket.IO event names or required payload fields break the upstream mobile app.** All new event types must be additive and optional at both ends: server treats missing `lastAckedSeq` as 0; old mobile clients that do not emit `reconnect-resume` or `ack-update` continue working (server retains until TTL). Document all protocol additions in a `PROTOCOL_CHANGES.md` for upstream merge tracking.

---

## Key Decisions Needed

Unresolved questions from all four researchers that must be answered before or during implementation.

| Decision | Blocking Phase | Recommendation |
|----------|---------------|---------------|
| **Data model: single `RetainedMessage` (STACK.md) vs `UnackedMessage` + `ClientAckState` (ARCHITECTURE.md)** | Phase 2 | Use ARCHITECTURE.md's two-model design — it correctly separates buffer state from ack cursor state and handles multi-process correctly. |
| **Enable Socket.IO `connectionStateRecovery` option?** | Phase 3 | Skip for v1.3. Application-level buffer is the mandatory path. CSR fails silently in light mode after server restart and adds config complexity for marginal gain. Revisit in v1.4. |
| **Buffer `connectionKey` granularity: per-user or per-device?** | Phase 2 | Accept per-user buffering (`user-scoped:{userId}`) for v1.3. Adding per-device keys requires `deviceId` in the handshake, which has upstream compatibility implications. Document the extra-bandwidth trade-off. |
| **Buffer overflow behavior: drop oldest, disconnect client, or signal fallback?** | Phase 2 | Send a `buffer-overflow` signal on reconnect when the buffer was capped; mobile falls back to `resumeViaChanges`. Avoids data loss, leverages the existing cold-start path. |
| **CLI-to-relay retry direction: in scope for v1.3?** | Phase 1 | Out of scope. CLI already has `localId` idempotency on insert. Confirm with team whether CLI send failures are a reported user pain point before scoping in. |
| **`startupMessageCatchUpInitialAfterSeq` mutation risk** | Phase 4 | Treat as a regression test gate. Any change to `onReconnected()` must pass the existing `sessionClient.startupCatchUpRetry.test.ts` tests unchanged. |

---

## Recommended Phase Sequence

Five phases derived from ARCHITECTURE.md's build order, cross-checked against PITFALLS.md's prevention phases. Dependencies flow strictly downward.

### Phase 1: Protocol Contract

**Rationale:** Protocol types in `packages/protocol` must exist before either server or mobile can import them. Zero-risk additive changes. Establishes the `localId`-only dedup rule as a documented constraint before implementation begins.

**Delivers:** `ReconnectResumeRequestSchema`, `AckUpdateRequestSchema`, optional `ackSeq` on `UpdateContainerSchema`. `PROTOCOL_CHANGES.md` stub for upstream compatibility tracking.

**Covers features:** Defines the ack-coordinated delivery and deduplication contract.

**Pitfalls to prevent:** Upstream compatibility breakage (additive-only rule enforced here); socket-ID dedup namespace (reject at schema review — `localId` only).

**Research flag:** Standard patterns apply. Zod schema additions are well-established.

---

### Phase 2: Server Storage Layer

**Rationale:** `UnackedMessageBuffer` and `AckTracker` must exist before the emit path can write to them. Can be built and unit-tested without any socket wiring or mobile changes. SQLite and Redis backends share a common interface for independent validation.

**Delivers:** `unackedMessageBuffer.ts`, `ackTracker.ts`, Prisma schema additions (`UnackedMessage`, `ClientAckState`), retention sweep rule extension. Hard cap (500 entries) and TTL (10 min) enforced as defaults here.

**Covers features:** Server-side message retention, bounded retention window, ack-coordinated discard.

**Pitfalls to prevent:** Unbounded buffer (cap wired in here, not as a follow-up); deduplication window too short (DB constraint, not in-memory cache); TTL/reconnect window mismatch (single `RETENTION_TTL_MS` constant established here).

**Research flag:** Standard patterns for Prisma schema extension and Redis sorted set operations. SQLite write contention under high-frequency streaming is an open question — mark as a load-test target for Phase 5.

---

### Phase 3: Server Socket Integration

**Rationale:** Depends on Phase 2 storage. The `connectionEventRouter.emitUpdate()` modification is the highest-risk change — it touches the hot emit path — and must be validated with integration tests before mobile changes land.

**Delivers:** `reconnectRedeliveryHandler.ts`, `ackUpdateHandler.ts`, wired into `socket.ts`. Modified `emitUpdate()` with fire-and-forget buffer writes derived from `RecipientFilter`. Integration tests: connect → receive update → disconnect → reconnect → verify buffer replay; ack-then-reconnect → verify empty replay. Tests run in both SQLite and Postgres/Redis modes.

**Covers features:** Reconnect-triggered replay, ack-coordinated discard (server side).

**Pitfalls to prevent:** Emit path blocking (fire-and-forget enforced); Redis Streams multi-process `connectionKey` attribution (validate all `RecipientFilter` types in integration tests); touching `AcpBackend.ts`/`startDaemon.ts` (additive wrapper only — new handlers, no modification to existing call sites in tech-debt files).

**Research flag:** Needs careful integration testing. The Redis Streams multi-process `connectionKey` attribution (ARCHITECTURE.md open question #5) must be validated empirically here — docs are insufficient.

---

### Phase 4: Mobile Reconnect-Resume and Dedup

**Rationale:** Depends on Phase 3 — server must handle `reconnect-resume`. `socketDeduplicationFilter` must be in place before replay is enabled, or replayed messages will double-apply. MMKV-backed `lastAckedSeq` persistence must be added before the ack path is wired.

**Delivers:** `socketDeduplicationFilter.ts`, `Sync.onReconnected()` emitting `reconnect-resume`, debounced `ack-update` in `Sync.handleUpdate`, MMKV persistence of `lastAckedSeq`. Unit tests for dedup filter. Integration test for reconnect flow with mock socket.

**Covers features:** Client-side deduplication, reconnect-triggered replay (client side), ack-coordinated discard (client side), at-least-once delivery.

**Pitfalls to prevent:** iOS background socket kill (flush acks on `AppState` → `'background'`; reconnect on foreground); Zustand queue + retry double-processing (single `localId` key, boundary enforced); race condition on reconnect (gate outbound Zustand queue sends until replay completes); `startupMessageCatchUpInitialAfterSeq` mutation (existing test as regression gate).

**Research flag:** Android Doze testing requires a physical device (`adb shell dumpsys deviceidle force-idle`). Cannot be validated in CI. Flag for manual QA in Phase 5.

---

### Phase 5: End-to-End Validation and Hardening

**Rationale:** Can only run after all four phases complete. Confidence, observability, and tuning — not new behavior.

**Delivers:** E2E test (CLI sends → mobile socket drops mid-stream → reconnects → all messages present, no duplicates). Load test for buffer under high-frequency transcript streaming (validates SQLite WAL contention concern). Prometheus counters: `buffer_writes_total`, `buffer_acks_total`, `buffer_redeliveries_total`, `dedup_drops_total`. TTL and buffer cap tuning from load test data. Manual Android Doze QA. Server returns `retentionStart` with catch-up payloads so client can detect non-contiguous buffer and fall back to full reload.

**Covers features:** Graceful degradation, exponential backoff jitter validation, observability.

**Pitfalls to prevent:** Thundering herd reconnect (verify `randomizationFactor` on Socket.IO client options); sequence gap detection (add `retentionStart` to catch-up response).

**Research flag:** Standard patterns for Prometheus counters. Load test plan should be written before this phase begins.

---

### Phase Ordering Rationale

- Protocol types must precede both server and mobile changes (shared import).
- Server storage must precede server socket wiring (buffer interface must exist before emit path writes to it).
- Server socket wiring must precede mobile changes (server must handle `reconnect-resume`; integration tests validate the contract mobile depends on).
- Mobile changes must precede E2E tests (both ends must be complete before the full loop can be validated).
- The `AcpBackend.ts` / `startDaemon.ts` danger zones are avoided entirely: all new behavior is additive (new files, new handlers), with the single targeted exception of `connectionEventRouter.emitUpdate()`.

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| Stack | HIGH | Official Socket.IO 4.x docs verified against live codebase; no speculative dependencies |
| Features | HIGH | Table-stakes features verified against Socket.IO docs and codebase (`socketEmitWithAckFallback.ts`, `sessionUpdateHandler.ts`, `didWrite` return all confirmed) |
| Architecture | HIGH | All component locations and modification targets confirmed by reading source files; data flow fully mapped; open questions are known unknowns |
| Pitfalls | HIGH | Core pitfalls sourced from Socket.IO GitHub issues (#3477, #5282, #5434) and official docs; E2E encryption pitfalls verified from libsodium docs and Cornell 2024 research |

**Overall confidence: HIGH**

### Gaps to Address

| Gap | How to Handle |
|-----|--------------|
| Multi-device buffering (per-user vs per-device `connectionKey`) | Accept per-user for v1.3; document bandwidth trade-off; revisit when `deviceId` is added to handshake |
| CLI-to-relay retry direction | Confirm with team whether CLI send failures are a reported pain point; treat as out of scope until confirmed |
| SQLite write contention under high-frequency streaming | Load test in Phase 5; WAL-mode pragmas already applied but contention not validated at scale |
| Redis Streams adapter multi-process `connectionKey` attribution | Validate empirically in Phase 3 integration tests |
| Android Doze / iOS background behavior | Requires physical device testing in Phase 5; cannot be validated in CI emulators |

---

## Sources

### Primary (HIGH confidence)
- Socket.IO Delivery Guarantees (official): https://socket.io/docs/v4/delivery-guarantees
- Socket.IO Connection State Recovery (official): https://socket.io/docs/v4/connection-state-recovery
- Socket.IO Tutorial Steps 7 & 8 (official): https://socket.io/docs/v4/tutorial/step-7, step-8
- Socket.IO Redis Streams Adapter (official): https://socket.io/docs/v4/redis-streams-adapter/
- Socket.IO GitHub Issues #3477, #4451, #2775, #5282 (memory leaks, CSR failures)
- Socket.IO GitHub Discussion #5434 (duplicate emit prevention)
- Happier codebase (live): `connectionEventRouter.ts`, `sessionUpdateHandler.ts`, `socket.ts`, `pendingQueueV2Transport.ts`, `startServer.ts`, `createSyncSocketTransport.ts`, `sessionClient.startupCatchUpRetry.test.ts`, `sessionClient.afterSeqCatchUp.test.ts`

### Secondary (MEDIUM confidence)
- Cornell 2024 injection attacks paper (E2E encryption metadata side-channels): https://arxiv.org/html/2411.09228
- Ably WebSockets and Android background: https://ably.com/topic/websockets-android
- WebSocket.org iOS/Android background timeout guide: https://websocket.org/guides/troubleshooting/timeout/

### Tertiary (LOW confidence)
- Upstream `happier-dev/happier` shipping its own resilience layer — speculative; no evidence. Monitor upstream Socket.IO / session transport commits before implementation starts.

---
*Research completed: 2026-04-21*
*Ready for roadmap: yes*
