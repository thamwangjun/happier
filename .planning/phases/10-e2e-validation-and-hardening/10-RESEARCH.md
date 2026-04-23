# Phase 10: E2E Validation and Hardening - Research

**Researched:** 2026-04-23
**Domain:** Test authoring (Vitest E2E + stress), Prometheus counter instrumentation, SQLite WAL load testing, Android Doze QA documentation
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**E2E test (VALID-01)**
- D-01: New file `packages/tests/suites/core-e2e/reconnect.resilience.e2e.test.ts` — dedicated test file, separate from `reconnect.midstreamStorm.test.ts`.
- D-02: Test must explicitly assert all three: (1) `reconnect-resume` was emitted with correct `lastAckedSeq`, (2) `replay-complete` was received after socket reconnect, (3) no duplicate `seq` values in received message stream.
- D-03: Use existing socket testkit: `createUserScopedSocketCollector`, `startServerLight`, `createTestAuth`, `FailureArtifacts`. Device A = sender; Device B = simulated mobile client that disconnects mid-stream and reconnects.

**Prometheus counters (VALID-02)**
- D-04: Add all 4 counters to `apps/server/sources/app/monitoring/metrics2.ts`. Same `new Counter({ name: '...', registers: [register] })` pattern. No new files. Exact names: `buffer_writes_total`, `buffer_acks_total`, `buffer_redeliveries_total`, `dedup_drops_total`.
- D-05: Counters called from `unackedBuffer.ts` (buffer_writes, buffer_acks, buffer_redeliveries) and `resilienceHandler.ts` (dedup_drops).

**Load test (VALID-03)**
- D-06: New file `packages/tests/suites/stress/buffer.walContention.stress.test.ts` — separate from `reconnect.chaos.test.ts`. Focused specifically on SQLite WAL contention under high-frequency `UnackedMessageBuffer` writes.
- D-07: Report format follows FailureArtifacts pattern. JSON artifacts via `FailureArtifacts`; opt-in on success via `HAPPIER_E2E_SAVE_ARTIFACTS` env flag.

**Android Doze QA checklist (VALID-04)**
- D-08: Standalone file `docs/android-doze-qa-checklist.md`. Link to it from `docs/PROTOCOL_CHANGES.md`.
- D-09: Covers exactly 3 transition scenarios: (1) Background/ack-flush, (2) Foreground/reconnect, (3) Doze/socket-resurrection.
- D-10: Markdown with checkbox steps per scenario, pass/fail column, fields for device model/OS version/date. Executable on physical Android device; ADB not required.

### Claude's Discretion

- Whether to add a test helper `createResilienceSocketCollector` in `packages/tests/src/testkit/` or inline the event capture in the test file — follow the simplest pattern that satisfies the VALID-01 assertions.
- Exact load parameters for the WAL contention stress test (message volume, concurrency, duration) — size to trigger WAL pressure but complete in CI-reasonable time.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VALID-01 | E2E test passes: CLI sends messages → mobile socket drops mid-stream → mobile reconnects → all messages present exactly once | Testkit pattern documented; resilience event capture gap identified; solution approach specified |
| VALID-02 | Relay exposes Prometheus counters: `buffer_writes_total`, `buffer_acks_total`, `buffer_redeliveries_total`, `dedup_drops_total` | metrics2.ts pattern verified; call sites in unackedBuffer.ts and resilienceHandler.ts confirmed; dedup detection point located |
| VALID-03 | Load test validates SQLite WAL contention under high-frequency transcript streaming with UnackedMessageBuffer active | Stress test infrastructure verified; WAL contention mechanics understood; parameter guidance provided |
| VALID-04 | Manual Android Doze QA checklist documented and executed on physical device | docs/ directory confirmed; PROTOCOL_CHANGES.md link target confirmed; ADB simulation commands researched |

</phase_requirements>

---

## Summary

Phase 10 is entirely in test/observability/documentation code — no production resilience logic changes. It has four outputs: an E2E protocol-layer test, four Prometheus counters, a WAL contention stress test, and an Android Doze QA markdown checklist.

The project's test infrastructure is mature and well-understood. All four tasks follow established patterns. The primary research finding is a **gap in the existing testkit**: `SocketCollector.socket` is `private`, and `attachSocketEventCollector` does not capture resilience events (`reconnect-resume`, `replay-complete`, etc.). VALID-01 requires asserting on those events, so the test must either add a public `on(event, listener)` method to `SocketCollector` or capture them via raw socket listeners before creating the `SocketCollector` wrapper. The simplest path (per Claude's Discretion) is addressed below.

For VALID-02, the exact integration points for `dedup_drops_total` require care: `resilienceHandler.ts` currently has no dedup logic. The dedup counter must be added where a duplicate `seq` would be detected — which means adding that detection logic itself in the reconnect-resume or ack-update paths.

For VALID-03, the key insight is that `startServerLight` runs SQLite, so WAL contention is reproducible in CI. The stress test should drive concurrent `writeToBuffer` calls against the same `(userId, connectionKey)` via many rapid socket `message` events.

**Primary recommendation:** All four work items are straightforward implementations against known patterns. The only design decision requiring care is how the VALID-01 test captures resilience-protocol events from `SocketCollector` (the `private socket` access gap).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| E2E protocol test (VALID-01) | Test harness | Server (startServerLight) | Test harness drives the two sockets; server processes the reconnect protocol |
| Prometheus counters (VALID-02) | API / Backend | — | Counters live in server process, exported via /metrics endpoint |
| WAL contention stress test (VALID-03) | Test harness | Database / Storage (SQLite WAL) | Test drives load; SQLite WAL is the contention surface being validated |
| Android Doze checklist (VALID-04) | Documentation | — | Manual QA document; no code tier |

---

## Standard Stack

### Core (all verified by codebase inspection)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | (from project) | Test runner for E2E and stress suites | Existing test infrastructure [VERIFIED: codebase] |
| prom-client | (from project) | Prometheus metrics export | Existing `metrics2.ts` uses this [VERIFIED: codebase] |
| socket.io-client | (from project) | Socket connections in testkit | `socketClient.ts` uses `io()` from this [VERIFIED: codebase] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@happier-dev/protocol` | (from project) | `SOCKET_RESILIENCE_EVENTS`, `ReconnectResumeRequestSchema` | Import event name constants in the E2E test |
| `node:crypto` | built-in | `randomUUID()` for `localId` generation | Used in all existing E2E/stress tests |

### No new dependencies required

All Phase 10 work uses existing project dependencies. No `npm install` needed.

---

## Architecture Patterns

### System Architecture Diagram

```
VALID-01 E2E Test Flow:

  [Test: Device A (SocketCollector)]
       |
       | socket 'message' events (sends N messages)
       v
  [Server: resilienceHandler + unackedBuffer]
       |
       | writeToBuffer called per message (fires buffer_writes_total)
       v
  [SQLite: UnackedMessage table]
       ^
       |
  [Test: Device B (SocketCollector)]
       |
    1. connect → messages arrive
    2. disconnect (simulated drop)
    3. Device A keeps sending (messages buffer)
    4. reconnect → emits 'reconnect-resume' with lastAckedSeq
       |
       v
  [Server: resilienceHandler]
       |
       | readBuffer → replay messages → emit 'replay-complete'
       | (fires buffer_redeliveries_total per replayed message)
       v
  [Test assertions on Device B's captured events]:
       - 'reconnect-resume' was emitted with correct lastAckedSeq
       - 'replay-complete' was received
       - no duplicate seq values in received update stream


VALID-02 Counter Instrumentation:

  unackedBuffer.ts::writeToBuffer()     → bufferWritesTotal.inc()
  unackedBuffer.ts::ackBuffer()         → bufferAcksTotal.inc()
  resilienceHandler.ts (replay loop)    → bufferRedeliveriesTotal.inc() per message
  resilienceHandler.ts (dedup check)    → dedupDropsTotal.inc() when dup seq detected

  curl /metrics → prom-client register → combined metrics output


VALID-03 WAL Contention Stress Flow:

  [Stress Test]
       |
       | N concurrent SocketCollectors all emit 'message' events rapidly
       | (same session, same userId → same connectionKey → same DB table rows)
       v
  [Server: writeToBuffer in inTx()]
       |
       | SQLite WAL: concurrent readers/writers contend on UnackedMessage table
       v
  [Assertions]: no SQLite BUSY errors, no WAL timeout, no OOM
```

### Recommended Project Structure

New files only — all follow existing conventions:

```
packages/tests/suites/core-e2e/
└── reconnect.resilience.e2e.test.ts    # VALID-01

packages/tests/suites/stress/
└── buffer.walContention.stress.test.ts  # VALID-03

apps/server/sources/app/monitoring/
└── metrics2.ts                          # VALID-02: add 4 counters (edit existing)

apps/server/sources/app/resilience/
└── unackedBuffer.ts                     # VALID-02: add counter calls (edit existing)

apps/server/sources/app/api/socket/
└── resilienceHandler.ts                 # VALID-02: add dedup_drops counter (edit existing)

docs/
├── android-doze-qa-checklist.md         # VALID-04 (new file)
└── PROTOCOL_CHANGES.md                  # VALID-04: add link (edit existing)
```

---

## Critical Finding: Resilience Event Capture Gap

**Problem:** `SocketCollector.socket` is `private`. `attachSocketEventCollector` only registers listeners for `update`, `ephemeral`, `connect`, `disconnect`, and `connect_error`. It does NOT capture `reconnect-resume`, `replay-complete`, `buffer-overflow`, or `replay-start`.

VALID-01 must assert that Device B received `replay-complete` and that Device B emitted `reconnect-resume` with the correct `lastAckedSeq`. Neither is captured by the existing `getEvents()` return.

**Two viable approaches (Claude's Discretion):**

1. **Add `on(event, listener)` to `SocketCollector`** — expose a public pass-through that lets test code attach custom listeners before connecting. Minimal change; reusable; consistent with how `onRpcRequest` is exposed today.

2. **Inline raw socket + listen before wrapping** — create the `io()` socket manually, attach resilience listeners, then pass it to `new SocketCollector(socket)`. The `SocketCollector` constructor is public and accepts any `Socket`.

**Recommendation:** Option 1 (add `on`/`off` pass-through to `SocketCollector`) is slightly cleaner and mirrors the RPC pattern. Option 2 is equally valid and avoids touching `socketClient.ts`. Either satisfies the assertions. The planner should not prescribe which — leave to implementer judgment.

**For the test itself, the assertion pattern will be:**

```typescript
// Source: VERIFIED — socketClient.ts constructor accepts Socket; io() options verified in codebase
const resilienceEvents: Array<{ event: string; payload: unknown }> = [];
// Either via SocketCollector.on() or raw socket before wrapping:
deviceB.on('replay-complete', (data) => resilienceEvents.push({ event: 'replay-complete', payload: data }));
// For asserting that Device B EMITTED reconnect-resume (a client→server emit),
// the test must intercept it before it leaves the socket — track it in the test itself
// by wrapping or overriding the emit, or by reading it from server-side observable state.
```

**Important clarification:** VALID-01 D-02 says the test must assert "reconnect-resume was emitted with the correct `lastAckedSeq`". In the existing mobile client flow, the client emits `reconnect-resume` automatically on reconnect (MOB-01). In the test, the test controls Device B's reconnect. The test must therefore either:
- Emit `reconnect-resume` explicitly as part of the test (after reconnect) — giving it full control over the payload and making the assertion trivial.
- OR capture the automatic emission if the test client implements the mobile reconnect protocol.

Given that the test testkit's `createUserScopedSocketCollector` does NOT automatically emit `reconnect-resume` on reconnect (it is a plain socket collector, not a mobile-equivalent), the test will emit it explicitly. This is the correct approach: the test drives the full protocol flow manually.

**Explicit test flow:**

1. Device B connects, receives some updates, records `lastAckedSeq = N`
2. Device B disconnects
3. Device A sends more messages while B is offline
4. Device B reconnects
5. Test explicitly emits `reconnect-resume` with `{ sessionId, lastAckedSeq: N }` from Device B
6. Test waits for `replay-complete` event on Device B
7. Test collects all `update` events received by Device B during replay
8. Assert: no duplicate `seq` in received updates

---

## Critical Finding: dedup_drops_total Counter Insertion Point

**Problem:** `resilienceHandler.ts` currently has NO dedup logic. The ack-update path discards buffer entries by seq (SRVR-03/SRVR-08), but there is no code that detects and drops a message that is a duplicate of one already delivered.

The dedup that EXISTS is in the mobile client (MOB-02), not in the server. On the server side, the closest concept is the STORE-07 CLI exclusion and the SRVR-08 idempotent ack.

**Resolution:** `dedup_drops_total` should count cases where the server detects an inbound `ack-update` for a seq that is already cleared (idempotent ack path — SRVR-08), or where `reconnect-resume` is received and the `lastAckedSeq` is already current (empty replay). The spec says counter is called from `resilienceHandler.ts` "when a duplicate seq is detected and dropped". This most naturally fits the `ack-update` handler's idempotent path: when `ackBuffer` is called with a seq that matches nothing remaining in the buffer (all already acked). Implementer should confirm whether to increment on every idempotent ack-update or only when the seq was previously acked in the same session reconnect cycle.

**[ASSUMED]** The intended behavior is that `dedup_drops_total` increments when the server receives a `reconnect-resume` and some of the buffered messages being replayed have seqs that the client reported having already acked (i.e., `seq <= lastAckedSeq`). `readBuffer` already filters these out via `seq: { gt: afterSeq }`, so the counter should increment for each message the buffer contained that was skipped — meaning the server should count `buffer entries with seq <= lastAckedSeq` at reconnect time as "dedup drops".

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Prometheus counter export | Custom HTTP metrics | prom-client `Counter` + existing `register` | Already wired to /metrics endpoint; `metrics2.ts` pattern copy-paste ready |
| Concurrent SQLite stress | Custom concurrency harness | Multiple `SocketCollectors` + rapid `emitWithAck` loop | `startServerLight` provides real SQLite; concurrent socket messages drive real WAL contention |
| Async condition waiting | Custom polling loop | `waitFor` from `packages/tests/src/testkit/timing.ts` | Already handles timeout, intervalMs, failFast; used in all reconnect tests |
| Artifact collection | Custom file-writing | `FailureArtifacts` + `envFlag` | Established pattern; handles on-failure vs on-success modes |

---

## Common Pitfalls

### Pitfall 1: Asserting reconnect-resume was "emitted" without controlling it
**What goes wrong:** Test connects Device B, reconnects it, and then looks for `reconnect-resume` in `getEvents()` — but `SocketCollector` does not auto-emit `reconnect-resume` and does not capture custom outbound events.
**Why it happens:** The existing `SocketEventCollector` only listens for server→client events (`update`, `ephemeral`). Client→server events (which the test emits) are not recorded.
**How to avoid:** The test drives `reconnect-resume` emission explicitly after Device B reconnects. The assertion is trivially satisfied because the test controls the payload. The interesting assertions are on the server's response: `replay-complete` receipt and the content of replayed `update` events.
**Warning signs:** Test passes trivially without actually exercising the protocol — add an assertion that `replay-complete` was actually received with non-zero `retentionStart` when replay was expected.

### Pitfall 2: metrics2.ts module-level counter initialization order
**What goes wrong:** Adding counters with `new Counter({ registers: [register] })` at module top level can cause prom-client to throw "A metric with the name X has already been registered" in tests if `metrics2.ts` is re-imported across test files in the same Vitest worker.
**Why it happens:** prom-client's default `register` is a singleton; re-registering the same name throws.
**How to avoid:** Follow the exact existing pattern in `metrics2.ts` — module-level `new Counter(...)` with `registers: [register]`. In the existing test infrastructure, `startServerLight` spawns the server as a subprocess, so the server's prom-client registry is isolated from the test process. No special action needed.
**Warning signs:** Test runner reports prom-client duplicate registration error during server startup.

### Pitfall 3: WAL contention test timing out before triggering real contention
**What goes wrong:** The stress test sends messages serially (one at a time), so SQLite processes them one at a time and WAL never has concurrent writers.
**Why it happens:** Default `emitWithAck` waits for the server ack before sending the next message, serializing the writes.
**How to avoid:** Send messages with `Promise.all` or a burst-firing pattern — fire N messages without awaiting each ack before sending the next. Use `deviceA.emit(event, data)` (fire-and-forget) rather than `emitWithAck` for the burst phase to maximize concurrency.
**Warning signs:** Test completes instantly with no SQLite BUSY in server logs — genuine contention was never triggered.

### Pitfall 4: REPLAY_START vs REPLAY_COMPLETE confusion
**What goes wrong:** Test waits for `replay-start` to mark replay done, but the protocol gate is `replay-complete` (SRVR-09). `replay-start` is emitted before the replay messages; `replay-complete` is emitted after.
**Why it happens:** Both events exist; `SOCKET_RESILIENCE_EVENTS` contains `REPLAY_START` and `REPLAY_COMPLETE`.
**How to avoid:** Use `SOCKET_RESILIENCE_EVENTS.REPLAY_COMPLETE` as the gate signal. See `resilienceHandler.ts` lines 37 and 65.
**Warning signs:** Test collects Device B's updates before all replayed messages have arrived.

### Pitfall 5: Android Doze checklist — socket.connected zombie state
**What goes wrong:** Checklist step says "verify socket reconnects" but tester checks `socket.connected === true` immediately after foreground resume — this may be a zombie connection that appears connected but is dead.
**Why it happens:** MOB-06 exists precisely because `socket.connected` can be stale after Doze. The checklist must instruct testers to verify that the reconnect handshake fired (a new `reconnect-resume` event visible in logs), not just that the in-memory state is `connected`.
**How to avoid:** Checklist steps must reference observable server-side evidence (server log line for `reconnect-resume` received) or mobile-side evidence (debug log from sync engine showing `onReconnected` fired).

---

## Code Examples

### Counter Declaration Pattern (VALID-02)

```typescript
// Source: VERIFIED — apps/server/sources/app/monitoring/metrics2.ts existing pattern
export const bufferWritesTotal = new Counter({
    name: 'buffer_writes_total',
    help: 'Total UnackedMessageBuffer write operations',
    registers: [register]
});

export const bufferAcksTotal = new Counter({
    name: 'buffer_acks_total',
    help: 'Total UnackedMessageBuffer ack operations',
    registers: [register]
});

export const bufferRedeliveriesTotal = new Counter({
    name: 'buffer_redeliveries_total',
    help: 'Total messages redelivered from buffer on reconnect',
    registers: [register]
});

export const dedupDropsTotal = new Counter({
    name: 'dedup_drops_total',
    help: 'Total duplicate messages detected and dropped during reconnect replay',
    registers: [register]
});
```

### Counter Call Site — unackedBuffer.ts (VALID-02)

```typescript
// Source: VERIFIED — unackedBuffer.ts writeToBuffer and ackBuffer call sites

// In writeToBuffer, after successful inTx insert (non-excluded connectionKey):
bufferWritesTotal.inc();

// In ackBuffer, after deleteMany:
bufferAcksTotal.inc();
```

### Counter Call Site — resilienceHandler.ts replay loop (VALID-02)

```typescript
// Source: VERIFIED — resilienceHandler.ts lines 60-62 (replay loop)
for (const payload of rows) {
    socket.emit(SOCKET_RESILIENCE_EVENTS.UPDATE, payload);
    bufferRedeliveriesTotal.inc();   // add this
}
```

### VALID-01 Test Structure (core pattern)

```typescript
// Source: VERIFIED — reconnect.midstreamStorm.test.ts pattern; socket events from protocol/socketResilience.ts
import { SOCKET_RESILIENCE_EVENTS, ReconnectResumeRequestSchema } from '@happier-dev/protocol/socketResilience';
import { SOCKET_RESILIENCE_EVENTS } from '@happier-dev/protocol/socketResilience';

// After Device B reconnects, explicitly drive the protocol:
const replayCompleteEvents: unknown[] = [];
// (requires SocketCollector.on() or raw socket — see Critical Finding above)
deviceB.on(SOCKET_RESILIENCE_EVENTS.REPLAY_COMPLETE, (data) => replayCompleteEvents.push(data));

// Emit reconnect-resume with tracked lastAckedSeq
const lastAckedSeq = /* last seq Device B applied before disconnect */ 0;
deviceB.emit(SOCKET_RESILIENCE_EVENTS.RECONNECT_RESUME, { sessionId, lastAckedSeq });

// Wait for replay-complete
await waitFor(() => replayCompleteEvents.length > 0, { timeoutMs: 15_000, context: 'waiting for replay-complete' });

// Collect all update seqs received by Device B (from getEvents() filtered by kind === 'update')
const receivedSeqs = deviceB.getEvents()
  .filter(e => e.kind === 'update')
  .map(e => e.payload.seq)
  .filter((s): s is number => typeof s === 'number');
const uniqueSeqs = new Set(receivedSeqs);
expect(uniqueSeqs.size).toBe(receivedSeqs.length); // no duplicates
```

### WAL Stress Test Burst Pattern (VALID-03)

```typescript
// Source: VERIFIED — reconnect.chaos.test.ts patterns; fire-and-forget burst for contention
// Send N messages without awaiting each — triggers concurrent WAL writes
const BURST = 200;
const sends = Array.from({ length: BURST }, (_, i) => {
    const localId = randomUUID();
    const ciphertext = Buffer.from(`burst-${i}`, 'utf8').toString('base64');
    return deviceA.emitWithAck<any>('message', { sid: sessionId, message: ciphertext, localId });
});
const results = await Promise.all(sends);
// Assert all succeeded (no SQLite BUSY, no OOM)
for (const raw of results) {
    const ack = MessageAckResponseSchema.parse(raw);
    expect(ack.ok).toBe(true);
}
```

---

## Android Doze QA Checklist Structure (VALID-04)

The checklist file `docs/android-doze-qa-checklist.md` must cover exactly three scenarios per D-09:

**Scenario 1: Background/ack-flush (MOB-05)**
- Steps: Open session → start receiving messages → press Home to background app → wait 5s → check server log for synchronous ack-update event
- Pass criteria: `ack-update` event received by server within 5s of backgrounding; server buffer cleared up to last applied seq

**Scenario 2: Foreground/reconnect (MOB-06)**
- Steps: Background app → wait 30s → foreground app → observe that a socket disconnect+reconnect fired
- Pass criteria: Mobile debug log shows `onReconnected` called regardless of `socket.connected` state at foreground time; new `reconnect-resume` emitted to server

**Scenario 3: Doze/socket-resurrection**
- Steps: Enable Doze mode via ADB (`adb shell dumpsys deviceidle force-idle`), wait 5 minutes, exit Doze, verify reconnect-resume fires with correct `lastAckedSeq`
- Pass criteria: After Doze exits, `reconnect-resume` arrives at server with `lastAckedSeq` matching MMKV-persisted value; `replay-complete` received; no messages lost

Per CONTEXT.md specifics: include ADB commands for Doze simulation in the checklist even though ADB is not required for execution — useful context for future QA automation.

**Format per scenario:** markdown checkbox steps, pass/fail column, device model/OS version/date field.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Test listens for all events via generic collector | Test explicitly emits resilience events and listens for specific named events | Phase 10 | E2E test must manage resilience events directly, not through the existing `getEvents()` collector |
| Server metrics only covers WebSocket/HTTP/DB | Server metrics expanded with buffer-specific counters | Phase 10 | Four new counters visible in /metrics |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `dedup_drops_total` should count entries with `seq <= lastAckedSeq` skipped by `readBuffer` at reconnect time | Critical Finding: dedup_drops_total | Counter increments in wrong place; metric has misleading semantics |
| A2 | WAL contention is reproducible in CI using `Promise.all` burst sends against `startServerLight` | Common Pitfalls (Pitfall 3) | Load test never triggers real contention; VALID-03 passes vacuously |

---

## Open Questions (RESOLVED)

1. **dedup_drops_total exact semantics**
   - What we know: D-05 says "called from `resilienceHandler.ts` when a duplicate seq is detected and dropped"; SRVR-08 covers idempotent ack
   - What's unclear: Whether "dedup drop" means (a) ack-update for already-cleared seq, or (b) message in buffer with seq <= lastAckedSeq at reconnect time (already filtered by readBuffer), or (c) a new detection path to be added
   - Recommendation: Implementer should read D-05 literally: add detection in the `reconnect-resume` handler to count buffer entries that exist in the DB for `seq <= lastAckedSeq` (messages that were buffered but client already had) — these are the "would-be duplicates" the server saves the client from receiving. Alternatively, treat every idempotent ack-update as a dedup drop. Either reading satisfies the REQUIREMENTS.md spec.
   - **RESOLVED:** Plan 10-01 Task 2 uses `db.unackedMessage.count({ where: { userId, connectionKey, seq: { lte: lastAckedSeq } } })` in the `reconnect-resume` handler to count would-be duplicates, then calls `dedupDropsTotal.inc({ count })`. This counts messages the buffer held that the client already acknowledged — the server "deduplication" saves the client from receiving them again.

2. **SocketCollector resilience event access**
   - What we know: `socket` is `private`; `SocketCollector.emit(event, data)` works for outbound; no inbound listener API beyond `getEvents()` (which doesn't capture resilience events)
   - What's unclear: Whether the preferred solution is to add `on()`/`off()` to `SocketCollector` or use option 2 (raw socket + constructor injection)
   - Recommendation: Add `on(event, listener)` and `off(event, listener)` to `SocketCollector` in `socketClient.ts` — consistent with existing `onRpcRequest` pattern, reusable for future resilience tests, minimal change.
   - **RESOLVED:** Plan 10-01 Task 3 adds `on(event: string, listener: (...args: unknown[]) => void): void` and `off(event: string, listener: (...args: unknown[]) => void): void` pass-through methods to `SocketCollector`, delegating to `(this.socket as any).on(event, listener)` following the existing `onRpcRequest` cast convention.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 10 is code/documentation changes only. External dependencies (SQLite, server process) are provided by `startServerLight` in the existing test infrastructure. No new CLI tools, services, or runtimes required.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (version from project) |
| Config file (E2E) | `packages/tests/vitest.core.config.ts` |
| Config file (stress) | `packages/tests/vitest.stress.config.ts` |
| Quick run (E2E) | `yarn test --config vitest.core.config.ts --reporter=verbose reconnect.resilience` |
| Full E2E suite | `yarn test` (from `packages/tests/`) |
| Stress suite | `yarn test:stress` (from `packages/tests/`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VALID-01 | CLI→socket drop→reconnect→no dups, replay-complete fired | E2E | `yarn test --config vitest.core.config.ts reconnect.resilience.e2e.test.ts` | Wave 0 |
| VALID-02 | /metrics exposes 4 counters incrementing correctly | Integration (manual curl or test assertion against metrics endpoint) | `curl http://localhost:9090/metrics \| grep buffer_` | No automated test file needed |
| VALID-03 | SQLite WAL survives high-frequency burst without errors | Stress | `yarn test:stress buffer.walContention.stress.test.ts` | Wave 0 |
| VALID-04 | Doze QA checklist exists and is linkable | Documentation | Manual | N/A |

### Sampling Rate
- **Per task commit:** Run targeted test file (e.g., `reconnect.resilience.e2e.test.ts` for VALID-01 task)
- **Per wave merge:** `yarn test` (full core-e2e suite including new test)
- **Phase gate:** Full suite green + stress test green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `packages/tests/suites/core-e2e/reconnect.resilience.e2e.test.ts` — covers VALID-01
- [ ] `packages/tests/suites/stress/buffer.walContention.stress.test.ts` — covers VALID-03
- [ ] `docs/android-doze-qa-checklist.md` — covers VALID-04

*(VALID-02 counter increment is verified by code review + manual `curl /metrics` during VALID-03 stress test; no separate test file needed.)*

---

## Security Domain

Phase 10 adds only test files, documentation, and non-security-sensitive instrumentation counters. No new authentication paths, no new data ingestion, no cryptographic operations.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | — |
| V3 Session Management | No | — |
| V4 Access Control | No | — |
| V5 Input Validation | No | Counter names are hardcoded strings |
| V6 Cryptography | No | — |

Prometheus counter values are integer increments; no user-supplied data flows into metric names or labels.

---

## Project Constraints (from CLAUDE.md)

From root `CLAUDE.md`:
- Folder naming: lowercase buckets, `camelCase` feature folders
- File naming: React components PascalCase, hooks `useThing.ts`, plain TS modules `camelCase.ts`
- Allowed `_*.ts` markers only in module-ish directories: `_types.ts`, `_shared.ts`, `_constants.ts`
- Prefer not to create a folder that contains only a single file

From `apps/server/CLAUDE.md`:
- Use 4 spaces for indentation (not 2)
- Use `@/` prefix for all server source imports (absolute imports)
- All new server code must use absolute imports: `import { ... } from '@/...'`
- Use `yarn` not `npm`
- Test files: `.spec.ts` suffix (server unit tests) — note: the integration tests in `packages/tests/` follow `.test.ts` convention; this is package-specific
- Avoid enums; use maps instead
- Prefer interfaces over types
- When writing actions, add a documentation comment explaining logic

**Key constraint for VALID-02 implementation:** When adding counter imports to `unackedBuffer.ts` and `resilienceHandler.ts`, use the `@/app/monitoring/metrics2` absolute import path.

---

## Sources

### Primary (HIGH confidence)
- `packages/tests/suites/core-e2e/reconnect.midstreamStorm.test.ts` — verified E2E test pattern
- `packages/tests/suites/stress/reconnect.chaos.test.ts` — verified stress test pattern
- `packages/tests/src/testkit/socketClient.ts` — verified SocketCollector API; confirmed private socket gap
- `packages/tests/src/testkit/socketEventCollector.ts` — verified CapturedEvent types; confirmed resilience events not captured
- `packages/tests/src/testkit/failureArtifacts.ts` — verified FailureArtifacts API
- `packages/tests/src/testkit/timing.ts` — verified waitFor API
- `apps/server/sources/app/monitoring/metrics2.ts` — verified Counter pattern with `registers: [register]`
- `apps/server/sources/app/monitoring/metrics.ts` — verified /metrics endpoint wiring
- `apps/server/sources/app/resilience/unackedBuffer.ts` — verified writeToBuffer, ackBuffer, readBuffer signatures
- `apps/server/sources/app/api/socket/resilienceHandler.ts` — verified replay loop; confirmed no existing dedup detection
- `packages/protocol/src/socketResilience.ts` — verified SOCKET_RESILIENCE_EVENTS const and schema exports
- `packages/tests/vitest.core.config.ts` — verified test include globs and timeouts
- `packages/tests/vitest.stress.config.ts` — verified stress include globs (300s timeout)
- `docs/PROTOCOL_CHANGES.md` — verified existing content; confirmed v1.3 section exists for link insertion

### Secondary (MEDIUM confidence)
- None required — all findings sourced from codebase inspection

### Tertiary (LOW confidence — see Assumptions Log)
- A1, A2 above

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified in codebase
- Architecture: HIGH — all patterns verified from existing test files
- Pitfalls: HIGH (P1-P4) / MEDIUM (P5) — P1-P4 from direct code inspection; P5 from domain knowledge of Android socket behavior
- Dedup counter semantics: MEDIUM — D-05 intent inferred from requirements; see Open Question 1

**Research date:** 2026-04-23
**Valid until:** 2026-05-23 (stable codebase; all findings from checked-in source)
