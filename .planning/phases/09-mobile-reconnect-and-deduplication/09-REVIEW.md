---
phase: 09-mobile-reconnect-and-deduplication
reviewed: 2026-04-23T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - apps/ui/sources/sync/sync.ts
  - apps/ui/sources/sync/engine/resilience/dedupFilter.ts
  - apps/ui/sources/sync/engine/resilience/ackCursorManager.ts
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 09-04: Code Review Report (gap-closure pass)

**Reviewed:** 2026-04-23
**Depth:** standard
**Files Reviewed:** 3 (phase 09-04 changes only — MOB-02, MOB-03)
**Status:** issues_found

## Summary

This review covers the phase 09-04 gap-closure changes: the `shouldApplyUpdate` dedup gate wired into `handleUpdate` (MOB-02) and the `scheduleAckUpdateFlush` + `lastAckedSeq` tracking wired into `markSessionMaterializedMaxSeq` (MOB-03).

The overall design is sound. The `seq > 0` guard correctly preserves the legacy sharing-update path (which always emits `seq = 0` from `parseUpdateContainer`). The `lastAckedSeq` is updated before calling `scheduleAckUpdateFlush`, so the closure always reads the highest value at emit time. The debounce semantics in `ackCursorManager.ts` are correct: `dirty` is set unconditionally, and the timer fires only once per debounce window, reading the latest `lastAckedSeq` via `this` closure. No critical security or data-loss issues were found.

Two warnings are raised: a stale-emit risk when a pending ack-flush timer from the prior session survives into the reconnect handler, and an implicit callback-capture contract in `scheduleAckUpdateFlush` that is safe today but fragile under refactoring. Two info items cover a missing function-level contract on `shouldApplyUpdate` and unnecessary per-call closure allocation in `markSessionMaterializedMaxSeq`.

## Warnings

### WR-01: Pending ack-flush timer from prior session may fire on new connection before RECONNECT_RESUME

**File:** `apps/ui/sources/sync/sync.ts:3332`

**Issue:** On reconnect, `onReconnected` fires synchronously and sends `RECONNECT_RESUME`. If a `setTimeout`-based ack-flush was still pending from the previous session (timer not yet fired when the disconnect happened), it will fire independently on the new socket connection. Because the emit callback closes over `this.lastAckedSeq`, the emitted value depends on whether the timer fires before or after line 3338 assigns the storage-loaded value:

- If timer fires **before** line 3338: emits the previous in-memory `lastAckedSeq` to the new connection as an `ACK_UPDATE` — before `RECONNECT_RESUME` arrives at the server.
- If timer fires **after** line 3338: emits the freshly loaded `lastAckedSeq`, which is the same value already sent in `RECONNECT_RESUME`.

In either case an `ACK_UPDATE` lands on the new connection ahead of, or interleaved with, `RECONNECT_RESUME`. If the server processes `ACK_UPDATE` as an authoritative cursor advance and `RECONNECT_RESUME` has not yet been processed, the server may use the pre-RECONNECT_RESUME value to decide replay range, potentially suppressing messages the client has not yet reapplied.

**Fix:** Cancel any pending ack-flush timer at the start of `onReconnected`, before loading from storage:

```typescript
apiSocket.onReconnected(() => {
    // MOB-D-02: set replay gate before resumeSync
    this.replayGate.isReplaying = true;
    // Cancel any leftover debounced ACK_UPDATE from previous session to avoid
    // emitting on the new connection before RECONNECT_RESUME is processed.
    if (this.ackFlushState.timer) {
        clearTimeout(this.ackFlushState.timer);
        this.ackFlushState.timer = null;
        this.ackFlushState.dirty = false;
    }
    fireAndForget(this.resumeSync('socket-reconnect'), { tag: 'Sync.resumeSync.socket-reconnect' });
    // MOB-01: emit reconnect-resume with persisted lastAckedSeq
    const accountId = storage.getState().profile?.id ?? '';
    this.lastAckedSeq = loadLastAckedSeq(accountId);
    apiSocket.send(SOCKET_RESILIENCE_EVENTS.RECONNECT_RESUME, {
        sessionId: '',
        lastAckedSeq: this.lastAckedSeq,
    });
});
```

Alternatively, add a `cancelAckFlush(state: AckFlushState)` helper to `ackCursorManager.ts` that clears and resets the state without emitting.

---

### WR-02: `scheduleAckUpdateFlush` silently drops the new emit callback when a timer is already running — safe today, fragile under refactoring

**File:** `apps/ui/sources/sync/engine/resilience/ackCursorManager.ts:12`

**Issue:** When `state.timer` is already set, `scheduleAckUpdateFlush` returns early (line 14) without recording the new `emit` callback. The function works correctly only because every call site in sync.ts passes a closure that reads `this.lastAckedSeq` at fire time — never a snapshot. If a future caller passes a closure that captures the seq value at schedule time (e.g. `() => emit(capturedSeq)`), the "first callback wins" semantics would silently emit a stale value for the entire debounce window.

This is not a bug today but it is an invisible contract violation waiting to happen.

**Fix:** Document the "first callback wins, must read value at fire time" contract explicitly in the function's JSDoc:

```typescript
/**
 * Schedules a debounced ACK_UPDATE flush.
 *
 * IMPORTANT: The `emit` callback is captured only on the FIRST call while no timer
 * is pending. Subsequent calls within the same debounce window update `dirty` but
 * do NOT replace the callback. Therefore, `emit` MUST read the cursor value
 * dynamically at fire time (e.g. via `this.lastAckedSeq`). Do NOT close over a
 * snapshot value — it will be stale by the time the timer fires.
 */
export function scheduleAckUpdateFlush(state: AckFlushState, emit: () => void): void {
```

## Info

### IN-01: `shouldApplyUpdate` places no guard on its own inputs — seq=0 safety depends entirely on the call site

**File:** `apps/ui/sources/sync/engine/resilience/dedupFilter.ts:1`

**Issue:** The function body is `return seq > lastAckedSeq`. The call site guards with `container.seq > 0` before invoking it (sync.ts:3515), so `seq = 0` never reaches the function in practice. However, the function has no JSDoc or assertion expressing this contract. A future caller that omits the outer guard could pass `seq = 0` with `lastAckedSeq = 0` and receive `false` (block the update) — silently suppressing a legacy update that should have been applied.

**Fix:** Add a one-line contract comment:

```typescript
/**
 * Returns true if the update at `seq` should be applied.
 * Precondition: seq > 0 (seq=0 is the legacy no-seq path and must be
 * handled before calling this function).
 */
export function shouldApplyUpdate(seq: number, lastAckedSeq: number): boolean {
    return seq > lastAckedSeq;
}
```

---

### IN-02: New closure allocated per `markSessionMaterializedMaxSeq` call — minor GC pressure during replay

**File:** `apps/ui/sources/sync/sync.ts:3685`

**Issue:** Each call to `markSessionMaterializedMaxSeq` that advances `lastAckedSeq` creates a new arrow function `() => { apiSocket.send(...) }` and passes it to `scheduleAckUpdateFlush`. Because `scheduleAckUpdateFlush` discards the callback when a timer is already running, these allocations are immediately eligible for GC after the first call in a debounce window. During a full replay burst (hundreds of messages processed rapidly), this creates unnecessary short-lived allocations.

**Fix:** Extract the emit callback as an instance-level arrow property to avoid per-call allocation:

```typescript
private readonly emitAckUpdate = () => {
    apiSocket.send(SOCKET_RESILIENCE_EVENTS.ACK_UPDATE, {
        sessionId: '',
        seq: this.lastAckedSeq,
    });
};

// In markSessionMaterializedMaxSeq:
if (seq > this.lastAckedSeq) {
    this.lastAckedSeq = seq;
    scheduleAckUpdateFlush(this.ackFlushState, this.emitAckUpdate);
}
```

---

_Reviewed: 2026-04-23_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
