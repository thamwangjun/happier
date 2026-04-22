# Phase 9: Mobile Reconnect and Deduplication - Pattern Map

**Mapped:** 2026-04-22
**Files analyzed:** 8 (3 new, 5 extended)
**Analogs found:** 8 / 8

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `engine/resilience/dedupFilter.ts` (NEW) | utility | transform | `engine/overrides/modelOverridePublish.ts` | role-match (pure transform) |
| `engine/resilience/ackCursorManager.ts` (NEW) | utility | event-driven | `sync.ts` `scheduleChangesCursorFlush` pattern | role-match (debounce pattern extracted) |
| `engine/resilience/replayGate.ts` (NEW) | utility | event-driven | `runtime/orchestration/runWithInFlightDedupe.ts` | role-match (gate/flag logic) |
| `engine/resilience/*.spec.ts` (NEW tests) | test | — | `engine/overrides/modelOverridePublish.test.ts`, `api/session/apiSocket.reconnectSemantics.test.ts` | exact (pure unit + socket lifecycle) |
| `domains/state/persistence.ts` (EXTEND) | utility | CRUD | self — `loadSessionMaterializedMaxSeqById` / `saveSessionMaterializedMaxSeqById` | exact |
| `api/session/apiSocket.ts` (EXTEND) | service | event-driven | self — existing `onReconnected` + `onStatusChange` pattern | exact |
| `sync/sync.ts` (EXTEND) | service | event-driven | self — `scheduleChangesCursorFlush` / `flushChangesCursorNow` + `AppState` handler | exact |
| `engine/pending/pendingQueueV2.ts` (EXTEND) | service | CRUD | self — `runPendingEnqueueCommitInOrder` + `enqueuePendingMessageV2` | exact |

---

## Pattern Assignments

### `engine/resilience/dedupFilter.ts` (NEW — utility, transform)

**Analog:** `apps/ui/sources/sync/engine/overrides/modelOverridePublish.ts`
(Pure exported functions, no class, no React Native imports — fully unit-testable in Vitest without stubs.)

**Imports pattern** (analog lines 1-3):
```typescript
// No external imports needed — pure TS logic only.
// Do NOT import persistence.ts here (would pull in react-native-mmkv and break Vitest).
// Receive lastAckedSeq as a plain number parameter.
```

**Core pattern** (analog lines 4-16, adapted):
```typescript
// Pure functions only. No module-level state.
// Follows the same signature shape as modelOverridePublish — compute + return, no side effects.

export function shouldApplyUpdate(seq: number, lastAckedSeq: number): boolean {
    // seq is monotonically increasing per RESEARCH.md §Standard Stack / Alternatives.
    // A simple threshold check is sufficient; no Set<number> needed.
    return seq > lastAckedSeq;
}
```

**Test file pattern** (`engine/resilience/dedupFilter.spec.ts`):
```typescript
// Analog: apps/ui/sources/sync/engine/overrides/modelOverridePublish.test.ts (lines 1-60)
import { describe, expect, it } from 'vitest';
import { shouldApplyUpdate } from './dedupFilter';

describe('shouldApplyUpdate', () => {
    it('returns true when seq is strictly greater than lastAckedSeq', () => {
        expect(shouldApplyUpdate(5, 4)).toBe(true);
    });
    it('returns false when seq equals lastAckedSeq (already applied)', () => {
        expect(shouldApplyUpdate(4, 4)).toBe(false);
    });
    it('returns false when seq is less than lastAckedSeq (replayed stale)', () => {
        expect(shouldApplyUpdate(3, 4)).toBe(false);
    });
});
```

---

### `engine/resilience/ackCursorManager.ts` (NEW — utility, event-driven)

**Analog:** `apps/ui/sources/sync/sync.ts` lines 3340-3363 (`scheduleChangesCursorFlush` / `flushChangesCursorNow`)

**Imports pattern:**
```typescript
import { ACK_DEBOUNCE_MS } from '@happier-dev/protocol';
// No React Native runtime imports — inject socket emit as a callback parameter.
```

**Core debounce pattern** (analog: `sync.ts` lines 3340-3363):
```typescript
// Follow the exact scheduleChangesCursorFlush / flushChangesCursorNow two-method pattern.
// Timer ref and dirty flag live on the Sync class (not inside this module).
// This module exports the pure scheduling logic; Sync class owns the timer state.

// Called after materializedMaxSeq coalescer applies a batch (MOB-03):
export function scheduleAckUpdateFlush(state: AckFlushState, emit: () => void): void {
    state.dirty = true;
    if (state.timer) return;
    state.timer = setTimeout(() => {
        state.timer = null;
        if (!state.dirty) return;
        state.dirty = false;
        emit();
    }, ACK_DEBOUNCE_MS);
}

// Called synchronously on background transition (MOB-05):
export function flushAckUpdateNow(state: AckFlushState, emit: () => void): void {
    if (state.timer) {
        clearTimeout(state.timer);
        state.timer = null;
    }
    if (!state.dirty) return;
    state.dirty = false;
    emit();
}

export type AckFlushState = {
    timer: ReturnType<typeof setTimeout> | null;
    dirty: boolean;
};

export function createAckFlushState(): AckFlushState {
    return { timer: null, dirty: false };
}
```

**Key difference from scheduleChangesCursorFlush:** The emit callback receives the current `lastAckedSeq` from the Sync class (not stored in this module). The Sync class passes it in via the `emit` callback closure.

---

### `engine/resilience/replayGate.ts` (NEW — utility, event-driven)

**Analog:** `apps/ui/sources/sync/runtime/orchestration/runWithInFlightDedupe.ts` (lines 1-23)

**Imports pattern:**
```typescript
// No imports needed — pure TS gate logic.
// runWithInFlightDedupe is used by the caller (sync.ts), not by this module.
```

**Core pattern:**
```typescript
// replayGate.ts exports a typed flag-check utility used by pendingQueueV2 gate check.
// The actual isReplaying boolean lives on the Sync class (per D-02).
// This module provides the checked gate predicate and a typed flag interface.

export type ReplayGate = {
    isReplaying: boolean;
};

export function createReplayGate(): ReplayGate {
    return { isReplaying: false };
}

// Returns true when the outbound server-commit flush should be held (MOB-07).
// Does NOT gate Zustand optimistic store updates — only HTTP server commits.
export function shouldHoldServerCommit(gate: ReplayGate): boolean {
    return gate.isReplaying;
}
```

---

### `engine/resilience/*.spec.ts` (NEW tests)

**Analogs:**
1. Pure unit tests: `engine/overrides/modelOverridePublish.test.ts` (lines 1-60) — `describe`/`it`/`expect`, no mocking needed for pure functions.
2. Socket lifecycle integration tests: `api/session/apiSocket.reconnectSemantics.test.ts` (lines 1-100) — `vi.mock`, `createTransportController()`, `settleAsyncWork()`, `advanceUntil()`.

**Pure unit test pattern** (for `dedupFilter.spec.ts`, `replayGate.spec.ts`):
```typescript
// Analog: engine/overrides/modelOverridePublish.test.ts lines 1-10
import { describe, expect, it } from 'vitest';
// NO vi.mock() needed — pure functions, no external deps.
// NO react-native-mmkv stubs needed — persistence.ts NOT imported by resilience modules.
```

**Timer-based test pattern** (for `ackCursorManager.spec.ts`):
```typescript
// Analog: apiSocket.reconnectSemantics.test.ts lines 75-95
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

// Use vi.advanceTimersByTimeAsync(ACK_DEBOUNCE_MS) to advance the debounce timer.
// Use settleAsyncWork() to drain microtask queue after timer advance.
async function settleAsyncWork() {
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    if (typeof vi.isFakeTimers === 'function' && vi.isFakeTimers()) {
        await vi.advanceTimersByTimeAsync(0);
    }
}
```

**Integration test pattern** (for `reconnectResume.spec.ts` — MOB-01, MOB-05, MOB-06, MOB-08, MOB-09, MOB-10):
```typescript
// Analog: apiSocket.reconnectSemantics.test.ts lines 29-95
// vi.mock() for apiSocket, persistence, and socket
// createTransportController() pattern to simulate connect/disconnect lifecycle
// advanceUntil() for asserting async state convergence
```

---

### `domains/state/persistence.ts` (EXTEND — utility, CRUD)

**Analog:** self — `loadSessionMaterializedMaxSeqById` / `saveSessionMaterializedMaxSeqById` (lines 737-765)

**Imports pattern** (lines 1-3 — no new imports needed):
```typescript
// getPersistenceStorage() already imported at line 99.
// No new imports required for loadLastAckedSeq / saveLastAckedSeq.
```

**Key name pattern** (analog: lines 48-54):
```typescript
// Follow existing kebab-case lowercase versioned key functions:
function sessionMaterializedMaxSeqKey(): string {        // existing analog
    return 'session-materialized-max-seq-v1';
}

// New key function to add:
function lastAckedSeqByAccountIdKey(): string {
    return 'resilience-last-acked-seq-v1';               // kebab-case, versioned, descriptive
}
```

**Load function pattern** (analog: lines 737-760):
```typescript
// Copy structure of loadSessionMaterializedMaxSeqById exactly:
export function loadLastAckedSeq(accountId: string): number {
    const mmkv = getPersistenceStorage();
    const raw = mmkv.getString(lastAckedSeqByAccountIdKey());
    if (raw) {
        try {
            const parsed: unknown = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                return 0;
            }
            const value = (parsed as Record<string, unknown>)[accountId];
            if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
                return Math.floor(value);
            }
        } catch (e) {
            console.error('Failed to parse last acked seq', e);
        }
    }
    return 0;
}
```

**Save function pattern** (analog: lines 762-765):
```typescript
// Copy structure of saveSessionMaterializedMaxSeqById exactly,
// but merge per-account rather than replacing the entire object:
export function saveLastAckedSeq(accountId: string, seq: number): void {
    const mmkv = getPersistenceStorage();
    const raw = mmkv.getString(lastAckedSeqByAccountIdKey());
    let existing: Record<string, number> = {};
    try {
        const parsed: unknown = raw ? JSON.parse(raw) : null;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            // Salvage valid numeric entries only (matches existing validation pattern).
            for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
                if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
                    existing[k] = Math.floor(v);
                }
            }
        }
    } catch { /* ignore */ }
    mmkv.set(lastAckedSeqByAccountIdKey(), JSON.stringify({ ...existing, [accountId]: Math.floor(seq) }));
}
```

**Key difference from saveSessionMaterializedMaxSeqById:** That function takes a `Record<string, number>` and replaces the whole blob. The new `saveLastAckedSeq` merges a single account entry — per D-03 ("per-account key").

---

### `api/session/apiSocket.ts` (EXTEND — service, event-driven)

**Analog:** self — `onReconnected` callback (lines 249-253), `onStatusChange` (lines 254-260)

**onReconnected wiring pattern** (lines 249-253):
```typescript
// Existing onReconnected implementation:
onReconnected = (listener: () => void) => {
    this.reconnectedListeners.add(listener);
    return () => this.reconnectedListeners.delete(listener);
};
// New socket event listeners register inside the socket initialization block,
// parallel to where onReconnected callback is already fired.
```

**Socket event listener registration pattern** (analog: lines 194-242 connect/disconnect lifecycle):
```typescript
// All new socket.on(...) listeners follow the same pattern as existing socket event wiring.
// Register in the socket initialization block; use SOCKET_RESILIENCE_EVENTS constants.
// Callbacks must be synchronous or call fireAndForget for async operations.

// Import additions at top of file:
import { SOCKET_RESILIENCE_EVENTS } from '@happier-dev/protocol';
// (fireAndForget already imported in sync.ts — confirm it is also imported in apiSocket.ts or add it)
```

**Socket event registration pattern** (new listeners to add):
```typescript
// Inside the socket initialization block, after existing socket.on(...) registrations:

socket.on(SOCKET_RESILIENCE_EVENTS.REPLAY_START, (payload: unknown) => {
    // MOB-09: proactive gap detection
    // payload shape: { retentionStart: number | null }
    this.replayStartListeners.forEach((listener) => listener(payload));
});

socket.on(SOCKET_RESILIENCE_EVENTS.BUFFER_OVERFLOW, () => {
    // MOB-08
    this.bufferOverflowListeners.forEach((listener) => listener());
});

socket.on(SOCKET_RESILIENCE_EVENTS.REPLAY_COMPLETE, () => {
    // MOB-07 gate release
    this.replayCompleteListeners.forEach((listener) => listener());
});
```

**reconnect-resume emit pattern** (uses fireAndForget — existing pattern in sync.ts line 3306):
```typescript
// In sync.ts onReconnected callback (line 3305), extend to:
apiSocket.onReconnected(() => {
    // Existing:
    fireAndForget(this.resumeSync('socket-reconnect'), { tag: 'Sync.resumeSync.socket-reconnect' });
    // New (MOB-01): set gate and emit reconnect-resume
    this.replayGate.isReplaying = true;
    const lastAckedSeq = loadLastAckedSeq(this.accountId ?? '');
    socket.emit(SOCKET_RESILIENCE_EVENTS.RECONNECT_RESUME, { sessionId: this.activeSessionId ?? '', lastAckedSeq });
});
```

---

### `sync/sync.ts` (EXTEND — service, event-driven)

**Analog:** self — multiple patterns within the same file

**AppState background flush pattern** (analog: lines 417-437):
```typescript
// EXTEND the existing background handler (lines 404-438).
// Add AFTER the existing flushChangesCursorNow() call (line 434):
try {
    // MOB-05: flush pending ack synchronously before iOS suspends the app
    flushAckUpdateNow(this.ackFlushState, () => {
        socket.emit(SOCKET_RESILIENCE_EVENTS.ACK_UPDATE, { sessionId: this.activeSessionId ?? '', seq: this.lastAckedSeq });
    });
    saveLastAckedSeq(this.accountId ?? '', this.lastAckedSeq);
} catch {
    // ignore
}
```

**AppState foreground reconnect pattern** (analog: lines 398-403 — MODIFY existing):
```typescript
// MOB-06: Replace the existing apiSocket.connect() with disconnect()+connect()
// BEFORE (current, line 399):
try {
    apiSocket.connect();
} catch { /* ignore */ }

// AFTER (MOB-06 fix — force close zombie sockets regardless of socket.connected state):
try {
    apiSocket.disconnect();
} catch { /* ignore */ }
try {
    apiSocket.connect();
} catch { /* ignore */ }
```

**resumeViaChanges dedup pattern** (analog: `resumeSync` lines 1974-1982 with `runWithInFlightDedupe`):
```typescript
// Analog: sync.ts lines 1974-1982
// resumeSync already uses runWithInFlightDedupe with { get, set } pattern.
// Add same pattern for resumeViaChanges (MOB-10):

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
// Reset resumeViaChangesInFlight = null on replay-complete (allows next reconnect cycle to run fresh).
```

**scheduleChangesCursorFlush pattern** (analog: lines 3340-3363 — template for ack debounce):
```typescript
// The ack-update debounce follows the exact same two-method structure:
//   scheduleChangesCursorFlush  →  scheduleAckUpdateFlush  (deferred emit)
//   flushChangesCursorNow       →  flushAckUpdateNow       (synchronous emit)
// Both methods use the same: timer ref + dirty flag + clearTimeout pattern.
// Timer ref name on Sync class: this.ackUpdateFlushTimer
// Dirty flag name on Sync class: this.ackUpdateDirty
```

---

### `engine/pending/pendingQueueV2.ts` (EXTEND — service, CRUD)

**Analog:** self — `runPendingEnqueueCommitInOrder` (lines 99-113) and `enqueuePendingMessageV2` (lines 277-362)

**Gate check insertion point** (lines 338-355):
```typescript
// EXTEND enqueuePendingMessageV2 inside runPendingEnqueueCommitInOrder callback.
// MOB-07: hold server-commit flush while replay is in progress.
// The Zustand optimistic update (line 327-335) MUST remain OUTSIDE the gate —
// only the HTTP POST inside runPendingEnqueueCommitInOrder is gated.

// Current (line 338):
await runPendingEnqueueCommitInOrder(sessionId, async () => {
    // ... existing HTTP POST logic
});

// Extended (MOB-07 gate):
await runPendingEnqueueCommitInOrder(sessionId, async () => {
    // Wait for replay to complete before committing to server.
    // Implemented as a Promise that resolves when isReplaying becomes false.
    // (See RESEARCH.md Open Question 2 — simplest approach: make gate a wait-for promise.)
    if (sync.replayGate.isReplaying) {
        await sync.waitForReplayComplete();   // resolves when replay-complete fires
    }
    // ... existing HTTP POST logic unchanged
});
```

**runPendingEnqueueCommitInOrder pattern** (lines 99-113):
```typescript
// This function chains promises per sessionId, ensuring ordered HTTP commits.
// The gate check must be INSIDE this callback so the chain is only blocked
// for that session, not globally.
// Do NOT add a global async barrier outside runPendingEnqueueCommitInOrder.
```

---

## Shared Patterns

### `fireAndForget` usage
**Source:** `apps/ui/sources/sync/sync.ts` lines 403, 1971, 3306
**Apply to:** All socket emit calls in `apiSocket.ts` and `sync.ts`
```typescript
// Always wrap socket emissions that return void or Promise<void>:
fireAndForget(socket.emit(SOCKET_RESILIENCE_EVENTS.RECONNECT_RESUME, payload), { tag: 'Sync.reconnect-resume' });
fireAndForget(this.resumeViaChangesDeduped({ accountId }), { tag: 'Sync.buffer-overflow.resumeViaChanges' });
```

### `runWithInFlightDedupe` — single-in-flight guard
**Source:** `apps/ui/sources/sync/runtime/orchestration/runWithInFlightDedupe.ts` lines 1-23
**Apply to:** `resumeViaChangesDeduped` in `sync.ts` (MOB-10)
```typescript
// Full implementation (23 lines, no external deps):
export function runWithInFlightDedupe<T>(
    state: { get: () => Promise<T> | null; set: (value: Promise<T> | null) => void; },
    task: () => Promise<T>
): Promise<T> {
    const existing = state.get();
    if (existing) return existing;
    const run = (async () => {
        try { return await task(); }
        finally { state.set(null); }
    })();
    state.set(run);
    return run;
}
// Call both MOB-08 (buffer-overflow) and MOB-09 (gap detection) handlers
// through the SAME resumeViaChangesDeduped() wrapper — this is what prevents
// the double-trigger race described in RESEARCH.md Pitfall 2.
```

### MMKV key naming convention
**Source:** `apps/ui/sources/sync/domains/state/persistence.ts` lines 40-58
**Apply to:** New `lastAckedSeqByAccountIdKey()` in `persistence.ts`
```typescript
// All MMKV keys follow: 'noun-noun-v1' — lowercase kebab-case with -v1 version suffix.
// Examples: 'session-materialized-max-seq-v1', 'last-changes-cursor-by-account-id-v1'
// New key: 'resilience-last-acked-seq-v1'
```

### `getPersistenceStorage()` singleton
**Source:** `apps/ui/sources/sync/domains/state/persistence.ts` lines 99-105
**Apply to:** New load/save functions in `persistence.ts`
```typescript
// Always call getPersistenceStorage() at the start of each function — never cache locally.
// The function is already a singleton; the pattern is call-per-function, not module-level var.
function getPersistenceStorage(): MMKV { ... }  // lines 99-105
```

### Vitest stub for react-native-mmkv
**Source:** `apps/ui/vitest.config.ts` (alias: `react-native-mmkv` → `./sources/dev/reactNativeMmkvStub.ts`)
**Apply to:** Test files that import `persistence.ts`
```typescript
// Per RESEARCH.md Pitfall 6: engine/resilience/*.ts modules must NOT import persistence.ts.
// Inject loadLastAckedSeq / saveLastAckedSeq as callback parameters to keep modules pure.
// Tests that need persistence behavior use the vitest stub automatically via the alias.
```

### Protocol constants import
**Source:** `packages/protocol/src/socketResilience.ts` lines 1-28
**Apply to:** All files using socket resilience events
```typescript
import {
    SOCKET_RESILIENCE_EVENTS,
    ACK_DEBOUNCE_MS,
    type ReconnectResumeRequest,
    type AckUpdateRequest,
} from '@happier-dev/protocol';
// (or from '@happier-dev/protocol/socketResilience' if direct path import preferred)
```

---

## No Analog Found

All files have analogs in the codebase. No entries.

---

## Metadata

**Analog search scope:** `apps/ui/sources/sync/` (engine, api, domains, runtime), `packages/protocol/src/`
**Files scanned:** 12 source files read directly
**Pattern extraction date:** 2026-04-22

**Critical implementation notes from pattern extraction:**

1. **Vitest purity constraint** — `engine/resilience/*.ts` modules must accept `loadLastAckedSeq`/`saveLastAckedSeq` as injected callbacks, not direct imports. Direct import of `persistence.ts` pulls in `react-native-mmkv` and breaks Vitest node environment.

2. **`replay-complete` is universal** — The server sends it in all three server paths. Client must clear `isReplaying` unconditionally on this event. Never clear `isReplaying` on `buffer-overflow` (see RESEARCH.md Pitfall 3).

3. **`runPendingEnqueueCommitInOrder` drain** — The current promise-chain architecture means the gate must be a wait-for-promise inside the callback, not an early return. An early return silently drops the commit from the chain. See RESEARCH.md Open Question 2 for the recommendation.

4. **`onReconnected` does not fire on first connect** — Confirmed by `apiSocket.reconnectSemantics.test.ts` line 183. No first-connect guard needed.

5. **4-space indentation** — `apps/ui/CLAUDE.md` specifies 4 spaces. All new files must use 4-space indentation (not 2-space).
