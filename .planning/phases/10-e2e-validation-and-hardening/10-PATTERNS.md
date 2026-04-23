# Phase 10: E2E Validation and Hardening - Pattern Map

**Mapped:** 2026-04-23
**Files analyzed:** 7 (3 new, 4 modified)
**Analogs found:** 7 / 7

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `packages/tests/suites/core-e2e/reconnect.resilience.e2e.test.ts` | test | event-driven | `packages/tests/suites/core-e2e/reconnect.midstreamStorm.test.ts` | exact |
| `packages/tests/suites/stress/buffer.walContention.stress.test.ts` | test | batch / event-driven | `packages/tests/suites/stress/reconnect.chaos.test.ts` | exact |
| `apps/server/sources/app/monitoring/metrics2.ts` | config / observability | request-response | `apps/server/sources/app/monitoring/metrics2.ts` (self — add counters) | self-edit |
| `apps/server/sources/app/resilience/unackedBuffer.ts` | service | CRUD | `apps/server/sources/app/resilience/unackedBuffer.ts` (self — add counter calls) | self-edit |
| `apps/server/sources/app/api/socket/resilienceHandler.ts` | middleware / handler | event-driven | `apps/server/sources/app/api/socket/resilienceHandler.ts` (self — add counter + dedup) | self-edit |
| `packages/tests/src/testkit/socketClient.ts` | utility | event-driven | `packages/tests/src/testkit/socketClient.ts` (self — add `on`/`off`) | self-edit |
| `docs/android-doze-qa-checklist.md` | documentation | — | `docs/PROTOCOL_CHANGES.md` (markdown convention) | partial |

---

## Pattern Assignments

### `packages/tests/suites/core-e2e/reconnect.resilience.e2e.test.ts` (test, event-driven)

**Analog:** `packages/tests/suites/core-e2e/reconnect.midstreamStorm.test.ts`

**Imports pattern** (lines 1–14):
```typescript
import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { MessageAckResponseSchema } from '@happier-dev/protocol/updates';
import { SOCKET_RESILIENCE_EVENTS } from '@happier-dev/protocol/socketResilience';

import { createRunDirs } from '../../src/testkit/runDir';
import { startServerLight, type StartedServer } from '../../src/testkit/process/serverLight';
import { createTestAuth } from '../../src/testkit/auth';
import { createSession } from '../../src/testkit/sessions';
import { createUserScopedSocketCollector } from '../../src/testkit/socketClient';
import { FailureArtifacts } from '../../src/testkit/failureArtifacts';
import { envFlag } from '../../src/testkit/env';
import { waitFor } from '../../src/testkit/timing';
```

**Test scaffold pattern** (lines 16–44, midstreamStorm.test.ts):
```typescript
const run = createRunDirs({ runLabel: 'core' });

describe('core e2e: mid-stream message storm + reconnect convergence', () => {
  let server: StartedServer | null = null;

  afterAll(async () => {
    await server?.stop();
  });

  it('...', async () => {
    const testDir = run.testDir('midstream-storm-reconnect');
    const saveArtifactsOnSuccess = envFlag(['HAPPIER_E2E_SAVE_ARTIFACTS', 'HAPPY_E2E_SAVE_ARTIFACTS'], false);
    server = await startServerLight({ testDir });
    const auth = await createTestAuth(server.baseUrl);
    const { sessionId } = await createSession(server.baseUrl, auth.token);

    const deviceA = createUserScopedSocketCollector(server.baseUrl, auth.token);
    const deviceB = createUserScopedSocketCollector(server.baseUrl, auth.token);

    const artifacts = new FailureArtifacts();
    artifacts.json('deviceA.events.json', () => deviceA.getEvents());
    artifacts.json('deviceB.events.json', () => deviceB.getEvents());

    let passed = false;
    deviceA.connect();
    deviceB.connect();
    await waitFor(() => deviceA.isConnected() && deviceB.isConnected(), { timeoutMs: 20_000 });
```

**Disconnect/reconnect sequence pattern** (lines 79–90, midstreamStorm.test.ts):
```typescript
// Drop B mid-storm.
deviceB.disconnect();
await waitFor(() => !deviceB.isConnected(), { timeoutMs: 10_000 });

// Send while B is offline.
for (let i = 0; i < STORM; i++) {
  await sendFromA(`storm-${i}`);
}

deviceB.connect();
await waitFor(() => deviceB.isConnected(), { timeoutMs: 20_000 });
```

**Artifact dump + cleanup pattern** (lines 106–110, midstreamStorm.test.ts):
```typescript
  } finally {
    await artifacts.dumpAll(testDir, { onlyIf: saveArtifactsOnSuccess || !passed });
    deviceA.close();
    deviceB.close();
  }
```

**VALID-01-specific additions — resilience event capture and assertions** (from RESEARCH.md code examples):

Because `SocketCollector.socket` is private and `attachSocketEventCollector` does not register resilience events, Device B needs raw socket access. Two approaches (Claude's Discretion — leave to implementer):

Option A — add `on(event, listener)` pass-through to `SocketCollector` (see socketClient.ts section below).

Option B — inline: after `deviceB.connect()`, attach listeners via `deviceB.on(...)` if `on()` is added, or wrap manually.

The core assertion pattern regardless of approach:
```typescript
// Capture resilience events from Device B
const replayCompleteEvents: unknown[] = [];
// (via deviceB.on() if SocketCollector.on() is added)
deviceB.on(SOCKET_RESILIENCE_EVENTS.REPLAY_COMPLETE, (data: unknown) => {
  replayCompleteEvents.push(data);
});

// After Device B reconnects, explicitly drive reconnect-resume protocol
const lastAckedSeq = /* last seq from Device B's getEvents() before disconnect */ 0;
deviceB.emit(SOCKET_RESILIENCE_EVENTS.RECONNECT_RESUME, { sessionId, lastAckedSeq });

// Wait for replay-complete gate
await waitFor(() => replayCompleteEvents.length > 0, {
  timeoutMs: 15_000,
  context: 'waiting for replay-complete',
});

// Assert D-02 (3): no duplicate seq values
const receivedSeqs = deviceB.getEvents()
  .filter((e) => e.kind === 'update')
  .map((e) => e.payload.seq)
  .filter((s): s is number => typeof s === 'number');
const uniqueSeqs = new Set(receivedSeqs);
expect(uniqueSeqs.size).toBe(receivedSeqs.length);

// Assert D-02 (2): replay-complete was actually received with non-trivial retentionStart
expect(replayCompleteEvents.length).toBeGreaterThan(0);

// Assert D-02 (1): reconnect-resume was emitted with the tracked lastAckedSeq
// (trivially satisfied because the test controls the emit above — document with a comment)
```

---

### `packages/tests/suites/stress/buffer.walContention.stress.test.ts` (test, batch)

**Analog:** `packages/tests/suites/stress/reconnect.chaos.test.ts`

**Imports pattern** (lines 1–15, reconnect.chaos.test.ts):
```typescript
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { createRunDirs } from '../../src/testkit/runDir';
import { startServerLight, type StartedServer } from '../../src/testkit/process/serverLight';
import { createTestAuth } from '../../src/testkit/auth';
import { createSession } from '../../src/testkit/sessions';
import { createUserScopedSocketCollector } from '../../src/testkit/socketClient';
import { FailureArtifacts } from '../../src/testkit/failureArtifacts';
import { envFlag } from '../../src/testkit/env';
import { writeTestManifestForServer } from '../../src/testkit/manifestForServer';
import { MessageAckResponseSchema } from '@happier-dev/protocol/updates';
```

**beforeAll/afterAll server setup pattern** (lines 19–31, reconnect.chaos.test.ts):
```typescript
const run = createRunDirs({ runLabel: 'stress' });

describe('stress: ...', () => {
  let server: StartedServer;
  let token: string;

  beforeAll(async () => {
    const testDir = run.testDir('server');
    server = await startServerLight({ testDir });
    const auth = await createTestAuth(server.baseUrl);
    token = auth.token;
  });

  afterAll(async () => {
    await server.stop();
  });
```

**Burst fire-and-forget pattern for WAL contention** (from RESEARCH.md code examples):
```typescript
// Send N messages concurrently without awaiting each — triggers real SQLite WAL contention.
// Do NOT use serial await in a loop; that serializes writes and prevents contention.
const BURST = 200;
const sends = Array.from({ length: BURST }, (_, i) => {
  const localId = randomUUID();
  const ciphertext = Buffer.from(`burst-${i}`, 'utf8').toString('base64');
  return deviceA.emitWithAck<any>('message', { sid: sessionId, message: ciphertext, localId });
});
const results = await Promise.all(sends);
for (const raw of results) {
  const ack = MessageAckResponseSchema.parse(raw);
  expect(ack.ok).toBe(true);
}
```

**FailureArtifacts + saveArtifactsOnSuccess pattern** (lines 71–74, reconnect.chaos.test.ts):
```typescript
const artifacts = new FailureArtifacts();
artifacts.json(`attempt-${attempt}.deviceA.events.json`, () => deviceA.getEvents());
artifacts.json(`attempt-${attempt}.deviceB.events.json`, () => deviceB.getEvents());
// ...
await artifacts.dumpAll(testDir, { onlyIf: saveArtifactsOnSuccess || !passed });
```

---

### `apps/server/sources/app/monitoring/metrics2.ts` — add 4 counters (modify existing)

**Analog:** `apps/server/sources/app/monitoring/metrics2.ts` (existing counters, lines 15–67)

**Existing Counter declaration pattern** (lines 15–19):
```typescript
export const sessionAliveEventsCounter = new Counter({
    name: 'session_alive_events_total',
    help: 'Total number of session-alive events',
    registers: [register]
});
```

**Four new counters to append at module top level** (copy this pattern exactly):
```typescript
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

Note: indentation is 4 spaces (server CLAUDE.md convention). All four are module-level `new Counter(...)` with `registers: [register]` — identical to all other counters in this file. No initialization function needed because `startServerLight` spawns the server as a subprocess, isolating prom-client's registry from the test process.

---

### `apps/server/sources/app/resilience/unackedBuffer.ts` — add counter calls (modify existing)

**Analog:** `apps/server/sources/app/resilience/unackedBuffer.ts` (existing structure)

**Import to add** (after existing imports, line 7):
```typescript
import { bufferWritesTotal, bufferAcksTotal } from '@/app/monitoring/metrics2';
```

**Counter call in `writeToBuffer`** — add after `return { overflow }` is composed but before it is returned, i.e., after the `inTx` insert succeeds and the overflow/trim logic completes (around line 62):
```typescript
        // After overflow trim logic, before returning:
        bufferWritesTotal.inc();
        return { overflow };
```

The `bufferWritesTotal.inc()` should be inside the `inTx` callback, after the insert completes, so it only fires for non-excluded connectionKeys (the guard on line 28 already returns early for non-user-scoped).

**Counter call in `ackBuffer`** — add after `deleteMany` on line 94:
```typescript
    await db.unackedMessage.deleteMany({
        where: { userId, connectionKey, seq: { lte: ackedSeq } },
    });
    bufferAcksTotal.inc();
```

---

### `apps/server/sources/app/api/socket/resilienceHandler.ts` — add counter calls + dedup (modify existing)

**Analog:** `apps/server/sources/app/api/socket/resilienceHandler.ts` (existing handler)

**Import to add** (after existing imports, line 8):
```typescript
import { bufferRedeliveriesTotal, dedupDropsTotal } from '@/app/monitoring/metrics2';
```

**Counter call in replay loop** — modify lines 60–62:
```typescript
            for (const payload of rows) {
                socket.emit(SOCKET_RESILIENCE_EVENTS.UPDATE, payload);
                bufferRedeliveriesTotal.inc();
            }
```

**dedup_drops_total insertion point** — count buffer entries with `seq <= lastAckedSeq` that were skipped by `readBuffer`'s `{ gt: afterSeq }` filter. Add immediately after parsing `lastAckedSeq` (around line 28), before calling `readBuffer`:

```typescript
            const { lastAckedSeq } = parsed.data;
            const connectionKey = `user-scoped:${userId}`;

            // Count entries already acked (seq <= lastAckedSeq) — these are "dedup drops":
            // messages the buffer held that the client already has. readBuffer filters them
            // out via { gt: afterSeq }; we count them here for observability (VALID-02).
            const dupCount = await db.unackedMessage.count({
                where: { userId, connectionKey, seq: { lte: lastAckedSeq } },
            });
            if (dupCount > 0) {
                dedupDropsTotal.inc(dupCount);
            }

            const rows = await readBuffer(userId, connectionKey, lastAckedSeq);
```

Note: this requires adding `import { db } from '@/storage/db';` if not already imported. Check the existing imports at line 1 — `db` is not currently imported in `resilienceHandler.ts`; add it.

---

### `packages/tests/src/testkit/socketClient.ts` — add `on`/`off` pass-through (modify existing, if Claude's Discretion picks Option A)

**Analog:** `packages/tests/src/testkit/socketClient.ts` (existing `onRpcRequest` pattern, lines 45–59)

**Existing pass-through pattern for reference** (lines 45–59):
```typescript
  onRpcRequest(handler: (data: RpcRequestPayload) => string | Promise<string>): () => void {
    const listener = async (data: RpcRequestPayload, callback: (response: string) => void) => {
      try {
        const out = await handler(data);
        callback(out);
      } catch (e: unknown) { ... }
    };
    this.socket.on(SOCKET_RPC_EVENTS.REQUEST as any, listener as any);
    return () => {
      this.socket.off(SOCKET_RPC_EVENTS.REQUEST as any, listener as any);
    };
  }
```

**New `on`/`off` methods to add** (insert after `emit()` at line 100):
```typescript
  on(event: string, listener: (...args: unknown[]) => void): void {
    this.socket.on(event as any, listener as any);
  }

  off(event: string, listener: (...args: unknown[]) => void): void {
    this.socket.off(event as any, listener as any);
  }
```

These two methods mirror the socket.io-client API surface, use the same `as any` cast convention established in `onRpcRequest` and `rpcRegister`, and make resilience events available to tests without exposing the private `socket` field.

---

### `docs/android-doze-qa-checklist.md` (documentation, new file)

**Analog:** `docs/PROTOCOL_CHANGES.md` (markdown format and heading conventions)

The file is pure documentation — no code analog needed. Format per D-10: markdown, checkbox steps per scenario, pass/fail column, fields for device model/OS version/date.

Structure (from RESEARCH.md §Android Doze QA Checklist Structure):
- Three H2 scenario sections matching D-09 exactly
- Scenario 1: Background/ack-flush (MOB-05)
- Scenario 2: Foreground/reconnect (MOB-06)
- Scenario 3: Doze/socket-resurrection
- ADB simulation commands documented in each scenario (per CONTEXT.md specifics)
- Link back from `docs/PROTOCOL_CHANGES.md` v1.3 section

---

## Shared Patterns

### Server import convention
**Source:** `apps/server/sources/app/resilience/unackedBuffer.ts` (line 1–6) and `apps/server/sources/app/api/socket/resilienceHandler.ts` (lines 1–8)
**Apply to:** All server-side file modifications (metrics2.ts counter imports in unackedBuffer.ts and resilienceHandler.ts)
```typescript
// Always use @/ absolute imports — never relative paths
import { db } from '@/storage/db';
import { inTx } from '@/storage/inTx';
import { bufferWritesTotal, bufferAcksTotal } from '@/app/monitoring/metrics2';
```

### envFlag pattern for save-on-success
**Source:** `packages/tests/suites/core-e2e/reconnect.midstreamStorm.test.ts` (line 27)
**Apply to:** Both new test files (VALID-01 and VALID-03)
```typescript
const saveArtifactsOnSuccess = envFlag(['HAPPIER_E2E_SAVE_ARTIFACTS', 'HAPPY_E2E_SAVE_ARTIFACTS'], false);
```

### FailureArtifacts registration + dump pattern
**Source:** `packages/tests/suites/core-e2e/reconnect.midstreamStorm.test.ts` (lines 36–39, 107)
**Apply to:** Both new test files
```typescript
const artifacts = new FailureArtifacts();
artifacts.json('deviceA.events.json', () => deviceA.getEvents());
artifacts.json('deviceB.events.json', () => deviceB.getEvents());
// ...
await artifacts.dumpAll(testDir, { onlyIf: saveArtifactsOnSuccess || !passed });
```

### waitFor with context label
**Source:** `packages/tests/src/testkit/timing.ts` (waitFor signature)
**Apply to:** All async condition gates in both new test files
```typescript
await waitFor(() => <condition>, { timeoutMs: 15_000, context: 'waiting for replay-complete' });
```

### Socket collector close pattern
**Source:** `packages/tests/suites/core-e2e/reconnect.midstreamStorm.test.ts` (lines 108–109)
**Apply to:** Both new test files — always in `finally` block
```typescript
} finally {
  await artifacts.dumpAll(testDir, { onlyIf: saveArtifactsOnSuccess || !passed });
  deviceA.close();
  deviceB.close();
}
```

---

## No Analog Found

All files have analogs. No entries in this section.

---

## Metadata

**Analog search scope:** `packages/tests/suites/`, `packages/tests/src/testkit/`, `apps/server/sources/app/monitoring/`, `apps/server/sources/app/resilience/`, `apps/server/sources/app/api/socket/`, `packages/protocol/src/`, `docs/`
**Files scanned:** 11 primary sources (all verified by RESEARCH.md)
**Pattern extraction date:** 2026-04-23
