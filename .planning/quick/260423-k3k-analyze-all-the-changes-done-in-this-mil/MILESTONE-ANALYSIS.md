# v1.3 Request Resilience — Milestone Analysis

---

## The Problem

Every time a mobile user's socket drops — because they switched to airplane mode, went through a tunnel, or Android put the app in the background to save power — they reconnect a few seconds or minutes later. At that point, the server has no idea what messages the client already received. Before v1.3, the server's response to a reconnect was simple: send everything again from scratch using an HTTP catch-up call that fetched the current full state of all the user's data. That works, but it is slow and wasteful. More importantly, it means the mobile app "blinks": it shows stale content until the catch-up HTTP call finishes, which can take seconds on a slow mobile network.

The deeper problem is the gap. The server streams updates to connected sockets in real time — an agent sends a message, the server pushes an event to all of that user's connected clients. If the mobile client is disconnected for the ten seconds it takes the agent to finish a long response, the server emitted five or ten update events that the mobile client never received. Those events are gone; they were fired and forgotten. "Just reconnect" is not enough because the client has to know what it missed in order to apply it, and the server never recorded what it sent.

"Resilience" in this context means that the server buffers those outbound events while the client is gone, and the client can ask for them back when it reconnects. The technical term is replay. The client tells the server "the last sequence number I saw was 42" and the server replies with everything it buffered from 43 onwards. The client then deduplicates — if a message was delivered live and also appears in the replay, it ignores the duplicate. An acknowledgement cursor (called `ackSeq` or `lastAckedSeq`) tracks how far the client has advanced, so the server knows which buffered entries it can safely discard.

Why is this hard? Several reasons. First, the server's existing emit path is fire-and-forget by design: emitting a Socket.IO event must never block, throw, or slow down the response to the agent's API call. Any buffer write has to happen asynchronously as a side-effect. Second, the server can run as multiple Node.js processes behind a load balancer (using Redis as a pub-sub bus), so the buffer must be stored in a shared database, not in memory. Third, mobile clients on Android are subject to Doze mode, which can freeze the app's timers in the background — so the acknowledgement flush to the server must be done synchronously before the app background event returns. Fourth, the CLI tool must be explicitly excluded from buffering: CLI sessions use echo suppression (the server suppresses re-sending your own writes back to you), and replaying those suppressed events after they have expired would deliver phantom messages to the wrong place.

---

## The Architecture at a Glance

The solution is structured as four layers that negotiate through a shared contract.

**Layer 1 — Shared protocol contract.** The `packages/protocol` package defines every new Socket.IO event name and its payload schema as Zod validators. Both the server and the mobile app import from this single package, so there is no chance of the two sides using different field names or different sequence semantics. The key events are: `reconnect-resume` (client → server: "I'm back, here's my last acked seq"), `replay-start` (server → client: "replay beginning, here's the oldest seq I have"), `replay-complete` (server → client: "done, release your outbound queue"), `ack-update` (client → server: "I've processed everything up to this seq"), and `buffer-overflow` (server → client: "I lost some messages, fall back to HTTP catch-up"). A shared constant `ACK_DEBOUNCE_MS = 500` controls how long the client waits before batching acknowledgement emissions.

**Layer 2 — Server-side buffer.** The relay stores undelivered events in two Prisma database tables: `UnackedMessage` (one row per buffered event, keyed by `userId` + `connectionKey` + `seq`) and `ClientAckState` (the watermark of what the client has acknowledged). Three functions encapsulate all buffer logic: `writeToBuffer` (atomic insert with cap enforcement and CLI exclusion), `readBuffer` (read everything above a given seq in ascending order), and `ackBuffer` (delete everything at or below a given seq). A retention rule wired into the server's existing cleanup worker sweeps rows older than the configured TTL (default 120 seconds), using the same constant as the cap.

**Layer 3 — Server socket integration.** A new `resilienceHandler` registers two Socket.IO event listeners on every user-scoped connection. When the client emits `reconnect-resume`, the handler reads the buffer, emits `replay-start`, replays all buffered events in seq order, and emits `replay-complete`. If the buffer has a gap (the oldest buffered seq is higher than `lastAckedSeq + 1`, meaning some events were trimmed by the cap), the handler also emits `buffer-overflow` before the replay. Meanwhile, the existing `emitUpdate` function in the event router now calls `writeToBuffer` as a fire-and-forget side-effect on every outbound push — the buffer write runs in the background and never delays the emit.

**Layer 4 — Mobile client resilience.** A new `engine/resilience/` module in the mobile sync layer provides three pure functions: `shouldApplyUpdate` (deduplication: accept a message only if its seq is higher than the last acked seq), `shouldHoldServerCommit` (replay gate: block outbound HTTP commits while server replay is in progress), and the ack cursor manager (`scheduleAckUpdateFlush`, `flushAckUpdateNow`). These are wired into the existing `sync.ts` orchestrator: on reconnect, it emits `reconnect-resume`; on receiving `replay-start`, it gates the outbound queue; on receiving `replay-complete`, it releases the gate; on going to the background, it synchronously flushes the ack and persists the cursor to MMKV storage.

```
Mobile → [socket disconnect]
  Server buffers all outbound update events (writeToBuffer, fire-and-forget)

Mobile → [reconnect] → emits reconnect-resume { lastAckedSeq: 42 }
  Server reads buffer for seq > 42
  Server emits replay-start { retentionStart: 43 }         (if buffer non-empty)
  Server emits buffer-overflow                              (if gap: 43 > 42+1)
  Server emits update(43), update(44), ..., update(N)      (buffered messages)
  Server emits replay-complete { retentionStart: 43 }

Mobile:
  On replay-start → arm replay gate (hold outbound HTTP commits)
  On each update  → shouldApplyUpdate(seq, lastAckedSeq): skip if already seen
  On buffer-overflow → trigger resumeViaChanges (full HTTP catch-up, deduped)
  On replay-complete → release gate, drain held commits
  Periodically     → ack-update { seq: N } (debounced every 500ms)
```

---

## Phase-by-Phase Breakdown

### Phase 6: Protocol Contract

**The problem this phase solved:**
Before Phase 6, there was no shared definition of the new Socket.IO events. Any developer writing the server handler and the mobile handler independently would have had to coordinate event names, payload field names, and validation rules out-of-band — a recipe for subtle bugs and drift. There was also no documented constant for how long the mobile client should wait before flushing an ack, meaning both sides might choose different values.

**The solution:**
Phase 6 created `packages/protocol/src/socketResilience.ts` — a single source of truth for every new event name (as a typed `as const` object), both request schemas (`ReconnectResumeRequestSchema`, `AckUpdateRequestSchema`) using Zod with `.passthrough()` for forward compatibility, and the `ACK_DEBOUNCE_MS = 500` constant. The `UpdateContainerSchema` was extended with an optional `ackSeq` field (inlined, not via `.extend()`, to preserve the existing passthrough behavior for clients on the old protocol). Server-side environment variable resolvers for `RELAY_BUFFER_CAP` (default 500) and `RELAY_BUFFER_TTL_MS` (default 120000) were added to the server config. All exports were wired into the package's public `index.ts`. The new events were documented in `docs/protocol.md`.

**Architecture contribution:**
- `packages/protocol/src/socketResilience.ts` — The canonical event name map and request schemas; both server and mobile import from here. Changes to event names or payloads require a single edit.
- `packages/protocol/src/updates.ts` — Extended with optional `ackSeq` field; enables the server to piggyback the sequence number on existing update payloads without breaking old clients that don't know about it.
- `apps/server/sources/config/backends.ts` — `getRelayBufferCapFromEnv` and `getRelayBufferTtlMsFromEnv` resolver functions; these read operator-configurable environment variables with safe numeric fallbacks, so production deployments can tune buffer behavior without code changes.
- `docs/protocol.md` — Human-readable reference for the four new events; the authoritative source for any developer implementing a new client.

---

### Phase 7: Server Storage Layer

**The problem this phase solved:**
Even if the server wanted to buffer messages, it had nowhere to store them. The existing database schema had no concept of "messages sent to a client that may not have been received." Without durable storage, a server restart (or a scale-out to a second process) would lose all in-memory state. The buffer also needed to be bounded — an unlimited buffer would grow forever if a mobile client stayed disconnected — and it needed to be automatically cleaned up for clients that never reconnect.

**The solution:**
Phase 7 added two Prisma models to the database schema: `UnackedMessage` (stores each buffered event with `userId`, `connectionKey`, `seq`, `payload`, and `createdAt`) and `ClientAckState` (stores the watermark of what each client has confirmed receiving, with a unique constraint on `userId + connectionKey`). Three functions implement the buffer API: `writeToBuffer` runs an atomic database transaction that inserts a new row, counts the total for that connection, and trims the oldest rows if the count exceeds the cap — all in one transaction to prevent race conditions under concurrent writes. `readBuffer` returns all rows above a given seq in ascending order. `ackBuffer` deletes all rows at or below a given seq. A retention rule was plugged into the server's existing periodic cleanup worker to sweep rows older than the configured TTL, closing the loop so the buffer does not grow unbounded even for offline clients. The CLI exclusion guard (`connectionKey.startsWith('user-scoped:')`) is the first statement in `writeToBuffer` — non-user-scoped connections return immediately with zero database calls.

**Architecture contribution:**
- `apps/server/prisma/schema.prisma` — `UnackedMessage` and `ClientAckState` models; the physical storage for the relay buffer.
- `apps/server/sources/app/resilience/unackedBuffer.ts` — The three buffer API functions; all callers go through this module. Encapsulates the atomicity, cap logic, CLI exclusion, and metric increments.
- `apps/server/sources/app/resilience/unackedMessageRetentionRule.ts` — A `RetentionRule` factory registered in the existing retention worker; the TTL sweep runs on the server's existing schedule with no new infrastructure required.
- `apps/server/sources/app/retention/runtime/retentionRuleRegistry.ts` — One line added to register the new retention rule; the worker picks it up automatically.

---

### Phase 8: Server Socket Integration

**The problem this phase solved:**
The buffer existed but nothing wrote to it or read from it in the live socket path. Every outbound event still went out as fire-and-forget — written nowhere. There was also no socket handler for the new `reconnect-resume` or `ack-update` events, so a reconnecting client had no way to trigger a replay. The emit path also needed to remain non-blocking: if the buffer write was added as an `await` inside `emitUpdate`, it would slow down every single outbound push even for clients that were connected and did not need buffering.

**The solution:**
Phase 8 added `resilienceHandler.ts` — a function that registers two Socket.IO listeners (`reconnect-resume` and `ack-update`) on each user-scoped connection. The `reconnect-resume` handler reads the buffer, emits `replay-start` with the oldest retained seq, optionally emits `buffer-overflow` if there is a gap, replays all buffered events in seq order, and always ends with `replay-complete`. The `ack-update` handler calls `ackBuffer` idempotently. The handler was registered in the server's central `socket.ts` wiring only for connections whose `clientType` is `user-scoped`. The fire-and-forget buffer write was wired into `connectionEventRouter.emitUpdate()` using `Promise.resolve(writeToBuffer(...)).catch(log)` — it runs after the `socket.emit()` call completes and any error is only logged, never surfaced to the caller.

**Architecture contribution:**
- `apps/server/sources/app/api/socket/resilienceHandler.ts` — The reconnect-resume and ack-update event handlers; the entry point for the server-side replay flow.
- `apps/server/sources/app/events/connectionEventRouter.ts` — Modified to call `writeToBuffer` as a fire-and-forget side-effect on every `emitUpdate` call; this is the point where live events enter the buffer.
- `apps/server/sources/app/api/socket.ts` — Modified to register `resilienceHandler` for user-scoped connections; the guard ensures CLI and machine-scoped connections do not get the replay handlers.

---

### Phase 9: Mobile Reconnect and Deduplication

**The problem this phase solved:**
The server was ready to replay, but the mobile client had no code to ask for a replay, process one, or prevent itself from double-applying events that arrived both live and via replay. There was also no mechanism to pause the mobile app's outbound commit queue while a replay was in progress — if the client sent a write to the server during replay, the server might process it against stale state before the client finished applying the replayed updates.

**The solution:**
Phase 9 was a TDD build of three pure modules under `apps/ui/sources/sync/engine/resilience/` and their wiring into the existing `sync.ts` orchestrator. `dedupFilter.ts` exports `shouldApplyUpdate(seq, lastAckedSeq)`: returns true only if `seq > lastAckedSeq` (strict greater-than, so equal seq means already applied). `ackCursorManager.ts` exports `scheduleAckUpdateFlush` (starts a 500ms debounce timer to emit `ack-update`) and `flushAckUpdateNow` (synchronous immediate flush, used when the app goes to background). `replayGate.ts` exports `shouldHoldServerCommit(gate)`: returns `gate.isReplaying`, used to gate the pending commit queue. `persistence.ts` was extended with `loadLastAckedSeq` and `saveLastAckedSeq` backed by MMKV storage, with a safe default of 0 (which means "full replay" rather than "drop messages" if the value is corrupt or missing). These were wired into `sync.ts`: on socket reconnect, `reconnect-resume` is emitted with the persisted cursor; `REPLAY_START` arms the replay gate; `BUFFER_OVERFLOW` triggers `resumeViaChanges`; `REPLAY_COMPLETE` disarms the gate and drains held commits; the AppState background handler synchronously flushes the ack and saves the cursor. The foreground handler disconnects and reconnects to force a fresh reconnect-resume cycle after the app returns from background.

**Architecture contribution:**
- `apps/ui/sources/sync/engine/resilience/dedupFilter.ts` — Deduplication: a one-liner check that is the last defence against replaying a message the client already applied.
- `apps/ui/sources/sync/engine/resilience/ackCursorManager.ts` — Ack debounce: batches acknowledgements to avoid flooding the server with one `ack-update` per received message.
- `apps/ui/sources/sync/engine/resilience/replayGate.ts` — Replay gate: a boolean flag used to hold outbound commits during server replay so the client does not write against stale state.
- `apps/ui/sources/sync/domains/state/persistence.ts` — Extended with MMKV-backed cursor persistence; the cursor survives app restarts so a reconnect after a cold start does not request a full replay unnecessarily.
- `apps/ui/sources/sync/sync.ts` — The main orchestrator; wires all resilience hooks into the existing socket reconnect, AppState, and `handleUpdate` paths.
- `apps/ui/sources/sync/engine/pending/pendingQueueV2.ts` — Modified to accept an optional `replayGate` parameter; holds HTTP commits when `shouldHoldServerCommit(gate)` returns true.

---

### Phase 10: E2E Validation and Hardening

**The problem this phase solved:**
Phases 6-9 built the feature layer by layer with unit and integration tests at each layer, but no test proved that the full end-to-end loop worked: a real mobile client disconnecting, a real server buffering, a real reconnect, and the replay arriving correctly with no duplicates. There was also no observability — no way for a production operator to tell whether the buffer was being used, how many messages were being replayed, or how many duplicates were being filtered. Finally, there was a missing Prisma migration: the `UnackedMessage` and `ClientAckState` tables had been added to `schema.prisma` but no SQL migration file existed, so the test environment's database did not have the tables.

**The solution:**
Phase 10 delivered four things. First, four Prometheus counters (`buffer_writes_total`, `buffer_acks_total`, `buffer_redeliveries_total`, `dedup_drops_total`) were added to `metrics2.ts` and wired at the correct call sites in `unackedBuffer.ts` and `resilienceHandler.ts`. Second, a `SocketCollector.on()/off()` pass-through was added to the test kit so E2E tests could register listeners for resilience events. Third, an E2E test (`reconnect.resilience.e2e.test.ts`) was written that connects two devices, sends events from Device A to Device B, disconnects B mid-stream, continues sending events, reconnects B, and then asserts that B received all events exactly once (no duplicates, no gaps). Fourth, the missing Prisma migration SQL file was created so the test server could apply the schema correctly. A PostgreSQL connection pool stress test was also added to validate that concurrent writes to the buffer do not cause contention.

**Architecture contribution:**
- `apps/server/sources/app/monitoring/metrics2.ts` — Four new counters that give operators visibility into buffer activity in production.
- `packages/tests/suites/core-e2e/reconnect.resilience.e2e.test.ts` — The end-to-end proof: exercises the full reconnect-resume loop with real socket connections and real database writes.
- `apps/server/prisma/migrations/20260423000000_add_unacked_message_buffer/migration.sql` — The SQL migration that creates the buffer tables in deployed environments; without this, the feature would silently fail in any environment that runs `prisma migrate deploy` from scratch.

---

### Phase 11: Tech Debt Cleanup

**The problem this phase solved:**
The audit of the completed implementation found three categories of gaps. First, the 32 requirements tracked in `REQUIREMENTS.md` were all implemented but their checkboxes were still unchecked — the records were stale. Second, the SRVR-01 integration test was using an async describe callback, which Vitest does not await during collection, making the test non-deterministic (the `vi.importActual` call was racing with test setup). Third, the protocol documentation had two inaccuracies: `replay-complete` was documented as having no payload when it actually emits `{ retentionStart: number | null }`, and `VALID-03` referenced "SQLite WAL contention" when the actual load test targets PostgreSQL connection pool saturation.

**The solution:**
Three targeted cleanup plans. Plan 11-01 checked all 32 requirement boxes in `REQUIREMENTS.md` and added `requirements-completed` frontmatter to the Phase 7/8/9 SUMMARY files so the traceability table was accurate. Plan 11-02 refactored the SRVR-01 describe block to move the `vi.importActual` call into a `beforeAll` so it runs deterministically before any tests. Plan 11-03 corrected the `docs/protocol.md` replay-complete payload and updated the VALID-03 requirement description to name the correct test file and contention type.

**Architecture contribution:**
- `.planning/REQUIREMENTS.md` — All 32 implementation requirements now correctly marked complete.
- `apps/server/sources/app/api/socket/resilienceHandler.integration.spec.ts` — SRVR-01 test refactored to use `beforeAll` for deterministic module loading.
- `docs/protocol.md` — Accurate payload documentation for `replay-complete`; authoritative reference for future client implementors.

---

### Phase 12: Address Remaining Audit Items

**The problem this phase solved:**
The v1.3 milestone audit identified four remaining gaps after Phase 11. First, `shouldHoldServerCommit` — the function that encapsulates the replay gate predicate — was exported but never called in production code; `pendingQueueV2.ts` was accessing `gate.isReplaying` directly instead. This meant the function was dead code and the gate logic was not centralised. Second, the `ackSeq` field on `UpdateContainerSchema` had no inline comment explaining that it was reserved for future piggybacking and was currently parsed but not consumed. Third, the `writeToBuffer` guard in `connectionEventRouter.ts` needed verification that it correctly handled all five `RecipientFilter` variants. Fourth, the Android Doze QA checklist had been created but not executed on a physical device.

**The solution:**
Plan 12-01 replaced the direct `gate.isReplaying` field access in `pendingQueueV2.ts` with a call to `shouldHoldServerCommit(gate)`, centralising the gate predicate. Plan 12-02 added an inline comment to the `ackSeq` field in `updates.ts`, verified the `writeToBuffer` guard correctness for all `RecipientFilter` variants (no code change needed — the guard was already correct), and updated the milestone audit status from `tech_debt` to `closed`. The Android Doze physical device test was explicitly deferred as a leave-as-is item.

**Architecture contribution:**
- `apps/ui/sources/sync/engine/pending/pendingQueueV2.ts` — `shouldHoldServerCommit` now called at the commit-hold decision point; gate logic is centralised in `replayGate.ts`.
- `packages/protocol/src/updates.ts` — `ackSeq` field annotated with its intent, preventing future readers from silently removing or misusing it.
- `.planning/v1.3-MILESTONE-AUDIT.md` — Milestone status marked `closed` with all four Phase 12 closures recorded.

---

## Key Design Decisions and Why

**Two-model design (`UnackedMessage` + `ClientAckState`) instead of a single table.**
Separating the buffer rows from the ack watermark means the two concerns can evolve independently. The buffer entries are written on every outbound push and deleted in bulk when acked. The ack watermark is updated less frequently. Combining them into one model would have required updating a single shared row on every ack, creating write contention in a high-throughput scenario. It also makes the TTL sweep cleaner: the retention rule deletes `UnackedMessage` rows by `createdAt` without touching the ack cursor at all.

**Per-user buffer key (`user-scoped:{userId}`), not per-device.**
The `deviceId` field needed to route buffers per-device does not exist in the current socket handshake protocol. Adding it would have been an upstream compatibility change requiring both the CLI and the mobile app to be updated simultaneously. Per-user buffering is correct for the current architecture because each user typically has one active mobile session at a time, and the buffer is consumed on reconnect regardless of which device reconnected. Per-device buffering is deferred to v1.4 when `deviceId` can be added to the handshake.

**Overflow → `resumeViaChanges` fallback, not disconnect.**
When the buffer is full (more than 500 messages accumulated during a long disconnect), the server trims the oldest entries and signals `buffer-overflow` on reconnect. The client responds by triggering its existing HTTP catch-up (`resumeViaChanges`), which fetches the current full state. This means the user gets correct data — just slightly slower than the ideal replay path. The alternative, disconnecting the client and forcing it to retry, would be worse: the client would reconnect, discover overflow again, disconnect, and loop. The fallback design means even a very long disconnect (longer than the TTL) is handled gracefully with no data loss.

**CLI exclusion from buffering.**
CLI sessions use echo suppression: when the CLI sends a command, the server suppresses re-delivering that event back to the same CLI connection. Buffering the CLI's outbound events would store these echo-suppressed payloads, and replaying them after the TTL expires would deliver expired, suppressed content to the wrong place. Rather than building a per-event exception for echo suppression into the buffer, the simpler and safer design is to exclude CLI connections entirely. The CLI already has its own idempotency mechanism (`localId`) for retries, so it does not need the mobile replay path.

**Fire-and-forget emit path — the buffer write never blocks.**
The server's `emitUpdate` function is called in the hot path of every API response: when an agent sends a message, the server emits it to all connected clients via `emitUpdate`. If the buffer write (`writeToBuffer`) were awaited inline, a slow database write would delay every socket push for every user, regardless of whether they needed buffering. The fire-and-forget pattern (`Promise.resolve(writeToBuffer(...)).catch(log)`) means the emit happens immediately and the buffer write races in the background. If the write fails, the error is logged but the user's experience is not affected. This is the correct trade-off: the buffer is a best-effort durability aid, not a synchronous guarantee.

**Application-level buffer instead of Socket.IO's `connectionStateRecovery`.**
Socket.IO 4.x offers a built-in `connectionStateRecovery` feature that can buffer events in memory and replay them on reconnect. This was evaluated and rejected. Memory buffers are lost on server restart and cannot be shared across multiple server processes (a multi-process deployment with Redis would need each server to know which events it emitted, which breaks on reconnect if the client reconnects to a different server). The application-level buffer in PostgreSQL is durable, shared, and process-agnostic. Socket.IO's `connectionStateRecovery` remains an optional future optimisation for single-process deployments where latency matters more than durability.

---

## What Was Explicitly Left Out (Deferred)

**Per-device buffering.** The buffer keys messages by `userId`, not by `deviceId`. This means if a user has two mobile devices and both disconnect, both will receive the same replay on reconnect. This is acceptable for v1.3 because the deduplication logic (`shouldApplyUpdate`) filters out any messages the device already applied. Per-device buffering requires adding `deviceId` to the socket handshake, which is an upstream compatibility change deferred to v1.4.

**UI "reconnecting" badge.** The mobile app already has a `connectionStatus` component that could display a "reconnecting..." indicator to the user while the replay gate is active. Wiring the `isReplaying` state into that component was deferred — it is a UX enhancement, not a correctness requirement.

**Socket.IO `connectionStateRecovery` as a fast-path optimisation.** This feature could speed up the replay for single-process deployments by keeping events in memory and replaying them before the TCP handshake even completes. It was explicitly deferred as a future optional optimisation; the application-level buffer is the mandatory path and works correctly across all deployment topologies.

**CLI-to-relay retry direction.** The CLI already uses `localId` for idempotent retries on its outbound requests to the relay. Whether the relay should buffer events for CLI connections in the reverse direction (server → CLI) was evaluated and deferred. The CLI's session management makes this less critical — CLI sessions are short-lived and the catch-up mechanism is lighter.

**Android Doze physical device execution.** The QA checklist for Android Doze behavior (which aggressively suspends background apps) was created and documented, but executing it requires a physical Android device with access to developer settings. This was deferred as a leave-as-is item in the milestone audit; the implementation follows the correct patterns (synchronous MMKV write before the AppState background handler returns) but the empirical validation on hardware was not done within the milestone.
