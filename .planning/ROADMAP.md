# Roadmap: Happier (Fork)

## Milestones

- ✅ **v1.0 MCP Tool Configuration** — Phases 1-3 (shipped 2026-04-19)
- ✅ **v1.1 Distinguish Parent vs Subagent Turn Completion** — Phases 4-5 (shipped 2026-04-20)
- **v1.3 Request Resilience** — Phases 6-10 (active)

## Phases

<details>
<summary>✅ v1.0 MCP Tool Configuration (Phases 1-3) — SHIPPED 2026-04-19</summary>

- [x] Phase 1: Schema & Reader (1/1 plans) — completed 2026-04-19
- [x] Phase 2: Startup Wiring & Tool Filtering (3/3 plans) — completed 2026-04-19
- [x] Phase 3: Validation Feedback (1/1 plan) — completed 2026-04-19

</details>

<details>
<summary>✅ v1.1 Distinguish Parent vs Subagent Turn Completion (Phases 4-5) — SHIPPED 2026-04-20</summary>

- [x] Phase 4: Restructure finalizeCurrentTurn() (2/2 plans) — completed 2026-04-19
- [x] Phase 5: Verify End-to-End Behavior (1/1 plan) — completed 2026-04-20

</details>

### v1.3 Request Resilience

- [ ] **Phase 6: Protocol Contract** - Shared typed schemas and protocol change documentation for all new Socket.IO events
- [ ] **Phase 7: Server Storage Layer** - Server-side unacked message buffer with cap, TTL, ack discard, overflow signal, and CLI exclusion
- [ ] **Phase 8: Server Socket Integration** - Socket handlers for reconnect-resume and ack-update wired into the live emit path, with integration tests in both storage modes
- [ ] **Phase 9: Mobile Reconnect and Deduplication** - Mobile client emits reconnect-resume, deduplicates replayed messages, persists ack cursor, and gates outbound queue during replay
- [ ] **Phase 10: E2E Validation and Hardening** - End-to-end test, Prometheus counters, SQLite load test, and Android Doze QA checklist

## Phase Details

### Phase 6: Protocol Contract
**Goal**: Developers and both sides of the relay contract share typed, versioned schemas for all new resilience events — no new behavior, only the shared contract that later phases depend on
**Depends on**: Nothing (first phase of v1.3)
**Requirements**: PROTO-01, PROTO-02, PROTO-03, PROTO-04, PROTO-05
**Success Criteria** (what must be TRUE):
  1. A developer can open `PROTOCOL_CHANGES.md` and read the full list of new Socket.IO event names, their payload types, and upstream compatibility notes for the reconnect-resume flow
  2. Server and mobile code can import `ReconnectResumeRequestSchema` and `AckUpdateRequestSchema` from the shared `packages/protocol` package without any type errors
  3. `UpdateContainerSchema` accepts payloads with or without `ackSeq` — a client on the old protocol that omits `ackSeq` receives no TypeScript or Zod error
  4. The relay reads `RELAY_BUFFER_CAP` and `RELAY_BUFFER_TTL_MS` from environment at startup and falls back to safe defaults (500 / 120000) when the variables are absent or non-numeric
  5. `ackDebounceMs` (500ms) is documented in `PROTOCOL_CHANGES.md` as the authoritative mobile client constant, preventing each side from choosing a different value independently
**Plans**: 3 plans

Plans:
- [x] 06-01-PLAN.md — TDD: socketResilience.ts (event constants, request schemas, ACK_DEBOUNCE_MS) + UpdateContainerSchema ackSeq extension, with RED/GREEN test cycles
- [x] 06-02-PLAN.md — Wire socketResilience.ts into index.ts public API and append v1.3 resilience section to docs/protocol.md
- [x] 06-03-PLAN.md — Add RELAY_BUFFER_CAP and RELAY_BUFFER_TTL_MS env-var resolvers to server config/backends.ts with safe fallbacks (500 / 120000)

---

### Phase 7: Server Storage Layer
**Goal**: The relay can store, cap, expire, discard, and signal overflow for unacked outbound messages — all verifiable by unit tests before any socket handler touches them
**Depends on**: Phase 6
**Requirements**: STORE-01, STORE-02, STORE-03, STORE-04, STORE-05, STORE-06, STORE-07
**Success Criteria** (what must be TRUE):
  1. A unit test can write N messages to the buffer for a `(userId, connectionKey)` pair and read them back in insertion order after a simulated disconnect — messages are not lost
  2. When a unit test writes 501 messages, the buffer contains exactly 500 entries (oldest discarded) and the `RELAY_BUFFER_CAP` constant controls this limit with no code change required
  3. A unit test that advances the clock past `RELAY_BUFFER_TTL_MS` sees the buffer return zero entries, and the existing retention worker sweeps `UnackedMessage` rows using the same TTL constant — a single constant controls both
  4. A unit test that acks `seq` N sees all entries with `seq <= N` removed from the buffer; a subsequent read returns only entries with `seq > N`
  5. A unit test that fills the buffer past cap and then triggers the reconnect path receives a `buffer-overflow` signal, confirming the client can detect this condition and fall back to HTTP catch-up
  6. A developer inspecting the buffer confirms that entries keyed to CLI session sockets or CLI user sockets are never written — only mobile/web `connectionKey` types appear in the table
**Plans**: 3 plans

Plans:
- [x] 07-01-PLAN.md — Schema + RED tests: add UnackedMessage + ClientAckState to schema.prisma, run yarn generate, write all failing unit tests for STORE-01 through STORE-07
- [x] 07-02-PLAN.md — GREEN: implement unackedBuffer.ts (writeToBuffer, readBuffer, ackBuffer) to pass STORE-01, STORE-02, STORE-04, STORE-05, STORE-07 tests
- [x] 07-03-PLAN.md — GREEN: implement unackedMessageRetentionRule.ts + register in retentionRuleRegistry.ts to pass STORE-03, STORE-06 tests

---

### Phase 8: Server Socket Integration
**Goal**: A Socket.IO client that disconnects and reconnects receives all buffered messages in order, the emit path is never blocked by the buffer write, and the existing startup catch-up test still passes unchanged
**Depends on**: Phase 7
**Requirements**: SRVR-01, SRVR-02, SRVR-03, SRVR-04, SRVR-05, SRVR-06, SRVR-07, SRVR-08, SRVR-09, SRVR-10
**Success Criteria** (what must be TRUE):
  1. An integration test in SQLite mode confirms: client connects → receives update → disconnects → reconnects → receives the same update replayed in order before any new updates arrive
  2. An integration test in Postgres/Redis mode confirms the same replay behavior as the SQLite test — both storage backends are validated
  3. An integration test confirms: client acks a message → disconnects → reconnects → replay is empty (no redundant re-delivery)
  4. A developer adding a `setTimeout(0)` delay to the buffer write observes no change in the emit path latency — the buffer write is fire-and-forget and logged on failure, never thrown
  5. After a reconnect, the relay sends a `replay-complete` event in all three cases: after the last buffered message, after `buffer-overflow`, and when the buffer is empty — client code can treat this as the universal gate-release with no special casing per path
  6. The relay's response to `reconnect-resume` includes `retentionStart` (the oldest seq still in the buffer) before replaying, so a client can detect a non-contiguous buffer and proactively fall back
  7. The existing `sessionClient.startupCatchUpRetry.test.ts` suite passes without modification — the startup catch-up cursor is not mutated by the resilience layer
  8. Re-emitting an `ack-update` for a seq already removed from the buffer produces no error and no duplicate discard attempt — the server is idempotent on acks
**Plans**: 2 plans

Plans:
- [x] 08-01-PLAN.md — TDD RED: write all failing integration tests for SRVR-01 through SRVR-10 in resilienceHandler.integration.spec.ts
- [x] 08-02-PLAN.md — TDD GREEN: implement resilienceHandler.ts, wire emitUpdate() buffer write, register in socket.ts, confirm SRVR-07 regression gate

---

### Phase 9: Mobile Reconnect and Deduplication
**Goal**: The mobile/web client survives a socket drop and reconnect without missing messages, applying duplicates, or interleaving its own commits with the replay stream
**Depends on**: Phase 8
**Requirements**: MOB-01, MOB-02, MOB-03, MOB-04, MOB-05, MOB-06, MOB-07, MOB-08, MOB-09, MOB-10
**Success Criteria** (what must be TRUE):
  1. After a socket reconnect, the mobile client emits `reconnect-resume` carrying the highest `seq` it has confirmed — a developer inspecting socket traffic sees this event before any new session updates arrive
  2. A message replayed by the server with a `seq` the client has already applied is silently dropped and never written to the Zustand store a second time — the session state remains identical to a clean-connect scenario
  3. After force-quitting and relaunching the app, the client resumes `reconnect-resume` with the same `lastAckedSeq` it had before termination — MMKV persistence survives process death
  4. When the app transitions to background, pending acks are flushed synchronously before the socket is killed by iOS — a developer running Charles Proxy sees the `ack-update` event leave the device while the app is backgrounding
  5. When the app returns to foreground, the socket reconnects regardless of its previous `socket.connected` state — a zombie connection is never trusted
  6. New outbound commits from the Zustand pending queue are held until `replay-complete` arrives; optimistic store updates continue to appear immediately — the UI does not freeze during replay
  7. When the server signals `buffer-overflow`, the client immediately triggers `resumeViaChanges` and skips socket replay for that reconnect cycle — the gap is closed via the HTTP catch-up path, not retried via socket
  8. When `retentionStart` from the server exceeds `lastAckedSeq + 1`, the client proactively triggers `resumeViaChanges` without waiting for a gap event — it detects the non-contiguous buffer and acts before any messages are applied
  9. If both `buffer-overflow` and gap detection fire in the same reconnect cycle, exactly one `resumeViaChanges` call completes — the second trigger is a no-op until the first finishes
**Plans**: 3 plans

Plans:
- [ ] 09-01-PLAN.md — TDD RED: write all failing tests for MOB-01 through MOB-10 in engine/resilience/*.spec.ts with stubs
- [ ] 09-02-PLAN.md — TDD GREEN core: implement dedupFilter.ts, ackCursorManager.ts, replayGate.ts and extend persistence.ts with loadLastAckedSeq/saveLastAckedSeq
- [ ] 09-03-PLAN.md — TDD GREEN integration: wire resilience module into apiSocket.ts, sync.ts, and pendingQueueV2.ts; full suite GREEN

---

### Phase 10: E2E Validation and Hardening
**Goal**: The full resilience loop is proven correct under realistic conditions: an E2E test, load test, observability counters, and manual device QA all confirm the feature works as specified
**Depends on**: Phase 9
**Requirements**: VALID-01, VALID-02, VALID-03, VALID-04
**Success Criteria** (what must be TRUE):
  1. An automated E2E test passes: CLI sends a sequence of messages → mobile socket drops mid-stream → mobile reconnects → all messages are present in the Zustand store exactly once, with no duplicates and no gaps
  2. A developer running `curl /metrics` on the relay sees four new counters — `buffer_writes_total`, `buffer_acks_total`, `buffer_redeliveries_total`, `dedup_drops_total` — all incrementing correctly during a simulated reconnect
  3. A load test that saturates the buffer under high-frequency transcript streaming completes without SQLite write errors, WAL timeouts, or OOM conditions — the load test report is committed alongside the test
  4. A developer can follow the documented Android Doze QA checklist on a physical device, execute each step, and record pass/fail results — the checklist is in version control and covers foreground, background, and Doze transitions
**Plans**: TBD

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Schema & Reader | v1.0 | 1/1 | Complete | 2026-04-19 |
| 2. Startup Wiring & Tool Filtering | v1.0 | 3/3 | Complete | 2026-04-19 |
| 3. Validation Feedback | v1.0 | 1/1 | Complete | 2026-04-19 |
| 4. Restructure finalizeCurrentTurn() | v1.1 | 2/2 | Complete | 2026-04-19 |
| 5. Verify End-to-End Behavior | v1.1 | 1/1 | Complete | 2026-04-20 |
| 6. Protocol Contract | v1.3 | 0/3 | Not started | - |
| 7. Server Storage Layer | v1.3 | 0/3 | Not started | - |
| 8. Server Socket Integration | v1.3 | 0/2 | Not started | - |
| 9. Mobile Reconnect and Deduplication | v1.3 | 0/? | Not started | - |
| 10. E2E Validation and Hardening | v1.3 | 0/? | Not started | - |
