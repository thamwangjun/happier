# Phase 9: Mobile Reconnect and Deduplication - Research

**Researched:** 2026-04-22
**Domain:** React Native / Expo mobile client — socket resilience, MMKV persistence, Zustand state management
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** New `apps/ui/sources/sync/engine/resilience/` module — mirrors the server's `apps/server/sources/app/resilience/` pattern. Contains the dedup filter, ack cursor management, and replay gate helpers. Keeps `sync.ts` clean; `sync.ts` calls into this module. Registered/wired in `sync.ts` and `apiSocket.ts`.
- **D-02:** Boolean flag on the `Sync` class — `isReplaying: boolean`. Set to `true` when `reconnect-resume` is emitted, cleared to `false` when `replay-complete` is received. `pendingQueueV2` checks this flag before flushing server commits. Optimistic store updates are NOT gated and continue to apply immediately — only the outbound server commit flush is held.
- **D-03:** Extend `apps/ui/sources/sync/domains/state/persistence.ts` with `loadLastAckedSeq(accountId)` and `saveLastAckedSeq(accountId, seq)` — per-account key (not per-session), since the ack cursor is per-connection. Follows the exact same `getPersistenceStorage()` MMKV pattern as `loadSessionMaterializedMaxSeqById` / `saveSessionMaterializedMaxSeqById`.
- **D-04:** Three-plan TDD split:
  - **Plan A (RED):** Write all failing tests for MOB-01 through MOB-10 in `engine/resilience/*.spec.ts` (unit tests for dedup filter, ack cursor, replay gate) and integration-level tests for the wired reconnect flow.
  - **Plan B (GREEN core):** Implement `engine/resilience/` module — dedup filter, ack emit + debounce, replay gate, `resumeViaChanges` deduplication guard — to pass MOB-01 through MOB-10 unit/module tests.
  - **Plan C (GREEN integration):** Wire into `apiSocket.ts` (socket event listeners, reconnect-resume emit), `sync.ts` (isReplaying flag, AppState background flush, foreground reconnect), and `persistence.ts` (lastAckedSeq load/save) to pass all integration tests.

### Claude's Discretion

- Exact MMKV key string for `lastAckedSeq` (e.g., `'resilience-last-acked-seq'`) — follow existing key naming in `persistence.ts`.
- Whether the dedup filter is a `Set<number>` or a `seq <= lastAckedSeq` comparison — Claude decides based on what satisfies both socket replay and HTTP catch-up paths (MOB-02).
- How `runWithInFlightDedupe` (already in codebase at `apps/ui/sources/sync/runtime/orchestration/runWithInFlightDedupe.ts`) is used to enforce the MOB-10 single-in-flight constraint.
- Whether `ack-update` debounce timer lives in `engine/resilience/` or is managed by `sync.ts` — follow the `scheduleChangesCursorFlush` pattern for consistency.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MOB-01 | Client emits `reconnect-resume` with `lastAckedSeq` on every socket reconnect | `apiSocket.onReconnected()` callback at sync.ts:3305 is the correct hook point; emit via `socket.emit(SOCKET_RESILIENCE_EVENTS.RECONNECT_RESUME, { sessionId, lastAckedSeq })` |
| MOB-02 | Dedup filter applies to both socket replay and HTTP catch-up paths | Dedup must gate the `handleUpdate` pipeline in `engine/socket/socket.ts` and the `resumeViaChanges` HTTP path; `seq <= lastAckedSeq` comparison is simpler and sufficient for monotonic seq |
| MOB-03 | Debounced `ack-update` after `materializedMaxSeq` coalescer applies batch | `markSessionMaterializedMaxSeq` callback in `engine/socket/socket.ts` is called after coalesced apply; hook debounce there; `ACK_DEBOUNCE_MS = 500` from protocol |
| MOB-04 | Persist `lastAckedSeq` to MMKV | Extend `persistence.ts` following `loadSessionMaterializedMaxSeqById` / `saveSessionMaterializedMaxSeqById` pattern; MMKV key: `'resilience-last-acked-seq-v1'` (per-account, kebab-case) |
| MOB-05 | Flush pending acks synchronously on background transition | Background handler at sync.ts:~404 already flushes `pendingSettings` and `changesCursor` synchronously; add `saveLastAckedSeq` + emit pending `ack-update` in the same block |
| MOB-06 | Force-reconnect on foreground regardless of `socket.connected` | Current foreground handler calls `apiSocket.connect()` — this only connects if disconnected. Must add an explicit `apiSocket.disconnect()` before `apiSocket.connect()` in the foreground path |
| MOB-07 | Gate outbound server commits during replay; drain after `replay-complete` | `pendingQueueV2.ts` uses `runPendingEnqueueCommitInOrder`; add `isReplaying` gate check in `enqueuePendingMessageV2` before HTTP commit; register `replay-complete` listener in `apiSocket.ts` to clear flag and drain |
| MOB-08 | `buffer-overflow` → immediate `resumeViaChanges`, skip replay | Register listener for `SOCKET_RESILIENCE_EVENTS.BUFFER_OVERFLOW` in `apiSocket.ts`; call `resumeViaChanges` via `fireAndForget`; `isReplaying` flag still cleared by subsequent `replay-complete` |
| MOB-09 | Proactive gap check on `retentionStart` > `lastAckedSeq + 1` | Server emits `replay-start` with `{ retentionStart }` before replay messages; listen for `SOCKET_RESILIENCE_EVENTS.REPLAY_START`; compare `retentionStart > lastAckedSeq + 1` and trigger `resumeViaChanges` if gap detected |
| MOB-10 | Single in-flight `resumeViaChanges` per session per reconnect cycle | `runWithInFlightDedupe` already imported and used in `sync.ts` for `resumeSync`; apply same pattern to `resumeViaChanges` using a per-reconnect-cycle in-flight ref on the `Sync` class |

</phase_requirements>

---

## Summary

Phase 9 wires the client side of the reconnect-resume resilience loop in the React Native/web app. All server-side infrastructure (Phase 8) is complete: the server emits `replay-start` (with `retentionStart`), replays buffered messages, optionally emits `buffer-overflow`, and always emits `replay-complete`. The client must now: (1) emit `reconnect-resume` on every socket reconnect, (2) deduplicate replayed messages before writing to Zustand, (3) persist the ack cursor to MMKV, (4) flush acks on background, (5) force-reconnect on foreground, (6) gate outbound server commits during replay, (7) handle `buffer-overflow` and gap detection proactively, and (8) ensure single-in-flight `resumeViaChanges` per reconnect cycle.

The codebase already has all the necessary primitives: `apiSocket.onReconnected()`, `getPersistenceStorage()` MMKV, `runWithInFlightDedupe`, `AppState` handlers, `scheduleChangesCursorFlush`/`flushChangesCursorNow` pattern, and `markSessionMaterializedMaxSeq` coalescer callback. Phase 9 adds a new `engine/resilience/` module, extends `persistence.ts`, and wires the existing hooks together. No new external dependencies are required.

The TDD plan split (RED → GREEN core → GREEN integration) is locked in D-04. Research confirms all integration points exist in the codebase and no blocking gaps were found.

**Primary recommendation:** Implement `engine/resilience/` as pure TS functions with no React Native runtime dependencies so they can be unit-tested directly in Vitest without stubs.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Reconnect-resume emit (MOB-01) | Mobile client — `apiSocket.ts` | `sync.ts` (wires `onReconnected`) | Socket event emission belongs in the socket layer; `sync.ts` registers the hook |
| Inbound dedup filter (MOB-02) | Mobile client — `engine/resilience/` | `engine/socket/socket.ts` (apply path) | Pure logic module; socket apply path calls into it |
| Ack-update debounce emit (MOB-03) | Mobile client — `engine/resilience/` | `sync.ts` (schedules via coalescer callback) | Mirrors `scheduleChangesCursorFlush` pattern; debounce state lives in `Sync` class |
| MMKV ack cursor persistence (MOB-04) | Mobile client — `persistence.ts` | `sync.ts` (loads/saves on lifecycle) | All MMKV access is centralized in `persistence.ts` |
| Background ack flush (MOB-05) | Mobile client — `sync.ts` AppState handler | `persistence.ts` (`saveLastAckedSeq`) | The existing background flush block in `sync.ts` is the natural location |
| Force-reconnect on foreground (MOB-06) | Mobile client — `sync.ts` AppState handler | `apiSocket.ts` (disconnect/connect) | Foreground logic is already in the AppState handler block |
| Replay gate on outbound queue (MOB-07) | Mobile client — `engine/resilience/` + `pendingQueueV2.ts` | `apiSocket.ts` (`replay-complete` listener) | Gate check is a pure boolean; drain is triggered by socket event |
| Buffer-overflow fallback (MOB-08) | Mobile client — `apiSocket.ts` + `sync.ts` | `engine/resilience/` | Socket listener in `apiSocket.ts`; `resumeViaChanges` called via `sync.ts` |
| Proactive gap detection (MOB-09) | Mobile client — `apiSocket.ts` + `engine/resilience/` | `sync.ts` | `replay-start` listener compares `retentionStart` to `lastAckedSeq`; triggers `resumeViaChanges` |
| Single-in-flight dedup (MOB-10) | Mobile client — `sync.ts` | `engine/resilience/` | `runWithInFlightDedupe` already used for `resumeSync`; same pattern for `resumeViaChanges` in reconnect cycle |

---

## Standard Stack

### Core (all already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `react-native-mmkv` | existing | Synchronous MMKV persistence | Already used for all mobile persistence in `persistence.ts` [VERIFIED: codebase grep] |
| `socket.io-client` | existing | Socket.IO client transport | Already used in `apiSocket.ts` [VERIFIED: codebase grep] |
| `@happier-dev/protocol` | local workspace | Shared event constants and schemas | Phase 6 output: `SOCKET_RESILIENCE_EVENTS`, `ReconnectResumeRequestSchema`, `AckUpdateRequestSchema`, `ACK_DEBOUNCE_MS` [VERIFIED: packages/protocol/src/socketResilience.ts] |
| `vitest` | existing | Test runner | Already configured in `apps/ui/vitest.config.ts` [VERIFIED: file read] |

### Supporting (already in project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zustand` | existing | State management store | All state mutations go through `storage.getState()` |
| `runWithInFlightDedupe` | local utility | Single-in-flight guard | MOB-10: wraps `resumeViaChanges` per reconnect cycle [VERIFIED: runtime/orchestration/runWithInFlightDedupe.ts] |
| `fireAndForget` | local utility | Fire-and-forget promise wrapper | Socket event emissions; existing pattern throughout `sync.ts` [VERIFIED: codebase grep] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `seq <= lastAckedSeq` dedup | `Set<number>` sliding window | `Set` handles out-of-order but wastes memory; monotonic seq makes `<= lastAckedSeq` correct and zero-allocation |
| Debounce in `engine/resilience/` | Debounce managed in `sync.ts` | User constraint (Claude's discretion) says follow `scheduleChangesCursorFlush` pattern — debounce timer ref on `Sync` class is the consistent choice |

**Installation:** No new packages required.

---

## Architecture Patterns

### System Architecture Diagram

```
Socket.IO reconnect event
        │
        ▼
apiSocket.onReconnected()  ──────────────────────┐
        │                                         │
        ▼                                         │
sync.ts onReconnected handler                     │
  1. set isReplaying = true                       │
  2. load lastAckedSeq from MMKV                  │
  3. emit reconnect-resume ─────────────────► SERVER
        │                                         │
        ▼                                  SERVER sends:
apiSocket.ts registers listeners:          - replay-start { retentionStart }
  ┌─ replay-start ─► gap check ────────────┼── replay messages (UPDATE events)
  │   retentionStart > lastAckedSeq+1?     │   - buffer-overflow (if cap hit)
  │   YES → trigger resumeViaChanges       │   - replay-complete (always)
  │                                         │
  ├─ UPDATE events ─► dedup filter          │
  │   seq > lastAckedSeq?                   │
  │   YES → apply to Zustand                │
  │       → update lastAckedSeq in memory   │
  │       → schedule ack-update debounce    │
  │   NO  → silently drop                   │
  │                                         │
  ├─ buffer-overflow ─► resumeViaChanges ◄──┘
  │   (MOB-08)         runWithInFlightDedupe
  │
  └─ replay-complete ─► clear isReplaying = false
                        drain pendingQueueV2 (outbound server commits)

AppState background transition:
  sync.ts handler
  ├─ saveLastAckedSeq(accountId, lastAckedSeq) [synchronous MMKV]
  └─ flush pending ack-update immediately (clearTimeout + socket.emit)

AppState foreground transition:
  sync.ts handler
  ├─ apiSocket.disconnect() [force close zombie]
  └─ apiSocket.connect()    [fresh reconnect]
      └─ triggers onReconnected above
```

### Recommended Project Structure
```
apps/ui/sources/sync/
├── engine/
│   └── resilience/                    # NEW — D-01
│       ├── dedupFilter.ts             # seq dedup logic (MOB-02)
│       ├── dedupFilter.spec.ts        # unit tests
│       ├── ackCursorManager.ts        # debounced ack-update emit (MOB-03)
│       ├── ackCursorManager.spec.ts   # unit tests
│       ├── replayGate.ts              # isReplaying flag + queue drain (MOB-07)
│       └── replayGate.spec.ts         # unit tests
├── domains/state/
│   └── persistence.ts                 # EXTEND: loadLastAckedSeq, saveLastAckedSeq (D-03)
├── api/session/
│   └── apiSocket.ts                   # EXTEND: reconnect-resume emit, replay-start/complete/overflow listeners
└── sync.ts                            # EXTEND: isReplaying flag, AppState handlers, foreground reconnect
```

### Pattern 1: MMKV Persistence (per-account key)

Following the exact template of `loadSessionMaterializedMaxSeqById` / `saveSessionMaterializedMaxSeqById`:

```typescript
// Source: apps/ui/sources/sync/domains/state/persistence.ts (VERIFIED: file read)
function lastAckedSeqKey(): string {
    return 'resilience-last-acked-seq-v1';
}

export function loadLastAckedSeq(accountId: string): number {
    const mmkv = getPersistenceStorage();
    const raw = mmkv.getString(lastAckedSeqKey());
    if (!raw) return 0;
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 0;
        const value = (parsed as Record<string, unknown>)[accountId];
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
            return Math.floor(value);
        }
        return 0;
    } catch {
        return 0;
    }
}

export function saveLastAckedSeq(accountId: string, seq: number): void {
    const mmkv = getPersistenceStorage();
    const raw = mmkv.getString(lastAckedSeqKey());
    let existing: Record<string, number> = {};
    try {
        const parsed: unknown = raw ? JSON.parse(raw) : null;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            existing = parsed as Record<string, number>;
        }
    } catch { /* ignore */ }
    mmkv.set(lastAckedSeqKey(), JSON.stringify({ ...existing, [accountId]: seq }));
}
```

### Pattern 2: Debounced Flush (follow scheduleChangesCursorFlush)

```typescript
// Source: apps/ui/sources/sync/sync.ts:3340 (VERIFIED: file read)
// Template for debounced ack-update emission:
private scheduleAckUpdateFlush(): void {
    this.ackUpdateDirty = true;
    if (this.ackUpdateFlushTimer) return;
    this.ackUpdateFlushTimer = setTimeout(() => {
        this.ackUpdateFlushTimer = null;
        if (!this.ackUpdateDirty) return;
        this.ackUpdateDirty = false;
        // emit ack-update with current lastAckedSeq
    }, ACK_DEBOUNCE_MS); // 500ms from protocol
}

private flushAckUpdateNow(): void {
    if (this.ackUpdateFlushTimer) {
        clearTimeout(this.ackUpdateFlushTimer);
        this.ackUpdateFlushTimer = null;
    }
    if (!this.ackUpdateDirty) return;
    this.ackUpdateDirty = false;
    // emit ack-update synchronously
}
```

### Pattern 3: Single-in-flight with runWithInFlightDedupe

```typescript
// Source: apps/ui/sources/sync/runtime/orchestration/runWithInFlightDedupe.ts (VERIFIED: file read)
// Template for MOB-10 resumeViaChanges dedup per reconnect cycle:
private resumeViaChangesInFlight: Promise<'ok' | 'fallback'> | null = null;

private resumeViaChangesDeduped(opts: { accountId: string }): Promise<'ok' | 'fallback'> {
    return runWithInFlightDedupe(
        {
            get: () => this.resumeViaChangesInFlight,
            set: (v) => { this.resumeViaChangesInFlight = v; },
        },
        () => this.resumeViaChanges(opts),
    );
}
```

### Pattern 4: Dedup Filter (seq comparison)

```typescript
// Source: ASSUMED from monotonic seq guarantee + existing lastAckedSeq tracking
// A simple threshold comparison is sufficient since seq is monotonically increasing:
export function shouldApplyUpdate(seq: number, lastAckedSeq: number): boolean {
    return seq > lastAckedSeq;
}
// This covers both socket replay (seq <= lastAckedSeq → drop) and HTTP catch-up
// (same check applies to every incoming UpdateContainer).
```

### Anti-Patterns to Avoid

- **Gating optimistic Zustand updates:** `isReplaying` gates only the HTTP server-commit flush in `pendingQueueV2`. Never block Zustand store writes — the UI must remain responsive during replay (D-02).
- **Using `socket.connected` to skip foreground reconnect:** iOS can leave zombie WebSocket connections. Always `disconnect()` + `connect()` on foreground regardless of reported state (MOB-06).
- **Storing `lastAckedSeq` per-session:** The ack cursor is per-user connection, not per-session. Use a per-account key in MMKV (D-03).
- **Triggering `resumeViaChanges` without dedup guard:** Both MOB-08 and MOB-09 can fire in the same reconnect cycle. Without `runWithInFlightDedupe`, two concurrent HTTP catch-up calls will race and potentially apply updates twice.
- **Treating `replay-complete` as path-conditional:** The server sends `replay-complete` in all three paths (empty buffer, normal replay, overflow replay). The client must clear `isReplaying` unconditionally on receiving this event (from Phase 8 specifics).
- **Listening for `retentionStart` in `replay-complete`:** The server emits `retentionStart` in `REPLAY_START`, not `REPLAY_COMPLETE`. The gap check must happen on `SOCKET_RESILIENCE_EVENTS.REPLAY_START`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Single-in-flight async guard | Custom mutex/lock | `runWithInFlightDedupe` at `runtime/orchestration/runWithInFlightDedupe.ts` | Already in codebase, handles cleanup in `finally` block; tested |
| Debounce timer | Custom debounce utility | `setTimeout` + timer ref on `Sync` class | Exact pattern used for `scheduleChangesCursorFlush` and `scheduleChangesCursorFlush` — consistent |
| Fire-and-forget | Naked `.then()` | `fireAndForget(promise, { tag: '...' })` | Existing utility used throughout `sync.ts`; provides logging/error boundary |
| MMKV storage access | New MMKV instance | `getPersistenceStorage()` from `persistence.ts` | Scoped singleton; handles `EXPO_PUBLIC_HAPPY_STORAGE_SCOPE` correctly |

**Key insight:** Every primitive needed for Phase 9 already exists in the codebase. The work is entirely about connecting existing pieces, not building new infrastructure.

---

## Common Pitfalls

### Pitfall 1: `replay-complete` event shape
**What goes wrong:** Code checks `event.retentionStart` on `replay-complete` but the server does not include `retentionStart` in the `replay-complete` payload shape (it only carries it in `REPLAY_COMPLETE` for the non-overflow paths as an informational field).
**Why it happens:** CONTEXT.md says "retentionStart arrives before replay messages" — this is sent in `REPLAY_START`, not `REPLAY_COMPLETE`.
**How to avoid:** Listen for `SOCKET_RESILIENCE_EVENTS.REPLAY_START` for the `retentionStart` value. `REPLAY_COMPLETE` just triggers gate release.
**Warning signs:** MOB-09 test always falls through to the reactive path instead of proactive detection.

### Pitfall 2: Double `resumeViaChanges` trigger
**What goes wrong:** `buffer-overflow` (MOB-08) fires, then `replay-start` with a gap (MOB-09) also fires in the same reconnect cycle. Without `runWithInFlightDedupe`, two HTTP catch-up calls run concurrently and apply the same changes twice.
**Why it happens:** The server emits both `BUFFER_OVERFLOW` and `REPLAY_START` before `REPLAY_COMPLETE` when a buffer gap exists (see `resilienceHandler.ts`: overflow is emitted before replay, then `REPLAY_COMPLETE` closes).
**How to avoid:** Both MOB-08 and MOB-09 handlers call the same `resumeViaChangesDeduped()` wrapper.
**Warning signs:** Duplicate messages appear in Zustand after a simulated buffer-overflow + gap reconnect.

### Pitfall 3: `isReplaying` flag cleared too early
**What goes wrong:** `isReplaying` is cleared when `buffer-overflow` is received (since the client skips socket replay) instead of waiting for `replay-complete`. Outbound commits drain before `resumeViaChanges` completes.
**Why it happens:** MOB-08 says "skip socket replay for that reconnect cycle" — but `replay-complete` still arrives after `buffer-overflow` (server always sends it). The gate release signal is `replay-complete`, not `buffer-overflow`.
**How to avoid:** Never clear `isReplaying` on `buffer-overflow`. Only clear it on `replay-complete`.
**Warning signs:** Client sends pending commits to server while `resumeViaChanges` HTTP call is still in-flight.

### Pitfall 4: `onReconnected` fires on first connect
**What goes wrong:** Code that reads `lastAckedSeq` and emits `reconnect-resume` in `onReconnected` fires on the very first socket connection, before any messages have been received. This sends seq=0 unnecessarily.
**Why it happens:** `apiSocket.ts` has `onReconnected` which fires only after a disconnect-reconnect cycle (not first connect) — confirmed by test at line 183 of `apiSocket.reconnectSemantics.test.ts`. This is safe as-is.
**How to avoid:** Confirm by reading test: `it('fires onReconnected only after a transport outage cycle'...)` — `onReconnected` does NOT fire on first connect. No special handling needed.
**Warning signs:** Server receives `reconnect-resume` with `lastAckedSeq=0` immediately after fresh connect.

### Pitfall 5: MMKV key collision with session-scoped data
**What goes wrong:** Using a per-account key that collides with existing session-scoped keys or forgetting the `-v1` versioning suffix.
**Why it happens:** `persistence.ts` has many keys; existing pattern is `'session-materialized-max-seq-v1'`, `'changes-cursor-by-account-id-v1'` etc.
**How to avoid:** Use `'resilience-last-acked-seq-v1'` — kebab-case, descriptive, versioned. Store as `Record<accountId, number>` JSON blob to match existing per-account patterns.
**Warning signs:** TypeScript compiles but wrong data is loaded on startup.

### Pitfall 6: Vitest stub requirement for `react-native-mmkv`
**What goes wrong:** Tests in `engine/resilience/*.spec.ts` that import `persistence.ts` fail because `react-native-mmkv` is not available in the Vitest node environment.
**Why it happens:** `vitest.config.ts` already stubs `react-native-mmkv` via `{ find: 'react-native-mmkv', replacement: resolve('./sources/dev/reactNativeMmkvStub.ts') }`.
**How to avoid:** Unit tests for the `engine/resilience/` helpers should NOT import `persistence.ts` directly. Instead, `loadLastAckedSeq`/`saveLastAckedSeq` are injected as parameters — pure functions only in the module. Tests that need persistence call it via the mock stub.
**Warning signs:** `TypeError: Cannot read properties of undefined (reading 'getString')` in vitest.

---

## Code Examples

### Server event sequence the client receives
```
// Source: apps/server/sources/app/api/socket/resilienceHandler.ts (VERIFIED: file read)
// On buffer non-empty, with gap:
server → client: REPLAY_START    { retentionStart: 42 }  // MOB-09 gap check here
server → client: BUFFER_OVERFLOW                          // MOB-08 trigger here
server → client: UPDATE          { seq: 42, ... }         // replayed messages
server → client: UPDATE          { seq: 43, ... }
server → client: REPLAY_COMPLETE { retentionStart: 42 }   // MOB-07 gate release here

// On empty buffer:
server → client: REPLAY_COMPLETE { retentionStart: null } // gate release immediately
```

### apiSocket.ts extension points
```typescript
// Source: apps/ui/sources/sync/api/session/apiSocket.ts (VERIFIED: file read)
// onReconnected is already implemented and fires only after disconnect-reconnect cycles.
// Add resilience listeners in the socket initialization block:

// Emit reconnect-resume on reconnect (MOB-01):
apiSocket.onReconnected(() => {
    const lastAckedSeq = loadLastAckedSeq(accountId);
    fireAndForget(
        socket.emit(SOCKET_RESILIENCE_EVENTS.RECONNECT_RESUME, { sessionId, lastAckedSeq }),
        { tag: 'apiSocket.reconnect-resume' }
    );
    sync.isReplaying = true;
});

// replay-start listener (MOB-09):
socket.on(SOCKET_RESILIENCE_EVENTS.REPLAY_START, ({ retentionStart }) => {
    if (retentionStart !== null && retentionStart > lastAckedSeq + 1) {
        fireAndForget(sync.resumeViaChangesDeduped({ accountId }), { tag: 'apiSocket.gap-detected' });
    }
});

// buffer-overflow listener (MOB-08):
socket.on(SOCKET_RESILIENCE_EVENTS.BUFFER_OVERFLOW, () => {
    fireAndForget(sync.resumeViaChangesDeduped({ accountId }), { tag: 'apiSocket.buffer-overflow' });
});

// replay-complete listener (MOB-07):
socket.on(SOCKET_RESILIENCE_EVENTS.REPLAY_COMPLETE, () => {
    sync.isReplaying = false;
    sync.drainPendingQueue(); // signal pendingQueueV2 to flush held commits
});
```

### pendingQueueV2 gate check (MOB-07)
```typescript
// Source: apps/ui/sources/sync/engine/pending/pendingQueueV2.ts (VERIFIED: file read)
// In enqueuePendingMessageV2, inside runPendingEnqueueCommitInOrder:
await runPendingEnqueueCommitInOrder(sessionId, async () => {
    // MOB-07: hold server commit flush while replay is in progress
    if (sync.isReplaying) {
        // Optimistic store update already applied; just don't POST to server yet.
        // pendingQueueV2 naturally retries when drainPendingQueue() is called.
        return;
    }
    // ... existing HTTP POST logic
});
```

### Vitest test file pattern for resilience module
```typescript
// Source: apps/ui/sources/sync/api/session/apiSocket.reconnectSemantics.test.ts (VERIFIED: file read)
// Pattern: vi.mock() for external deps, createTransportController() for socket lifecycle,
// settleAsyncWork() to drain microtask queue, advanceUntil() for timer-based assertions.
// New tests in engine/resilience/*.spec.ts should be pure unit tests with no socket mocking.
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Socket.IO `connectionStateRecovery` | Application-level buffer + `reconnect-resume` | Decided in REQUIREMENTS.md | CSR silently fails after server restart; app-level buffer is mandatory path |
| Reactive gap detection (wait for gap event) | Proactive gap detection via `retentionStart` (MOB-09) | Phase 8/9 design | Client detects gap before applying any replay messages, not after |
| Single-cursor ack | Per-account MMKV ack cursor | Phase 9 design | Survives iOS process kill; scoped per account |

**Deprecated/outdated:**
- Socket.IO `connectionStateRecovery`: Out of scope for v1.3 per REQUIREMENTS.md. Do not reference or plan around it.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `seq <= lastAckedSeq` comparison is sufficient for dedup since seq is monotonically increasing | Standard Stack / Code Examples | If seq is not monotonic (e.g., out-of-order delivery), a `Set<number>` sliding window would be needed. Server uses a simple incrementing integer; risk is LOW. |
| A2 | `REPLAY_COMPLETE` payload contains `retentionStart` but the gate-release logic should ignore it | Code Examples | If retentionStart is NOT in `replay-complete` in all paths, MOB-09 gap check on `replay-complete` would miss it — but research confirms gap check belongs on `REPLAY_START` anyway. |

**All other claims are VERIFIED from direct codebase inspection.**

---

## Open Questions

1. **`sessionId` for `reconnect-resume` emit**
   - What we know: `ReconnectResumeRequestSchema` requires `{ sessionId, lastAckedSeq }`. The `lastAckedSeq` is per-account (not per-session). The server's `resilienceHandler.ts` uses `userId` from the socket context (not `sessionId`) as the buffer key.
   - What's unclear: What `sessionId` value is expected in the `reconnect-resume` payload? The server `readBuffer` is keyed by `userId` + `connectionKey`, not `sessionId`. Looking at `resilienceHandler.ts`, `sessionId` in the request is not used for buffer lookup — only `userId` (from socket auth) is used.
   - Recommendation: Pass the active `sessionId` if one exists; otherwise pass an empty string or omit. The server ignores it for buffer lookup. Confirm with Phase 8 implementation before writing tests.

2. **`drainPendingQueue` mechanism**
   - What we know: `pendingQueueV2.ts` uses `runPendingEnqueueCommitInOrder` which chains promises per sessionId. There is no explicit "drain" function.
   - What's unclear: When `isReplaying` becomes false, how does the held commit get retried? The current `runPendingEnqueueCommitInOrder` chain returns the held promise immediately (not retried on gate change).
   - Recommendation: The gate in MOB-07 should cause `enqueuePendingMessageV2` to return early WITHOUT queuing to the server. On `replay-complete`, re-trigger the outbound flush by re-calling `enqueuePendingMessageV2` for each pending queued item, or by signalling the pending sync to retry. This needs careful design in Plan B. The simplest approach: make the gate a wait-for-`replay-complete` promise rather than an early return, so the in-order promise chain naturally resumes when `isReplaying` clears.

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — all required tools, runtimes, and packages are already in the project; no new npm packages needed)

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (confirmed in `apps/ui/vitest.config.ts`) |
| Config file | `apps/ui/vitest.config.ts` |
| Quick run command | `yarn test --run sources/sync/engine/resilience/` (from `apps/ui/`) |
| Full suite command | `yarn test --run` (from `apps/ui/`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MOB-01 | Client emits `reconnect-resume` with `lastAckedSeq` on reconnect | unit (reconnect flow) | `yarn test --run sources/sync/engine/resilience/` | ❌ Wave 0 |
| MOB-02 | Dedup filter drops already-applied seq | unit (dedupFilter) | `yarn test --run sources/sync/engine/resilience/dedupFilter.spec.ts` | ❌ Wave 0 |
| MOB-03 | Debounced ack-update after coalescer applies batch | unit (ackCursorManager) | `yarn test --run sources/sync/engine/resilience/ackCursorManager.spec.ts` | ❌ Wave 0 |
| MOB-04 | `lastAckedSeq` persists across simulated app restart | unit (persistence helpers) | `yarn test --run sources/sync/engine/resilience/` | ❌ Wave 0 |
| MOB-05 | Background transition flushes ack synchronously | unit (sync AppState handler) | `yarn test --run sources/sync/engine/resilience/` | ❌ Wave 0 |
| MOB-06 | Foreground forces disconnect+reconnect regardless of state | unit (apiSocket reconnect) | `yarn test --run sources/sync/api/session/apiSocket.reconnectSemantics.test.ts` | ✅ extend |
| MOB-07 | Outbound commits held during replay; drained on `replay-complete` | unit (replayGate) | `yarn test --run sources/sync/engine/resilience/replayGate.spec.ts` | ❌ Wave 0 |
| MOB-08 | `buffer-overflow` triggers `resumeViaChanges` | unit (integration flow) | `yarn test --run sources/sync/engine/resilience/` | ❌ Wave 0 |
| MOB-09 | Gap detection triggers `resumeViaChanges` proactively | unit (integration flow) | `yarn test --run sources/sync/engine/resilience/` | ❌ Wave 0 |
| MOB-10 | Single in-flight `resumeViaChanges` per cycle | unit (runWithInFlightDedupe usage) | `yarn test --run sources/sync/engine/resilience/` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `yarn test --run sources/sync/engine/resilience/` (from `apps/ui/`)
- **Per wave merge:** `yarn test --run` (full suite from `apps/ui/`)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `sources/sync/engine/resilience/dedupFilter.spec.ts` — covers MOB-02
- [ ] `sources/sync/engine/resilience/dedupFilter.ts` — stub (RED: exported but throws)
- [ ] `sources/sync/engine/resilience/ackCursorManager.spec.ts` — covers MOB-03
- [ ] `sources/sync/engine/resilience/ackCursorManager.ts` — stub
- [ ] `sources/sync/engine/resilience/replayGate.spec.ts` — covers MOB-07
- [ ] `sources/sync/engine/resilience/replayGate.ts` — stub
- [ ] `sources/sync/engine/resilience/reconnectResume.spec.ts` — integration-level: covers MOB-01, MOB-04, MOB-05, MOB-06, MOB-08, MOB-09, MOB-10

*(No framework install needed — Vitest already configured)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Socket auth already handled by existing token layer |
| V3 Session Management | no | Session management unchanged |
| V4 Access Control | no | No new access control surface |
| V5 Input Validation | yes | Validate all inbound socket payloads with `ReconnectResumeRequestSchema.safeParse()` and `AckUpdateRequestSchema.safeParse()` from `@happier-dev/protocol` |
| V6 Cryptography | no | No new crypto operations |

### Known Threat Patterns for Mobile Socket Resilience

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Replayed stale socket events | Tampering | `seq <= lastAckedSeq` dedup filter — drop any update with seq already applied |
| Zombie socket (MOB-06) | Elevation of privilege | Force `disconnect()` + `connect()` on foreground — never trust `socket.connected` |
| Background ack loss (MOB-05) | Repudiation | Synchronous `saveLastAckedSeq` on background transition — MMKV write is synchronous, completes before iOS kills socket |
| Double `resumeViaChanges` (MOB-10) | Denial of Service | `runWithInFlightDedupe` guard — prevents concurrent HTTP catch-up requests |

---

## Sources

### Primary (HIGH confidence)
- `packages/protocol/src/socketResilience.ts` — `SOCKET_RESILIENCE_EVENTS`, `ReconnectResumeRequestSchema`, `AckUpdateRequestSchema`, `ACK_DEBOUNCE_MS` [VERIFIED: direct file read]
- `apps/server/sources/app/api/socket/resilienceHandler.ts` — server event sequence, `REPLAY_START` before `BUFFER_OVERFLOW` before messages before `REPLAY_COMPLETE` [VERIFIED: direct file read]
- `apps/server/sources/app/resilience/unackedBuffer.ts` — `readBuffer`, `ackBuffer`, buffer contract [VERIFIED: direct file read]
- `apps/ui/sources/sync/sync.ts` — `onReconnected` at line 3305, `resumeSync` at line 1974, `resumeViaChanges` at line 3365, `scheduleChangesCursorFlush` at line 3340, `AppState` handler at line 386 [VERIFIED: direct file read]
- `apps/ui/sources/sync/domains/state/persistence.ts` — `getPersistenceStorage()`, `loadSessionMaterializedMaxSeqById`, `saveSessionMaterializedMaxSeqById`, MMKV key patterns [VERIFIED: direct file read]
- `apps/ui/sources/sync/runtime/orchestration/runWithInFlightDedupe.ts` — exact API signature and implementation [VERIFIED: direct file read]
- `apps/ui/sources/sync/engine/pending/pendingQueueV2.ts` — `runPendingEnqueueCommitInOrder`, `enqueuePendingMessageV2` [VERIFIED: direct file read]
- `apps/ui/sources/sync/api/session/apiSocket.reconnectSemantics.test.ts` — test pattern for `onReconnected`, `settleAsyncWork`, `advanceUntil` [VERIFIED: direct file read]
- `apps/ui/vitest.config.ts` — Vitest configuration, stubs for `react-native-mmkv`, `@happier-dev/protocol` workspace resolution [VERIFIED: direct file read]
- `apps/ui/CLAUDE.md` — 4-space indentation, `yarn test`, `yarn typecheck` after changes, `@/` path alias [VERIFIED: system reminder]
- `.planning/phases/09-mobile-reconnect-and-deduplication/09-CONTEXT.md` — locked decisions D-01 through D-04 [VERIFIED: direct file read]

### Secondary (MEDIUM confidence)
- `.planning/REQUIREMENTS.md` — MOB-01 through MOB-10 authoritative requirement text [VERIFIED: direct file read]
- `.planning/ROADMAP.md` — Phase 9 success criteria [VERIFIED: direct file read]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified by direct file inspection
- Architecture: HIGH — all integration points located in source files with exact line numbers
- Pitfalls: HIGH — derived from direct reading of server handler logic and existing client patterns
- Test infrastructure: HIGH — vitest.config.ts read directly; stub strategy verified

**Research date:** 2026-04-22
**Valid until:** 2026-05-22 (stable; internal codebase)
