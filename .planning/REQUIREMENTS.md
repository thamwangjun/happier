# Requirements: v1.3 Request Resilience

**Milestone:** v1.3 — Request Resilience
**Status:** Active
**Created:** 2026-04-21

---

## v1.3 Requirements

### Protocol Contract

- [x] **PROTO-01**: Developer can review all new Socket.IO event types in a versioned `PROTOCOL_CHANGES.md` stub to track upstream merge compatibility
- [x] **PROTO-02**: Server and mobile clients share a `ReconnectResumeRequestSchema` type (`{ sessionId, lastAckedSeq }`) for the reconnect handshake
- [x] **PROTO-03**: Server and mobile clients share an `AckUpdateRequestSchema` type (`{ sessionId, seq }`) for delivery confirmation
- [x] **PROTO-04**: `UpdateContainerSchema` carries an optional `ackSeq` field so the server can piggyback ack hints on outbound payloads
- [x] **PROTO-05**: Relay server reads `RELAY_BUFFER_CAP` (default: 500) and `RELAY_BUFFER_TTL_MS` (default: 120000) from environment variables at startup with safe fallbacks; `ackDebounceMs` (default: 500ms) is a documented mobile client constant in `PROTOCOL_CHANGES.md`

### Server Storage Layer

- [x] **STORE-01**: User can receive messages missed during a disconnection when they reconnect (relay retains unacked outbound messages per `userId` + `connectionKey`)
- [x] **STORE-02**: Relay enforces a configurable per-`connectionKey` message cap (default 500, controlled by `RELAY_BUFFER_CAP` env var) to prevent OOM under runaway clients
- [x] **STORE-03**: Relay enforces a configurable TTL on retained messages (default 2 minutes, controlled by `RELAY_BUFFER_TTL_MS` env var) so buffers are reclaimed for users who never return
- [x] **STORE-04**: Relay discards buffer entries at or below the acked `seq` when the client confirms receipt
- [x] **STORE-05**: Relay signals a `buffer-overflow` event on reconnect when the buffer was capped, so the client can fall back to the existing HTTP catch-up path
- [x] **STORE-06**: Retained messages are swept by the existing retention worker using the same TTL constant as the buffer
- [x] **STORE-07**: Relay buffer applies only to mobile/web `connectionKey` types — CLI session sockets and CLI user sockets are explicitly excluded from buffering to prevent replay of expired echo-suppressed messages on the CLI side

### Server Socket Integration

- [x] **SRVR-01**: Relay writes every outbound `UpdatePayload` to the buffer as a fire-and-forget side-effect of `emitUpdate()` (never blocks the emit path)
- [x] **SRVR-02**: Relay replays buffered messages in order when a client emits `reconnect-resume`
- [x] **SRVR-03**: Relay removes buffer entries when a client emits `ack-update`
- [x] **SRVR-04**: Integration test passes: client disconnects → reconnects → receives all buffered messages in order (SQLite mode)
- [x] **SRVR-05**: Integration test passes: client disconnects → reconnects → receives all buffered messages in order (Postgres/Redis mode)
- [x] **SRVR-06**: Integration test passes: client acks → disconnects → reconnects → replay is empty
- [x] **SRVR-07**: Existing `sessionClient.startupCatchUpRetry.test.ts` passes unchanged after all `onReconnected()` modifications (regression gate — startup catch-up cursor must not be mutated by the resilience layer)
- [x] **SRVR-08**: Relay silently ignores `ack-update` events for `seq` values already discarded from the buffer (idempotent ack handling — prevents spurious errors on every reconnect when client re-acks previously confirmed messages)
- [x] **SRVR-09**: Relay emits a `replay-complete` event in response to `reconnect-resume` in all cases: after the last buffered message is sent, after `buffer-overflow` is signalled, or immediately if the buffer is empty — `replay-complete` is the universal gate-release signal for MOB-07 regardless of which replay path was taken
- [x] **SRVR-10**: Relay's response to `reconnect-resume` includes a `retentionStart` field (the oldest `seq` still in the buffer) sent before any replay messages, so the client can detect a non-contiguous buffer and proactively trigger `resumeViaChanges` instead of replaying (MOB-09)

### Mobile/Web Reconnect and Deduplication

- [x] **MOB-01**: Mobile/web client emits `reconnect-resume` with `lastAckedSeq` on every socket reconnect
- [x] **MOB-02**: Client discards duplicate messages from both socket replay and HTTP catch-up paths using `seq` before applying them (deduplication filter applies to all inbound update sources, not only socket replay)
- [x] **MOB-03**: Client emits a debounced `ack-update` after the `materializedMaxSeq` coalescer applies a batch to the Zustand store — not on socket receipt — (default 500ms debounce, carrying the highest applied `seq`)
- [x] **MOB-04**: Client persists `lastAckedSeq` to MMKV so delivery cursor survives app force-quit and OS-level process termination
- [x] **MOB-05**: Client flushes pending acks synchronously when the app transitions to background (guards against iOS WebSocket kill before ack arrives)
- [x] **MOB-06**: Client initiates a fresh reconnect when returning to foreground regardless of `socket.connected` state (guards against zombie connections)
- [x] **MOB-07**: Client gates new server commits from the outbound Zustand pending queue during socket replay and drains them only after replay completes — optimistic store updates are not gated and continue to apply immediately (prevents client→server commit interleaving without freezing the UI)
- [x] **MOB-08**: Client triggers `resumeViaChanges` immediately on receiving a `buffer-overflow` event, skipping socket replay entirely for that reconnect cycle
- [x] **MOB-09**: Client triggers `resumeViaChanges` proactively when the relay's `retentionStart` value exceeds `lastAckedSeq + 1`, indicating a non-contiguous buffer with missing messages (does not wait for `onMessageGapDetected` to fire reactively)
- [x] **MOB-10**: Client ensures at most one `resumeViaChanges` call is in-flight per session per reconnect cycle — if `buffer-overflow` (MOB-08) and gap detection (MOB-09) both trigger in the same cycle, the second trigger is a no-op until the first completes

### E2E Validation and Hardening

- [x] **VALID-01**: E2E test passes: CLI sends a sequence of messages → mobile socket drops mid-stream → mobile reconnects → all messages are present exactly once
- [x] **VALID-02**: Relay exposes Prometheus counters: `buffer_writes_total`, `buffer_acks_total`, `buffer_redeliveries_total`, `dedup_drops_total`
- [x] **VALID-03**: Load test validates connection pool saturation under high-frequency transcript streaming — 200 concurrent `writeToBuffer` calls via `Promise.all` (`buffer.walContention.stress.test.ts`)
- [x] **VALID-04**: Manual Android Doze QA checklist is documented and executed on a physical device

---

## Future Requirements

- Per-device buffering (requires `deviceId` in socket handshake — upstream compatibility implications; defer to v1.4)
- CLI-to-relay retry direction (CLI already has `localId` idempotency on insert; revisit if CLI send failures are a reported user pain point)
- UI "reconnecting" badge using existing `connectionStatus` component
- Socket.IO `connectionStateRecovery` as an optional fast-path for full-mode deployments (deferred — application-level buffer is mandatory path; CSR is optimization only)

---

## Out of Scope

- CLI-to-relay direction resilience — CLI already inserts with `localId` idempotency; no reported user pain point
- Socket.IO Connection State Recovery as primary delivery mechanism — fails silently in light mode after server restart; application-level buffer is the correct foundation
- In-memory TTL dedup cache as a "fast path" — expires before mobile offline windows (minutes to hours); DB unique constraint on `localId` is the only correct mechanism
- BullMQ or similar queue libraries — Socket.IO built-ins (`retries`, `ackTimeout`) and a single DB query at reconnect cover all retry needs
- Modifications to `AcpBackend.ts` or `startDaemon.ts` — all new behavior is additive (new files, new handlers); these tech-debt files must not be touched

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| PROTO-01 | Phase 6 | Complete |
| PROTO-02 | Phase 6 | Complete |
| PROTO-03 | Phase 6 | Complete |
| PROTO-04 | Phase 6 | Complete |
| PROTO-05 | Phase 6 | Complete |
| STORE-01 | Phase 7 | Complete |
| STORE-02 | Phase 7 | Complete |
| STORE-03 | Phase 7 | Complete |
| STORE-04 | Phase 7 | Complete |
| STORE-05 | Phase 7 | Complete |
| STORE-06 | Phase 7 | Complete |
| STORE-07 | Phase 7 | Complete |
| SRVR-01 | Phase 8 | Complete |
| SRVR-02 | Phase 8 | Complete |
| SRVR-03 | Phase 8 | Complete |
| SRVR-04 | Phase 8 | Complete |
| SRVR-05 | Phase 8 | Complete |
| SRVR-06 | Phase 8 | Complete |
| SRVR-07 | Phase 8 | Complete |
| SRVR-08 | Phase 8 | Complete |
| SRVR-09 | Phase 8 | Complete |
| SRVR-10 | Phase 8 | Complete |
| MOB-01 | Phase 9 | Complete |
| MOB-02 | Phase 9 | Complete |
| MOB-03 | Phase 9 | Complete |
| MOB-04 | Phase 9 | Complete |
| MOB-05 | Phase 9 | Complete |
| MOB-06 | Phase 9 | Complete |
| MOB-07 | Phase 9 | Complete |
| MOB-08 | Phase 9 | Complete |
| MOB-09 | Phase 9 | Complete |
| MOB-10 | Phase 9 | Complete |
| VALID-01 | Phase 10 | Complete |
| VALID-02 | Phase 10 | Complete |
| VALID-03 | Phase 10 | Complete |
| VALID-04 | Phase 10 | Complete |
